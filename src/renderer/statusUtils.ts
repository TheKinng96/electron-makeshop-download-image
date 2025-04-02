const statusDiv = document.getElementById('status') as HTMLDivElement;

/**
 * Displays a status message in a specified element.
 * @param statusDiv The HTML element to display the status in.
 * @param message The message text.
 * @param type The type of message ('success' or 'error').
 */
export function showStatus(message: string, type: 'success' | 'error') {
  if (!statusDiv) {
    console.error('Status element not provided to showStatus');
    return;
  }
  statusDiv.textContent = message;
  // Use DaisyUI alert classes
  statusDiv.className = `alert ${type === 'success' ? 'alert-success' : 'alert-error'} mt-4`;
  statusDiv.classList.remove('hidden');

  // Hide status after 5 seconds
  setTimeout(() => {
    statusDiv.classList.add('hidden');
  }, 5000);
} 