import { contextBridge, ipcRenderer } from 'electron';
import { DownloadParams, DownloadProgress, StoreConfig, DownloadStatus, ImageUrl, SingleImageParams } from './types';

contextBridge.exposeInMainWorld('electronAPI', {
  checkImages: (params: DownloadParams) =>
    ipcRenderer.invoke('check-images', params),
  createDomainFolder: (params: { storagePath: string; domainName: string }) =>
    ipcRenderer.invoke('create-domain-folder', params),
  downloadSingleImage: (params: SingleImageParams) =>
    ipcRenderer.invoke('download-single-image', params),
  getDefaultFolder: () => ipcRenderer.invoke('get-default-folder'),
  selectFolder: () => ipcRenderer.invoke('select-storage-path'),

  onDownloadProgress: (callback: (event: any, data: DownloadProgress) => void) =>
    ipcRenderer.on('download-progress', callback),
  onDownloadComplete: (callback: (event: any, status: DownloadStatus) => void) =>
    ipcRenderer.on('download-complete', callback),
  cancelDownload: () => ipcRenderer.send('cancel-download'),
});
