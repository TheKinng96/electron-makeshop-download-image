import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import { DownloadConfig } from './types';

let mainWindow: BrowserWindow | null = null;

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

app.whenReady().then(createWindow);

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

    console.log('Result', result);
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  } catch (error) {
    console.error('Error selecting storage path:', error);
    throw error;
  }
});

// Handle file download process
ipcMain.handle('start-download', async (event, config: DownloadConfig) => {
  try {
    const { storagePath, shopDomain } = config;

    // Create storage directory if it doesn't exist
    await fs.mkdir(storagePath, { recursive: true });

    // TODO: Implement CSV parsing and image download logic
    // For now, just return success
    return {
      success: true,
      message: 'Download process started successfully'
    };
  } catch (error) {
    console.error('Error in download process:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}); 