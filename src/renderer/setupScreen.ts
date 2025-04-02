import { DownloadConfig, DownloadStatus } from 'src/types';
import { showStatus } from './statusUtils';
import { showProcessScreen } from './processScreen';

// Get Setup Screen Elements
const setupScreenDiv = document.getElementById('setupScreen') as HTMLDivElement;
const csvFileInput = document.getElementById('csvFile') as HTMLInputElement;
const storagePathInput = document.getElementById('storagePath') as HTMLInputElement;
const browseButton = document.getElementById('browseButton') as HTMLButtonElement;
const shopDomainInput = document.getElementById('shopDomain') as HTMLInputElement;
const startButton = document.getElementById('startButton') as HTMLButtonElement;
const statusDiv = document.getElementById('status') as HTMLDivElement;

// Handle CSV file selection
csvFileInput?.addEventListener('change', (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file && statusDiv) {
    statusDiv.classList.add('hidden'); // Hide status on new selection
  }
});

// Handle storage path selection
browseButton?.addEventListener('click', async () => {
  if (!storagePathInput || !statusDiv) return;
  try {
    const selectedPath = await window.electron.ipcRenderer.invoke('select-storage-path');
    if (selectedPath) {
      storagePathInput.value = selectedPath;
      statusDiv.classList.add('hidden'); // Hide status on success
    }
  } catch (error) {
    showStatus('Error selecting storage path', 'error');
    console.error('Error selecting storage path:', error);
  }
});

// Handle start button click
startButton?.addEventListener('click', async () => {
  if (!csvFileInput || !storagePathInput || !shopDomainInput || !statusDiv) return;

  const csvFile = csvFileInput.files?.[0];
  const storagePath = storagePathInput.value;
  const shopDomain = shopDomainInput.value;

  // --- Input Validation ---
  if (!csvFile) {
    showStatus('Please select a CSV file', 'error');
    return;
  }
  if (!storagePath) {
    showStatus('Please select a storage path', 'error');
    return;
  }
  if (!shopDomain) {
    showStatus('Please enter a shop domain', 'error');
    return;
  }

  // Hide any previous status messages before starting
  statusDiv.classList.add('hidden');

  // --- Show Process Screen ---
  showProcessScreen();

  // --- Prepare and Send Download Config --- 
  // Note: Actual download start logic is now likely initiated
  // after showProcessScreen, potentially involving IPC communication
  // to the main process which would then send back progress updates.
  // The placeholder progress starts automatically in showProcessScreen.

  // Example: If you still need to send the config to main process
  // const config: DownloadConfig = {
  //   csvFilePath: csvFile.path, // Need file path for main process
  //   storagePath,
  //   shopDomain
  // };
  // try {
  //   // Invoke the main process to START the download
  //   await window.electron.ipcRenderer.invoke('start-download', config);
  //   // Main process should now handle the download and send progress updates
  //   // (e.g., via 'download-progress' channel)
  // } catch (error) {
  //   console.error('Error invoking start-download:', error);
  //   showStatus('Error initiating download process', 'error');
  //   hideProcessScreen(true); // Hide process screen on initiation error
  // }
});