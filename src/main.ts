import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import { StoreConfig, DownloadParams, DownloadStatus, SingleImageParams, ImageUrl } from './types';
import puppeteer, { Browser } from 'puppeteer';

let mainWindow: BrowserWindow | null = null;
process.env.ELECTRON_ENABLE_LOGGING = '1';

// Add a cancellation flag at the top of the file
let isDownloadCancelled = false;

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
  // Check if download has been cancelled
  if (isDownloadCancelled) {
    console.log('Download cancelled, stopping image download');
    return false;
  }

  const { url, productId, suffix } = imageUrl;
  let page = await browser.newPage();

  try {
    // Create product-specific subfolder
    const productFolderPath = path.join(domainFolderPath, productId);
    await fs.mkdir(productFolderPath, { recursive: true });

    // Generate a unique suffix that doesn't conflict with existing files
    let uniqueSuffix = suffix;
    let counter = 1;
    let filePath = path.join(productFolderPath, `${productId}_${uniqueSuffix}.jpg`);

    // Check if file exists and update suffix until we find a unique name
    while (await fileExists(filePath)) {
      uniqueSuffix = `${suffix}_${counter}`;
      filePath = path.join(productFolderPath, `${productId}_${uniqueSuffix}.jpg`);
      counter++;
    }

    // Check again if download has been cancelled before starting the download
    if (isDownloadCancelled) {
      console.log('Download cancelled, stopping image download');
      return false;
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

    // Check one more time if download has been cancelled before saving
    if (isDownloadCancelled) {
      console.log('Download cancelled, stopping image download');
      return false;
    }

    // Save the image
    await fs.writeFile(filePath, buffer);
    console.log(`Successfully downloaded image for product ${productId} to ${filePath}`);
    return true;
  } catch (error) {
    console.error(`Error downloading image for product ${productId}: ${url}`, error);
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

// Helper function to create a folder for a domain
async function createDomainFolder(storagePath: string, domainName: string): Promise<string> {
  const domainFolderPath = path.join(storagePath, domainName);
  await fs.mkdir(domainFolderPath, { recursive: true });
  return domainFolderPath;
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

  // New handler for creating domain folders
  ipcMain.handle('create-domain-folder', async (event, params: { storagePath: string; domainName: string }): Promise<string> => {
    try {
      return await createDomainFolder(params.storagePath, params.domainName);
    } catch (error) {
      console.error('Error creating domain folder:', error);
      throw error;
    }
  });

  // Handle single image download
  ipcMain.handle('download-single-image', async (event, params: SingleImageParams): Promise<{ success: boolean; message: string }> => {
    const { domainFolderPath, imageUrl } = params;

    let browser: Browser | null = null;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const success = await downloadImage(browser, imageUrl, domainFolderPath);
      return {
        success,
        message: success
          ? `Successfully downloaded image for product ID: ${imageUrl.productId}`
          : `Failed to download image for product ID: ${imageUrl.productId}`
      };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  });

  // Handle image checking process
  ipcMain.handle('check-images', async (event, params: DownloadParams): Promise<{ success: boolean; message: string; imageUrls: ImageUrl[] }> => {
    // Reset cancellation flag at the start of a new download
    isDownloadCancelled = false;

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

  // Handle download cancellation
  ipcMain.on('cancel-download', () => {
    console.log('Download cancellation requested');
    isDownloadCancelled = true;
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