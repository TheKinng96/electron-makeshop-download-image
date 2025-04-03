import { contextBridge, ipcRenderer } from 'electron';
import { DownloadParams, DownloadProgress, StoreConfig, DownloadStatus } from './types';

contextBridge.exposeInMainWorld('electronAPI', {
  getDefaultFolder: () => ipcRenderer.invoke('get-default-folder'),
  selectFolder: () => ipcRenderer.invoke('select-storage-path'),
  storeImage: (config: StoreConfig) => ipcRenderer.invoke('store-image', config),
  getImage: (config: StoreConfig) => ipcRenderer.invoke('get-image', config),
  downloadImages: (params: DownloadParams) =>
    ipcRenderer.invoke('download-images', params),
  onDownloadProgress: (callback: (event: any, data: DownloadProgress) => void) =>
    ipcRenderer.on('download-progress', callback),
  onDownloadComplete: (callback: (event: any, status: DownloadStatus) => void) =>
    ipcRenderer.on('download-complete', callback),
  cancelDownload: () => ipcRenderer.send('cancel-download'),
});
