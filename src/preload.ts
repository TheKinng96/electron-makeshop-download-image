import { contextBridge, ipcRenderer } from 'electron';
import { StoreConfig } from './types';

contextBridge.exposeInMainWorld('electronAPI', {
  getDefaultFolder: () => ipcRenderer.invoke('get-default-folder'),
  selectFolder: () => ipcRenderer.invoke('select-storage-path'),
  storeImage: (config: StoreConfig) => ipcRenderer.invoke('store-image', config),
});
