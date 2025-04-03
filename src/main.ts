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
  const page = await browser.newPage();

  try {
    console.log('Navigating to:', url);
    await page.goto(url, { waitUntil: 'networkidle0' });

    // Find the product image
    const imgSelector = 'img[src*="itemimages"]';

    // Get all matching image elements
    const imgElements = await page.$$(imgSelector);

    if (!imgElements || imgElements.length === 0) {
      console.warn(`No images found for product ID: ${productId}`);
      return { success: false, message: `No images found for product ID: ${productId}` };
    }

    // Loop over all found images
    for (const [idx, imgElement] of imgElements.entries()) {
      // Get the src attribute of the image
      const imgSrc = await imgElement.evaluate((el) => el.getAttribute('src'));
      if (!imgSrc) {
        console.warn(`No image source found for product ID: ${productId}`);
        continue;
      }

      // Check that the src contains "itemimages"
      if (!imgSrc.includes('itemimages')) {
        console.warn(`Image source does not contain 'itemimages': ${imgSrc}`);
        continue;
      }

      // Extract the suffix from the image filename using regex.
      const regex = new RegExp(`${productId}_(\\w+)\\.jpg`);
      const match = imgSrc.match(regex);
      const suffix = match && match[1] ? match[1] : idx;

      // Download the image by navigating to the URL
      const response = await page.goto(imgSrc);
      if (!response) {
        console.warn(`Failed to fetch image for product ID: ${productId}`);
        continue;
      }

      const buffer = await response.buffer();
      if (!buffer) {
        console.warn(`No image data received for product ID: ${productId}`);
        continue;
      }

      // Save the image with a filename that includes the product ID and suffix
      const fileName = `${productId}_${suffix}.jpg`;
      const filePath = path.join(domainFolderPath, fileName);
      await fs.writeFile(filePath, buffer);
    }

    return { success: true, message: `Successfully downloaded images for product ID: ${productId}` };
  } finally {
    await page.close();
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
    let browser: Browser | null = null;
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

      // Initialize browser
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      // Process each row
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const productId = row[selectedProductIdField];

        if (!productId) continue; // Skip rows with empty product ID

        try {
          // Remove quotes and pad product ID with leading zeros to make it 12 digits
          const cleanProductId = productId.toString().replace(/"/g, '');
          const paddedProductId = cleanProductId.padStart(12, '0');
          console.log('Processing product ID:', paddedProductId);

          // Navigate to the product page using the URL pattern
          const url = urlPattern.replace('{productId}', paddedProductId);

          // Send progress update before starting the download
          const progress = Math.round((i / rows.length) * 100);
          mainWindow?.webContents.send('download-progress', {
            progress,
            current: i,
            total: rows.length
          });

          // Download images for this product
          const result = await downloadProductImages(browser!, {
            url,
            productId: paddedProductId,
            domainFolderPath
          });

          if (!result.success) {
            console.warn(result.message);
          }

          // Add a small delay to ensure UI updates are processed
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (error) {
          console.error(`Error processing product ID ${productId}:`, error);
          continue;
        }
      }

      // Send final progress update
      mainWindow?.webContents.send('download-progress', {
        progress: 100,
        current: rows.length,
        total: rows.length
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
    } finally {
      // Clean up browser
      if (browser) {
        try {
          await browser.close();
        } catch (cleanupError) {
          console.error('Error cleaning up browser:', cleanupError);
        }
      }
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