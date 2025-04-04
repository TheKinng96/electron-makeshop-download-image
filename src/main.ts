import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import { StoreConfig, DownloadParams, DownloadStatus, SingleImageParams, ImageUrl } from './types';
import puppeteer, { Browser } from 'puppeteer';

let mainWindow: BrowserWindow | null = null;
process.env.ELECTRON_ENABLE_LOGGING = '1';

// Helper function to check if a file exists
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

// Function to extract domain name from URL
function extractDomainName(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (error) {
    console.error('Error extracting domain name:', error);
    return 'unknown-domain';
  }
}

// Function to check for images on a product page
async function checkProductImages(
  browser: Browser,
  url: string,
  productId: string
): Promise<ImageUrl[]> {
  const page = await browser.newPage();
  const imageUrls: ImageUrl[] = [];

  try {
    console.log('Checking images for:', url);
    await page.goto(url, { waitUntil: 'networkidle0' });

    // Find product images - check for makeshop-multi-images.akamaized.net domain
    const imgSelector = 'img[src*="makeshop-multi-images.akamaized.net"]';

    // Get all matching image elements
    const imgElements = await page.$$(imgSelector);

    if (!imgElements || imgElements.length === 0) {
      console.warn(`No images found for product ID: ${productId}`);
      return [];
    }

    console.log(`Found ${imgElements.length} images for product ID: ${productId}`);

    // Get all image URLs
    const urls = await Promise.all(
      imgElements.map(async (img) => {
        try {
          return await img.evaluate((el) => el.getAttribute('src'));
        } catch (error) {
          console.warn(`Error getting image source: ${error}`);
          return null;
        }
      })
    );

    // Filter and process valid URLs
    for (const [idx, imgSrc] of urls.entries()) {
      if (!imgSrc || !imgSrc.includes(productId)) {
        continue;
      }

      // Extract the suffix from the image filename
      let suffix = idx.toString();
      const regex = new RegExp(`${productId}(?:_(\\w+))?\\.jpg`);
      const match = imgSrc.match(regex);

      if (match && match[1]) {
        suffix = match[1];
      }

      imageUrls.push({
        url: imgSrc,
        productId,
        suffix
      });
    }

    return imageUrls;
  } finally {
    await page.close();
  }
}

// Function to download a single image
async function downloadImage(
  browser: Browser,
  imageUrl: ImageUrl,
  domainFolderPath: string
): Promise<boolean> {
  const { url, productId, suffix } = imageUrl;
  let page = await browser.newPage();

  try {
    // Generate a unique suffix that doesn't conflict with existing files
    let uniqueSuffix = suffix;
    let counter = 1;
    let filePath = path.join(domainFolderPath, `${productId}_${uniqueSuffix}.jpg`);

    // Check if file exists and update suffix until we find a unique name
    while (await fileExists(filePath)) {
      uniqueSuffix = `${suffix}_${counter}`;
      filePath = path.join(domainFolderPath, `${productId}_${uniqueSuffix}.jpg`);
      counter++;
    }

    // Download the image
    const response = await page.goto(url, { waitUntil: 'networkidle0' });
    if (!response) {
      console.warn(`Failed to fetch image: ${url}`);
      return false;
    }

    const buffer = await response.buffer();
    if (!buffer) {
      console.warn(`No image data received: ${url}`);
      return false;
    }

    // Save the image
    await fs.writeFile(filePath, buffer);
    return true;
  } catch (error) {
    console.error(`Error downloading image: ${url}`, error);
    return false;
  } finally {
    await page.close();
  }
}

// Function to process a batch of image URLs
async function processImageBatch(
  browser: Browser,
  imageUrls: ImageUrl[],
  domainFolderPath: string,
  startIndex: number,
  totalImages: number
): Promise<void> {
  let processedImages = 0;

  for (const imageUrl of imageUrls) {
    try {
      const success = await downloadImage(browser, imageUrl, domainFolderPath);

      if (success) {
        processedImages++;
      }

      // Send progress update
      const progress = Math.round(((startIndex + processedImages) / totalImages) * 100);
      mainWindow?.webContents.send('download-progress', {
        progress,
        current: startIndex + processedImages,
        total: totalImages,
        stage: 'downloading',
        message: `Downloading images (${startIndex + processedImages}/${totalImages})`
      });

      // Add a small delay to prevent overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`Error processing image for product ID ${imageUrl.productId}:`, error);
    }
  }
}

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // In development, load from the Vite dev server
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load the built files
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }
};

