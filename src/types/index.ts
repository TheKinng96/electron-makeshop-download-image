export interface DownloadConfig {
  csvFile: File;
  storagePath: string;
  shopDomain: string;
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