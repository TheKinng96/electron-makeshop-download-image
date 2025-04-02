import { DownloadConfig, DownloadStatus } from 'src/types';
import { showStatus } from './statusUtils';
import { showProcessScreen } from './processScreen';

// Get Setup Screen Elements
const setupScreenDiv = document.getElementById('setupScreen') as HTMLDivElement;
const csvFileInput = document.getElementById('csvFile') as HTMLInputElement;
const productIdFieldContainer = document.getElementById('productIdFieldContainer') as HTMLDivElement;
const productIdField = document.getElementById('productIdField') as HTMLSelectElement;
const storagePathInput = document.getElementById('storagePath') as HTMLInputElement;
const browseButton = document.getElementById('browseButton') as HTMLButtonElement;
const shopDomainInput = document.getElementById('shopDomain') as HTMLInputElement;
const startButton = document.getElementById('startButton') as HTMLButtonElement;
const statusDiv = document.getElementById('status') as HTMLDivElement;

// Function to parse CSV headers with Shift JIS encoding
async function parseCSVHeaders(file: File): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        // Convert ArrayBuffer to Uint8Array for Shift JIS decoding
        const buffer = event.target?.result as ArrayBuffer;
        const uint8Array = new Uint8Array(buffer);

        // Create a TextDecoder for Shift JIS
        const decoder = new TextDecoder('shift-jis');
        const text = decoder.decode(uint8Array);

        const headers = text.split('\n')[0].split(',').map(header => header.trim());
        resolve(headers);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read CSV file'));
    reader.readAsArrayBuffer(file); // Read as ArrayBuffer instead of text
  });
}

// Function to populate product ID field options
function populateProductIdField(headers: string[]) {
  if (!productIdField || !productIdFieldContainer) return;

  // Clear existing options except the first one
  while (productIdField.options.length > 1) {
    productIdField.remove(1);
  }

  // Add header options
  headers.forEach(header => {
    const option = document.createElement('option');
    option.value = header;
    option.textContent = header;
    productIdField.appendChild(option);
  });

  // Enable the select field and show the container
  productIdField.disabled = false;
  productIdFieldContainer.classList.remove('hidden');

  // Try to find and select '商品ID' by default
  const defaultOption = Array.from(productIdField.options).find(
    option => option.value === '商品ID'
  );
  if (defaultOption) {
    productIdField.value = defaultOption.value;
  }
}

// Handle CSV file selection
csvFileInput?.addEventListener('change', async (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file && statusDiv) {
    statusDiv.classList.add('hidden'); // Hide status on new selection

    try {
      const headers = await parseCSVHeaders(file);
      populateProductIdField(headers);
    } catch (error) {
      console.error('Error parsing CSV:', error);
      showStatus('Error parsing CSV file. Please check the file format.', 'error');
      // Reset product ID field and hide it
      if (productIdField) {
        productIdField.innerHTML = '<option value="">Select a field</option>';
        productIdField.disabled = true;
      }
      if (productIdFieldContainer) {
        productIdFieldContainer.classList.add('hidden');
      }
    }
  } else {
    // If no file is selected, hide the product ID field
    if (productIdFieldContainer) {
      productIdFieldContainer.classList.add('hidden');
    }
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
  if (!csvFileInput || !storagePathInput || !shopDomainInput || !statusDiv || !productIdField) return;

  const csvFile = csvFileInput.files?.[0];
  const storagePath = storagePathInput.value;
  const shopDomain = shopDomainInput.value;
  const selectedProductIdField = productIdField.value;

  // --- Input Validation ---
  if (!csvFile) {
    showStatus('Please select a CSV file', 'error');
    return;
  }
  if (!selectedProductIdField) {
    showStatus('Please select a product ID field', 'error');
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
  //   shopDomain,
  //   productIdField: selectedProductIdField
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