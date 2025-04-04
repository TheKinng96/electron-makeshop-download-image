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
  domainFolderPath: string;
  imageUrl: ImageUrl;
}

export interface DownloadStatus {
  success: boolean;
  message: string;
  progress?: number;
}

// Store configuration
export interface StoreConfig {
  storagePath: string;
}

// Download parameters
// export interface DownloadParams {
//   csvData: string;
//   sampleUrl: string;
//   selectedProductIdField: string;
//   storagePath: string;
// }

// Image URL information
export interface ImageUrl {
  url: string;
  productId: string;
  suffix: string;
}

// Download progress information
export interface DownloadProgress {
  progress: number;
  current: number;
  total: number;
  stage: 'checking' | 'downloading';
  message: string;
}

// Download status
export interface DownloadStatus {
  success: boolean;
  message: string;
}

// Single image download parameters
export interface SingleImageParams {
  domainFolderPath: string;
  imageUrl: ImageUrl;
}

export type StatusType = 'success' | 'error';

// Window interface for electron IPC bridge
declare global {
  interface Window {
    electronAPI: {
      checkImages: (params: DownloadParams) => Promise<{ success: boolean; message: string; imageUrls: ImageUrl[] }>;
      createDomainFolder: (params: { storagePath: string; domainName: string }) => Promise<string>;
      downloadSingleImage: (params: SingleImageParams) => Promise<{ success: boolean; message: string }>;
      getDefaultFolder: () => Promise<string>;
      selectFolder: () => Promise<string | null>;
      onDownloadProgress: (callback: (event: any, data: DownloadProgress) => void) => void;
      onDownloadComplete: (callback: (event: any, status: DownloadStatus) => void) => void;
      cancelDownload: () => void;
    };
  }
} 