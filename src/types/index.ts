export interface StoreConfig {
  image: string;
  productId: string;
  storagePath: string;
}

export interface DownloadProgress {
  progress: number;
  current: number;
  total: number;
}

export interface DownloadParams {
  csvData: any[];
  shopDomain: string;
  storagePath: string;
  selectedProductIdField: string
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
    electronAPI: {
      getDefaultFolder: () => Promise<string>;
      selectFolder: () => Promise<string | null>;
      storeImage: (config: StoreConfig) => Promise<any>;
      getImage: (config: StoreConfig) => Promise<any>;
      downloadImages: (params: DownloadParams) => Promise<DownloadStatus>;
      onDownloadProgress: (callback: (event: any, data: DownloadProgress) => void) => void;
    };
  }
} 