// Initialize app and register IPC handlers
app.whenReady().then(() => {
  createWindow();

  // Register IPC handlers
  ipcMain.handle('get-default-folder', () => {
    return app.getPath('desktop');
  });

  ipcMain.handle('select-storage-path', async () => {
    try {
      const desktopPath = app.getPath('desktop');
      const result = await dialog.showOpenDialog(mainWindow!, {
        properties: ['openDirectory', 'createDirectory'],
        defaultPath: desktopPath
      });

      if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
      }
      return null;
    } catch (error) {
      console.error('Error selecting storage path:', error);
      throw error;
    }
  });

  ipcMain.handle('get-image', async (event, config: StoreConfig) => {
    try {
      const { storagePath } = config;
      const imagePath = path.join(storagePath, 'image.png');
      const image = await fs.readFile(imagePath);
      return image;
    } catch (error) {
      console.error('Error getting image:', error);
      throw error;
    }
  });

  // Handle single image download
  ipcMain.handle('download-single-image', async (event, params: SingleImageParams): Promise<{ success: boolean; message: string }> => {
    let browser: Browser | null = null;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const imageUrls = await checkProductImages(browser, params.url, params.productId);
      if (imageUrls.length === 0) {
        return { success: false, message: `No images found for product ID: ${params.productId}` };
      }

      const success = await downloadImage(browser, imageUrls[0], params.domainFolderPath);
      return {
        success,
        message: success
          ? `Successfully downloaded image for product ID: ${params.productId}`
          : `Failed to download image for product ID: ${params.productId}`
      };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  });

  // Handle image checking process
  ipcMain.handle('check-images', async (event, params: DownloadParams): Promise<{ success: boolean; message: string; imageUrls: ImageUrl[] }> => {
    const { csvData, sampleUrl, selectedProductIdField } = params;
    const rows = csvData as Record<string, string>[];
    const headers = Object.keys(rows[0] || {});
    const productIdIndex = headers.indexOf(selectedProductIdField);

    if (productIdIndex === -1) {
      throw new Error(`Product ID field "${selectedProductIdField}" not found in CSV`);
    }

    // Extract the URL pattern from the sample URL
    const urlPattern = sampleUrl.replace(/\d{12}/, '{productId}');

    // Prepare product data
    const products = rows
      .filter(row => row[selectedProductIdField])
      .map(row => {
        const cleanProductId = row[selectedProductIdField].toString().replace(/"/g, '');
        const paddedProductId = cleanProductId.padStart(12, '0');
        return {
          url: urlPattern.replace('{productId}', paddedProductId),
          productId: paddedProductId
        };
      });

    const totalProducts = products.length;
    console.log(`Total products to check: ${totalProducts}`);

    // Send initial progress update
    mainWindow?.webContents.send('download-progress', {
      progress: 0,
      current: 0,
      total: totalProducts,
      stage: 'checking',
      message: `Checking images for ${totalProducts} products...`
    });

    // Number of concurrent browsers to use
    const CONCURRENT_BROWSERS = 4;
    const browsers: Browser[] = [];
    const allImageUrls: ImageUrl[] = [];
    let processedProducts = 0;

    try {
      // Launch multiple browsers
      for (let i = 0; i < CONCURRENT_BROWSERS; i++) {
        const browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        browsers.push(browser);
      }

      // Split products into batches for each browser
      const batchSize = Math.ceil(totalProducts / CONCURRENT_BROWSERS);
      const batches = browsers.map((browser, index) => {
        const start = index * batchSize;
        const end = Math.min(start + batchSize, totalProducts);
        return {
          browser,
          products: products.slice(start, end)
        };
      });

      // Process all batches concurrently
      await Promise.all(
        batches.map(async ({ browser, products }) => {
          for (const product of products) {
            try {
              const imageUrls = await checkProductImages(browser, product.url, product.productId);
              allImageUrls.push(...imageUrls);

              processedProducts++;

              // Send progress update
              const progress = Math.round((processedProducts / totalProducts) * 100);
              mainWindow?.webContents.send('download-progress', {
                progress,
                current: processedProducts,
                total: totalProducts,
                stage: 'checking',
                message: `Checking images (${processedProducts}/${totalProducts} products)`
              });
            } catch (error) {
              console.error(`Error checking images for product ID ${product.productId}:`, error);
              processedProducts++;
            }
          }
        })
      );

      // Send final checking progress update
      mainWindow?.webContents.send('download-progress', {
        progress: 100,
        current: totalProducts,
        total: totalProducts,
        stage: 'checking',
        message: `Found ${allImageUrls.length} images to download`
      });

      return {
        success: true,
        message: `Found ${allImageUrls.length} images to download`,
        imageUrls: allImageUrls
      };

    } finally {
      // Clean up all browsers
      await Promise.all(browsers.map(browser => browser.close().catch(console.error)));
    }
  });

  // Handle image download process
  ipcMain.handle('download-images', async (event, params: { imageUrls: ImageUrl[]; storagePath: string, sampleUrl: string }): Promise<DownloadStatus> => {
    const { imageUrls, storagePath, sampleUrl } = params;
    const totalImages = imageUrls.length;

    if (totalImages === 0) {
      return {
        success: false,
        message: 'No images to download'
      };
    }

    // Extract domain name from the first URL
    const domainName = extractDomainName(sampleUrl);
    const domainFolderPath = path.join(storagePath, domainName);

    try {
      // Create domain folder if it doesn't exist
      await fs.mkdir(domainFolderPath, { recursive: true });

      console.log(`Starting download of ${totalImages} images to ${domainFolderPath}`);

      // Send initial download progress update
      mainWindow?.webContents.send('download-progress', {
        progress: 0,
        current: 0,
        total: totalImages,
        stage: 'downloading',
        message: `Starting download of ${totalImages} images...`
      });

      // Number of concurrent browsers to use
      const CONCURRENT_BROWSERS = 4;
      const browsers: Browser[] = [];

      try {
        // Launch multiple browsers
        for (let i = 0; i < CONCURRENT_BROWSERS; i++) {
          const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
          });
          browsers.push(browser);
        }

        // Split image URLs into batches for each browser
        const batchSize = Math.ceil(totalImages / CONCURRENT_BROWSERS);
        const batches = browsers.map((browser, index) => {
          const start = index * batchSize;
          const end = Math.min(start + batchSize, totalImages);
          return {
            browser,
            imageUrls: imageUrls.slice(start, end),
            startIndex: start
          };
        });

        // Process all batches concurrently
        await Promise.all(
          batches.map(({ browser, imageUrls, startIndex }) =>
            processImageBatch(browser, imageUrls, domainFolderPath, startIndex, totalImages)
          )
        );

        // Send final progress update
        mainWindow?.webContents.send('download-progress', {
          progress: 100,
          current: totalImages,
          total: totalImages,
          stage: 'downloading',
          message: `All images downloaded successfully!`
        });

        // Send completion status
        mainWindow?.webContents.send('download-complete', {
          success: true,
          message: `All images downloaded successfully to ${domainName} folder!`
        });

        return {
          success: true,
          message: `All images downloaded successfully to ${domainName} folder!`
        };

      } finally {
        // Clean up all browsers
        await Promise.all(browsers.map(browser => browser.close().catch(console.error)));
      }

    } catch (error) {
      console.error('Error in download process:', error);
      // Send error status
      mainWindow?.webContents.send('download-complete', {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      });
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  });

  // Handle download cancellation
  ipcMain.on('cancel-download', () => {
    console.log('Download cancellation requested');
    // TODO: Implement actual cancellation logic
    // For now, we'll just let the current process complete
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
}); 