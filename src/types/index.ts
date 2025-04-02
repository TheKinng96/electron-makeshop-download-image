export interface StoreConfig {
  image: string;
  productId: string;
  storagePath: string;
}

export interface DownloadStatus {
  success: boolean;
  message: string;
  progress?: number;
}

export type StatusType = 'success' | 'error';

// Window interface for electron IPC bridge
declare global {
  interface Window {
    electron: {
      ipcRenderer: {
        invoke(channel: string, ...args: any[]): Promise<any>;
      };
    };
  }
} 