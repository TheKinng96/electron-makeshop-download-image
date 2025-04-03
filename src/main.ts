import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import { StoreConfig, DownloadParams, DownloadStatus } from './types';
import puppeteer, { Browser } from 'puppeteer';

let mainWindow: BrowserWindow | null = null;
process.env.ELECTRON_ENABLE_LOGGING = '1';

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
    console.log('here')
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

    // Extract the URL pattern from the sample URL
    const urlPattern = sampleUrl.replace(/\d{12}/, '{productId}');
    console.log('Using URL pattern:', urlPattern);

    try {
      // Initialize browser
      console.log('Initializing browser');
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      const page = await browser.newPage();

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
          console.log('Navigating to:', url);
          await page.goto(url, { waitUntil: 'networkidle0' });

          // Find the product image
          const imgSelector = 'img[src*="itemimages"]';

          // Get all matching image elements
          const imgElements = await page.$$(imgSelector);

          if (!imgElements || imgElements.length === 0) {
            console.warn(`No images found for product ID: ${paddedProductId}`);
            continue;
          }

          // Loop over all found images
          for (const [idx, imgElement] of imgElements.entries()) {
            // Get the src attribute of the image
            const imgSrc = await imgElement.evaluate((el) => el.getAttribute('src'));
            if (!imgSrc) {
              console.warn(`No image source found for product ID: ${paddedProductId}`);
              continue;
            }

            // Check that the src contains "itemimages"
            if (!imgSrc.includes('itemimages')) {
              console.warn(`Image source does not contain 'itemimages': ${imgSrc}`);
              continue;
            }

            // Extract the suffix from the image filename using regex.
            // This regex captures the part after the paddedProductId and underscore, before .jpg.
            const regex = new RegExp(`${paddedProductId}_(\\w+)\\.jpg`);
            const match = imgSrc.match(regex);
            const suffix = match && match[1] ? match[1] : idx; // fallback to index if suffix not found

            // Download the image by navigating to the URL
            const response = await page.goto(imgSrc);
            if (!response) {
              console.warn(`Failed to fetch image for product ID: ${paddedProductId}`);
              continue;
            }

            const buffer = await response.buffer();
            if (!buffer) {
              console.warn(`No image data received for product ID: ${paddedProductId}`);
              continue;
            }

            // Save the image with a filename that includes the product ID and suffix
            const fileName = `${paddedProductId}_${suffix}.jpg`;
            const filePath = path.join(storagePath, fileName);
            await fs.writeFile(filePath, buffer);

            // Optionally send progress update to the renderer
            const progress = Math.round((i / (rows.length - 1)) * 100);
            mainWindow?.webContents.send('download-progress', {
              progress,
              current: i,
              total: rows.length - 1
            });
          }

        } catch (error) {
          console.error(`Error processing product ID ${productId}:`, error);
          continue;
        }
      }

      return {
        success: true,
        message: 'All images downloaded successfully!'
      };

    } catch (error) {
      console.error('Error in download process:', error);
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