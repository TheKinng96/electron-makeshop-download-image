import { showStatus } from './statusUtils';

// Get Process Screen Elements
const processScreenDiv = document.getElementById('processScreen') as HTMLDivElement;
const progressStatusText = document.getElementById('progressStatusText') as HTMLDivElement;
const downloadProgressBar = document.getElementById('downloadProgressBar') as HTMLProgressElement;
const cancelProcessButton = document.getElementById('cancelProcessButton') as HTMLButtonElement;
const setupScreenDiv = document.getElementById('setupScreen') as HTMLDivElement; // Needed to re-show setup
const generalStatusDiv = document.getElementById('status') as HTMLDivElement; // For cancellation message

/**
 * Shows the processing screen and sets up progress listeners.
 */
export function showProcessScreen() {
  if (!processScreenDiv || !setupScreenDiv || !downloadProgressBar || !progressStatusText) return;

  setupScreenDiv.classList.add('hidden');
  processScreenDiv.classList.remove('hidden');
  downloadProgressBar.value = 0;
  progressStatusText.textContent = 'Download starting...';

  // Set up progress listener
  window.electronAPI.onDownloadProgress((event: any, data: any) => {
    const { progress, current, total } = data;
    downloadProgressBar.value = progress;
    progressStatusText.textContent = `Downloading... ${progress}%`;
    if (generalStatusDiv) {
      generalStatusDiv.textContent = `Processing product ${current} of ${total}`;
    }
  });

  // Set up completion listener
  window.electronAPI.onDownloadComplete((event: any, status: any) => {
    if (status.success) {
      progressStatusText.textContent = 'Download completed!';
      downloadProgressBar.value = 100;
      setTimeout(() => hideProcessScreen(false, status.message), 1000);
    } else {
      progressStatusText.textContent = 'Download failed!';
      setTimeout(() => hideProcessScreen(true, status.message), 1000);
    }
  });
}

/**
 * Hides the processing screen and shows the setup screen.
 * @param cancelled - Indicates if the process was cancelled.
 * @param message - Optional message to display in the general status area.
 */
export function hideProcessScreen(cancelled: boolean = false, message?: string) {
  if (!processScreenDiv || !setupScreenDiv) return;

  processScreenDiv.classList.add('hidden');
  setupScreenDiv.classList.remove('hidden');
  downloadProgressBar.value = 0; // Reset progress bar

  if (message) {
    showStatus(message, cancelled ? 'error' : 'success');
  }
}

// --- Event Listeners ---

// Cancel Button Click
cancelProcessButton?.addEventListener('click', () => {
  console.log('Cancel download button clicked');
  window.electronAPI.cancelDownload();
  hideProcessScreen(true, 'Download cancelled by user.');
}); 