import '../styles/main.css';
import { DownloadConfig, DownloadStatus } from '../types';

// Get DOM elements
const csvFileInput = document.getElementById('csvFile') as HTMLInputElement;
const storagePathInput = document.getElementById('storagePath') as HTMLInputElement;
const browseButton = document.getElementById('browseButton') as HTMLButtonElement;
const shopDomainInput = document.getElementById('shopDomain') as HTMLInputElement;
const startButton = document.getElementById('startButton') as HTMLButtonElement;
const cancelButton = document.getElementById('cancelButton') as HTMLButtonElement;
const statusDiv = document.getElementById('status') as HTMLDivElement;
const themeToggle = document.querySelector('.theme-controller') as HTMLInputElement;

// Handle Theme Toggle
if (themeToggle) {
  themeToggle.addEventListener('change', (event) => {
    const isChecked = (event.target as HTMLInputElement).checked;
    if (isChecked) {
      document.documentElement.setAttribute('data-theme', 'night');
    } else {
      document.documentElement.setAttribute('data-theme', 'emerald');
    }
  });

  // Optional: Set initial theme based on toggle state on load 
  // (Although data-theme="emerald" in HTML should handle the default)
  // const currentTheme = themeToggle.checked ? 'night' : 'emerald';
  // document.documentElement.setAttribute('data-theme', currentTheme);
}

// Handle CSV file selection
csvFileInput.addEventListener('change', (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) {
    showStatus(`Selected CSV file: ${file.name}`, 'success');
  }
});

// Handle storage path selection
browseButton.addEventListener('click', async () => {
  try {
    const selectedPath = await window.electron.ipcRenderer.invoke('select-storage-path');
    if (selectedPath) {
      storagePathInput.value = selectedPath;
      showStatus(`Selected storage path: ${selectedPath}`, 'success');
    }
  } catch (error) {
    showStatus('Error selecting storage path', 'error');
    console.error('Error:', error);
  }
});

// Handle start button click
startButton.addEventListener('click', async () => {
  const csvFile = csvFileInput.files?.[0];
  const storagePath = storagePathInput.value;
  const shopDomain = shopDomainInput.value;

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

  try {
    const config: DownloadConfig = {
      csvFile,
      storagePath,
      shopDomain
    };

    const result = await window.electron.ipcRenderer.invoke('start-download', config) as DownloadStatus;

    if (result.success) {
      showStatus(result.message, 'success');
    } else {
      showStatus(result.message, 'error');
    }
  } catch (error) {
    showStatus('Error starting download process', 'error');
    console.error('Error:', error);
  }
});

// Handle cancel button click
cancelButton.addEventListener('click', () => {
  // Reset form
  csvFileInput.value = '';
  storagePathInput.value = '';
  shopDomainInput.value = '';
  showStatus('Operation cancelled', 'success');
});

// Helper function to show status messages
function showStatus(message: string, type: 'success' | 'error') {
  statusDiv.textContent = message;
  statusDiv.className = `alert ${type === 'success' ? 'alert-success' : 'alert-error'} mt-4`;
  statusDiv.classList.remove('hidden');

  // Hide status after 5 seconds
  setTimeout(() => {
    statusDiv.classList.add('hidden');
  }, 5000);
} 