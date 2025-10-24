/**
 * Common utility functions
 */

/**
 * Sleep for a specified number of milliseconds
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffMultiplier?: number;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 100,
    maxDelay = 5000,
    backoffMultiplier = 2,
  } = options;

  let lastError: Error;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries) {
        await sleep(Math.min(delay, maxDelay));
        delay *= backoffMultiplier;
      }
    }
  }

  throw lastError!;
}

/**
 * Check if a string is a valid base64url (for data item IDs)
 */
export function isValidBase64Url(str: string, length?: number): boolean {
  const base64UrlPattern = /^[A-Za-z0-9_-]+$/;

  if (!base64UrlPattern.test(str)) {
    return false;
  }

  if (length !== undefined && str.length !== length) {
    return false;
  }

  return true;
}

/**
 * Validate if a string is a valid data item ID (43 char base64url)
 */
export function isValidDataItemId(id: string): boolean {
  return isValidBase64Url(id, 43);
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
