import { showStatus } from './statusUtils';
import { showProcessScreen, hideProcessScreen } from './processScreen';
import { chromium } from 'playwright-chromium';
import Papa from 'papaparse';

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

    const rows = result.data as Record<string, string>[];
    const headers = result.meta.fields || [];
    const productIdIndex = headers.indexOf(selectedProductIdField);

    if (productIdIndex === -1) {
      throw new Error(`Product ID field "${selectedProductIdField}" not found in CSV`);
    }

    // Initialize browser
    // const browser = await chromium.launch();
    // const context = await browser.newContext();
    // const page = await context.newPage();

    // Process each row
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const productId = row[selectedProductIdField];

      if (!productId) continue; // Skip rows with empty product ID

      // Remove quotes and pad product ID with leading zeros to make it 12 digits
      const cleanProductId = productId.toString().replace(/"/g, '');
      const paddedProductId = cleanProductId.padStart(12, '0');
      console.log('Processing product ID:', paddedProductId);

      //   // Find the product image
      //   const imgSelector = `img[src*="/${paddedProductId}_"]`;
      //   const imgElement = await page.waitForSelector(imgSelector, { timeout: 5000 });

      //   if (!imgElement) {
      //     console.warn(`No image found for product ID: ${paddedProductId}`);
      //     continue;
      //   }

      //   const imgSrc = await imgElement.getAttribute('src');
      //   if (!imgSrc) {
      //     console.warn(`No image source found for product ID: ${paddedProductId}`);
      //     continue;
      //   }

      //   // Download the image
      //   const response = await page.goto(imgSrc);
      //   if (!response) {
      //     console.warn(`Failed to fetch image for product ID: ${paddedProductId}`);
      //     continue;
      //   }

      //   const buffer = await response.body();
      //   if (!buffer) {
      //     console.warn(`No image data received for product ID: ${paddedProductId}`);
      //     continue;
      //   }

      //   // Save the image
      //   const fileName = `${paddedProductId}.jpg`;
      //   const filePath = `${storagePath}/${fileName}`;

      //   // Use the main process to save the file
      //   await window.electron.ipcRenderer.invoke('save-image', {
      //     filePath,
      //     buffer: Array.from(buffer)
      //   });

      //   // Update progress
      //   const progress = Math.round((i / (rows.length - 1)) * 100);
      //   const progressBar = document.getElementById('downloadProgressBar') as HTMLProgressElement;
      //   const progressStatusText = document.getElementById('progressStatusText') as HTMLDivElement;

      //   if (progressBar) progressBar.value = progress;
      //   if (progressStatusText) {
      //     progressStatusText.textContent = `Downloading... ${progress}% (${i}/${rows.length - 1})`;
      //   }

      // } catch (error) {
      //   console.error(`Error processing product ID ${paddedProductId}:`, error);
      //   // Continue with next product even if one fails
      //   continue;
      // }
    }

    // Clean up
    // await browser.close();

    // Show completion message
    showStatus('All images downloaded successfully!', 'success');
    setTimeout(() => {
      hideProcessScreen(false, 'All images downloaded successfully!');
    }, 2000);

  } catch (error) {
    console.error('Error in download process:', error);
    showStatus('Error during download process: ' + (error instanceof Error ? error.message : 'Unknown error'), 'error');
    hideProcessScreen(true, 'Error during download process');
  }
});