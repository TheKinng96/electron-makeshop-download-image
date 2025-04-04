export interface StoreConfig {
  image: string;
  productId: string;
  storagePath: string;
}

export interface DownloadProgress {
  progress: number;
  current: number;
  total: number;
  stage: 'checking' | 'downloading';
  message: string;
}

export interface ImageUrl {
  url: string;
  productId: string;
  suffix: string;
}

export interface DownloadParams {
  csvData: any[];
  sampleUrl: string;
  storagePath: string;
  selectedProductIdField: string
}

export interface SingleImageParams {
  url: string;
  productId: string;
  domainFolderPath: string;
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
      checkImages: (params: DownloadParams) => Promise<{ success: boolean; message: string; imageUrls: ImageUrl[] }>;
      downloadImages: (params: { imageUrls: ImageUrl[]; storagePath: string, sampleUrl: string }) => Promise<DownloadStatus>;
      downloadSingleImage: (params: SingleImageParams) => Promise<{ success: boolean; message: string }>;
      onDownloadProgress: (callback: (event: any, data: DownloadProgress) => void) => void;
      onDownloadComplete: (callback: (event: any, status: DownloadStatus) => void) => void;
      cancelDownload: () => void;
    };
  }
} 