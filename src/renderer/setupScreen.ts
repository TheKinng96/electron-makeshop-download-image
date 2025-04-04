import { showStatus } from './statusUtils';
import { showProcessScreen, hideProcessScreen } from './processScreen';
import Papa from 'papaparse';
import { ImageUrl } from '../types';

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

async function setDefaultStoragePath() {
  const defaultPath = await (window as any).electronAPI.getDefaultFolder();

  if (storagePathInput) {
    storagePathInput.value = defaultPath;
  }

  // When the "Browse" button is clicked, open the folder picker
  document.getElementById('browseButton').addEventListener('click', async () => {
    const folderPath = await (window as any).electronAPI.selectFolder();
    if (folderPath && storagePathInput) {
      storagePathInput.value = folderPath;
    }
  });
}

setDefaultStoragePath();

// Function to parse CSV headers with Shift JIS encoding
async function parseCSVHeaders(file: File): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const buffer = event.target?.result as ArrayBuffer;
        const uint8Array = new Uint8Array(buffer);
        const decoder = new TextDecoder('shift-jis');
        const text = decoder.decode(uint8Array);

        const result = Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          preview: 1 // Only parse the first row for headers
        });

        if (result.errors.length > 0) {
          reject(new Error('Error parsing CSV headers: ' + result.errors[0].message));
          return;
        }

        const headers = result.meta.fields || [];
        resolve(headers);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read CSV file'));
    reader.readAsArrayBuffer(file);
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
    const selectedPath = await (window as any).electronAPI.selectFolder();
    if (selectedPath) {
      storagePathInput.value = selectedPath;
      statusDiv.classList.add('hidden'); // Hide status on success
    }
  } catch (error) {
    showStatus('Error selecting storage path', 'error');
    console.error('Error selecting storage path:', error);
  }
});

// Function to extract domain name from URL
function extractDomainName(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (error) {
    console.error('Error extracting domain name:', error);
    return 'unknown-domain';
  }
}

// Function to download images in batches with progress tracking
async function downloadImagesInBatches(
  imageUrls: ImageUrl[],
  domainFolderPath: string,
  batchSize: number = 4
): Promise<{ successCount: number; failureCount: number }> {
  const totalImages = imageUrls.length;
  let successCount = 0;
  let failureCount = 0;
  let processedCount = 0;

  // Create progress elements
  const progressBar = document.getElementById('downloadProgressBar') as HTMLProgressElement;
  const progressText = document.getElementById('progressStatusText') as HTMLDivElement;

  // Initialize progress
  if (progressBar) progressBar.value = 0;
  if (progressText) {
    progressText.textContent = `Starting download of ${totalImages} images...`;
  }

  // Process images in batches
  for (let i = 0; i < totalImages; i += batchSize) {
    const batch = imageUrls.slice(i, i + batchSize);
    const batchPromises = batch.map(async (imageUrl) => {
      try {
        // Download the image
        const result = await window.electronAPI.downloadSingleImage({
          imageUrl,
          domainFolderPath,
        });

        // Update progress after each image
        processedCount++;
        const progress = Math.round((processedCount / totalImages) * 100);

        if (progressBar) progressBar.value = progress;
        if (progressText) {
          progressText.textContent = `Downloading images (${processedCount}/${totalImages})`;
        }

        return result.success;
      } catch (error) {
        console.error(`Error downloading image for product ID ${imageUrl.productId}:`, error);
        return false;
      }
    });

    // Wait for all images in the batch to complete
    const batchResults = await Promise.all(batchPromises);

    // Count successes and failures
    batchResults.forEach(success => {
      if (success) {
        successCount++;
      } else {
        failureCount++;
      }
    });
  }

  return { successCount, failureCount };
}

// Handle start button click
startButton?.addEventListener('click', async () => {
  if (!csvFileInput || !storagePathInput || !shopDomainInput || !statusDiv || !productIdField) return;

  const csvFile = csvFileInput.files?.[0];
  const storagePath = storagePathInput.value;
  const sampleUrl = shopDomainInput.value;
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
  if (!sampleUrl) {
    showStatus('Please enter a sample product URL', 'error');
    return;
  }

  // Validate that the sample URL contains a 12-digit product ID
  if (!/\d{12}/.test(sampleUrl)) {
    showStatus('Sample URL must contain a 12-digit product ID', 'error');
    return;
  }

  // Hide any previous status messages before starting
  statusDiv.classList.add('hidden');

  // --- Show Process Screen ---
  showProcessScreen();

  try {
    // Parse CSV file with Shift JIS encoding
    const buffer = await csvFile.arrayBuffer();
    const uint8Array = new Uint8Array(buffer);
    const decoder = new TextDecoder('shift-jis');
    const csvText = decoder.decode(uint8Array);

    const result = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true
    });

    if (result.errors.length > 0) {
      throw new Error('Error parsing CSV: ' + result.errors[0].message);
    }

    // First stage: Check for images
    const checkResult = await window.electronAPI.checkImages({
      csvData: result.data,
      sampleUrl,
      selectedProductIdField,
      storagePath
    });

    if (!checkResult.success) {
      throw new Error(checkResult.message);
    }

    if (checkResult.imageUrls.length === 0) {
      throw new Error('No images found to download');
    }

    // Create domain folder
    const domainName = extractDomainName(sampleUrl);
    const domainFolderPath = await window.electronAPI.createDomainFolder({
      storagePath,
      domainName
    });

    // Second stage: Download images in parallel batches with progress tracking
    const { successCount, failureCount } = await downloadImagesInBatches(
      checkResult.imageUrls,
      domainFolderPath,
      4 // Process 4 images concurrently
    );

    // Show final status
    if (successCount === checkResult.imageUrls.length) {
      showStatus(`All ${checkResult.imageUrls.length} images downloaded successfully!`, 'success');
      setTimeout(() => {
        hideProcessScreen(false, `All ${checkResult.imageUrls.length} images downloaded successfully!`);
      }, 2000);
    } else {
      showStatus(`Downloaded ${successCount} of ${checkResult.imageUrls.length} images. ${failureCount} failed.`, 'success');
      setTimeout(() => {
        hideProcessScreen(false, `Downloaded ${successCount} of ${checkResult.imageUrls.length} images. ${failureCount} failed.`);
      }, 2000);
    }

  } catch (error) {
    console.error('Error in download process:', error);
    showStatus('Error during download process: ' + (error instanceof Error ? error.message : 'Unknown error'), 'error');
    hideProcessScreen(true, 'Error during download process');
  }
});