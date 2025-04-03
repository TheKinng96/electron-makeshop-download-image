import { contextBridge, ipcRenderer } from 'electron';
import { DownloadParams, DownloadProgress, StoreConfig } from './types';

contextBridge.exposeInMainWorld('electronAPI', {
  getDefaultFolder: () => ipcRenderer.invoke('get-default-folder'),
  selectFolder: () => ipcRenderer.invoke('select-storage-path'),
  storeImage: (config: StoreConfig) => ipcRenderer.invoke('store-image', config),
  getImage: (config: StoreConfig) => ipcRenderer.invoke('get-image', config),
  downloadImages: (params: DownloadParams) =>
    ipcRenderer.invoke('download-images', params),
  onDownloadProgress: (callback: (event: any, data: DownloadProgress) => void) =>
    ipcRenderer.on('download-progress', callback),
});
