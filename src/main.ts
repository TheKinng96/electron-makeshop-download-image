import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import { StoreConfig, DownloadParams, DownloadStatus, SingleImageParams } from './types';
import puppeteer, { Browser } from 'puppeteer';

let mainWindow: BrowserWindow | null = null;
process.env.ELECTRON_ENABLE_LOGGING = '1';

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

// Function to download images for a single product
async function downloadProductImages(
  browser: Browser,
  params: SingleImageParams
): Promise<{ success: boolean; message: string }> {
  const { url, productId, domainFolderPath } = params;
  let page = await browser.newPage();

  try {
    console.log('Navigating to:', url);
    await page.goto(url, { waitUntil: 'networkidle0' });

    // Find product images - check for makeshop-multi-images.akamaized.net domain
    const imgSelector = 'img[src*="makeshop-multi-images.akamaized.net"]';

    // Get all matching image elements
    const imgElements = await page.$$(imgSelector);

    if (!imgElements || imgElements.length === 0) {
      console.warn(`No images found for product ID: ${productId}`);
      return { success: false, message: `No images found for product ID: ${productId}` };
    }

    console.log(`Found ${imgElements.length} images for product ID: ${productId}`);

    // Keep track of used suffixes to avoid duplicates
    const usedSuffixes = new Set<string>();
    let downloadedCount = 0;

    // Get all image URLs first to avoid page context issues
    const imageUrls = await Promise.all(
      imgElements.map(async (img) => {
        try {
          return await img.evaluate((el) => el.getAttribute('src'));
        } catch (error) {
          console.warn(`Error getting image source: ${error}`);
          return null;
        }
      })
    );

    // Filter out null values and validate URLs
    const validImageUrls = imageUrls.filter((url): url is string => {
      if (!url) return false;
      if (!url.includes(productId)) {
        console.warn(`Image source does not contain product ID: ${url}`);
        return false;
      }
      return true;
    });

    console.log(`Processing ${validImageUrls.length} valid images for product ID: ${productId}`);

    // Process each valid image URL
    for (const [idx, imgSrc] of validImageUrls.entries()) {
      try {
        // Extract the suffix from the image filename using regex.
        // Handle various patterns: productId_suffix.jpg, productId.jpg, etc.
        let suffix = idx.toString();

        // Try to extract suffix using a more flexible regex
        const regex = new RegExp(`${productId}(?:_(\\w+))?\\.jpg`);
        const match = imgSrc.match(regex);

        if (match && match[1]) {
          suffix = match[1];
        }

        // Generate a unique suffix that doesn't conflict with existing files
        let uniqueSuffix = suffix;
        let counter = 1;
        let filePath = path.join(domainFolderPath, `${productId}_${uniqueSuffix}.jpg`);

        // Check if file exists and update suffix until we find a unique name
        while (usedSuffixes.has(uniqueSuffix) || await fileExists(filePath)) {
          uniqueSuffix = `${suffix}_${counter}`;
          filePath = path.join(domainFolderPath, `${productId}_${uniqueSuffix}.jpg`);
          counter++;
        }

        usedSuffixes.add(uniqueSuffix);

        // Create a new page for each image download to avoid context issues
        await page.close();
        page = await browser.newPage();

        // Download the image by navigating to the URL
        const response = await page.goto(imgSrc, { waitUntil: 'networkidle0' });
        if (!response) {
          console.warn(`Failed to fetch image for product ID: ${productId}`);
          continue;
        }

        const buffer = await response.buffer();
        if (!buffer) {
          console.warn(`No image data received for product ID: ${productId}`);
          continue;
        }

        // Save the image with a filename that includes the product ID and unique suffix
        await fs.writeFile(filePath, buffer);
        downloadedCount++;

        console.log(`Downloaded image ${downloadedCount}/${validImageUrls.length} for product ID: ${productId}`);
      } catch (error) {
        console.error(`Error processing image ${idx + 1} for product ID ${productId}:`, error);
        // Continue with the next image even if this one fails
        continue;
      }
    }

    if (downloadedCount === 0) {
      return { success: false, message: `Failed to download any images for product ID: ${productId}` };
    }

    return {
      success: true,
      message: `Successfully downloaded ${downloadedCount} images for product ID: ${productId}`
    };
  } catch (error) {
    console.error(`Error in downloadProductImages for product ID ${productId}:`, error);
    return {
      success: false,
      message: `Error downloading images for product ID: ${productId} - ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  } finally {
    if (page) {
      await page.close().catch(console.error);
    }
  }
}

// Helper function to check if a file exists
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

// Function to process a batch of products
async function processProductBatch(
  browser: Browser,
  products: Array<{ url: string; productId: string }>,
  domainFolderPath: string,
  startIndex: number,
  totalProducts: number
): Promise<void> {
  for (const product of products) {
    try {
      const result = await downloadProductImages(browser, {
        url: product.url,
        productId: product.productId,
        domainFolderPath
      });

      if (!result.success) {
        console.warn(result.message);
      }

      // Send progress update using the total number of products
      const currentIndex = startIndex + products.indexOf(product);
      const progress = Math.round((currentIndex / totalProducts) * 100);
      mainWindow?.webContents.send('download-progress', {
        progress,
        current: currentIndex,
        total: totalProducts
      });

      // Add a small delay to prevent overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`Error processing product ID ${product.productId}:`, error);
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
      return await downloadProductImages(browser, params);
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  });

  // Handle file download process
  ipcMain.handle('download-images', async (event, params: DownloadParams): Promise<DownloadStatus> => {
    const { csvData, sampleUrl, storagePath, selectedProductIdField } = params;
    const rows = csvData as Record<string, string>[];
    const headers = Object.keys(rows[0] || {});
    const productIdIndex = headers.indexOf(selectedProductIdField);

    if (productIdIndex === -1) {
      throw new Error(`Product ID field "${selectedProductIdField}" not found in CSV`);
    }

    // Extract the URL pattern and domain name from the sample URL
    const urlPattern = sampleUrl.replace(/\d{12}/, '{productId}');
    const domainName = extractDomainName(sampleUrl);
    const domainFolderPath = path.join(storagePath, domainName);

    console.log('Using URL pattern:', urlPattern);
    console.log('Using domain folder:', domainFolderPath);

    try {
      // Create domain folder if it doesn't exist
      await fs.mkdir(domainFolderPath, { recursive: true });

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
      console.log(`Total products to process: ${totalProducts}`);

      // Number of concurrent browsers to use (adjust based on system capabilities)
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

        // Split products into batches for each browser
        const batchSize = Math.ceil(totalProducts / CONCURRENT_BROWSERS);
        const batches = browsers.map((browser, index) => {
          const start = index * batchSize;
          const end = Math.min(start + batchSize, totalProducts);
          return {
            browser,
            products: products.slice(start, end),
            startIndex: start
          };
        });

        // Process all batches concurrently
        await Promise.all(
          batches.map(({ browser, products, startIndex }) =>
            processProductBatch(browser, products, domainFolderPath, startIndex, totalProducts)
          )
        );

        // Send final progress update
        mainWindow?.webContents.send('download-progress', {
          progress: 100,
          current: totalProducts,
          total: totalProducts
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