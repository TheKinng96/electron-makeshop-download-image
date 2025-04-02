import { showStatus } from './statusUtils';

// Get Process Screen Elements
const processScreenDiv = document.getElementById('processScreen') as HTMLDivElement;
const progressStatusText = document.getElementById('progressStatusText') as HTMLDivElement;
const downloadProgressBar = document.getElementById('downloadProgressBar') as HTMLProgressElement;
const cancelProcessButton = document.getElementById('cancelProcessButton') as HTMLButtonElement;
const setupScreenDiv = document.getElementById('setupScreen') as HTMLDivElement; // Needed to re-show setup
const generalStatusDiv = document.getElementById('status') as HTMLDivElement; // For cancellation message

// Placeholder for actual progress updates
let progressInterval: number | null = null;

/**
 * Shows the processing screen and starts the placeholder progress.
 */
export function showProcessScreen() {
  if (!processScreenDiv || !setupScreenDiv || !downloadProgressBar || !progressStatusText) return;

  setupScreenDiv.classList.add('hidden');
  processScreenDiv.classList.remove('hidden');
  downloadProgressBar.value = 0;
  progressStatusText.textContent = 'Download starting...';

  // --- Placeholder Progress Simulation ---
  let currentProgress = 0;
  progressInterval = window.setInterval(() => {
    currentProgress += 10; // Increment progress
    if (currentProgress > 100) {
      currentProgress = 100;
      if (progressInterval) clearInterval(progressInterval);
      progressStatusText.textContent = 'Download completed!';
      // TODO: Add logic to handle completion (e.g., show success in general status, hide process screen?)
      // For now, just stops the progress bar
      setTimeout(() => hideProcessScreen(true, 'Download placeholder finished successfully.'), 1000);
    } else {
      progressStatusText.textContent = `Downloading... ${currentProgress}%`;
    }
    downloadProgressBar.value = currentProgress;
  }, 500); // Update every 0.5 seconds
  // --- End Placeholder --- 
}

/**
 * Hides the processing screen and shows the setup screen.
 * @param cancelled - Indicates if the process was cancelled.
 * @param message - Optional message to display in the general status area.
 */
export function hideProcessScreen(cancelled: boolean = false, message?: string) {
  if (!processScreenDiv || !setupScreenDiv) return;

  // Stop placeholder interval if running
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }

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
  // TODO: Add actual IPC call to notify the main process to cancel
  // window.electron.ipcRenderer.send('cancel-download');
  hideProcessScreen(true, 'Download cancelled by user.');
}); 