/**
 * Utility functions for Prospect Miner
 */

// Sleep for specified milliseconds
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retry a function with exponential backoff
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

// Chunk an array into smaller arrays
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// Normalize phone number to E.164 format (simplified)
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  return phone;
}

// Normalize email
export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

// Extract domain from URL
export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// Normalize URL
export function normalizeUrl(url: string): string {
  if (!url) return '';
  let normalized = url.toLowerCase().trim();
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = `https://${normalized}`;
  }
  // Remove trailing slash
  normalized = normalized.replace(/\/+$/, '');
  return normalized;
}

// Generate a timestamp string for filenames
export function timestampString(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').slice(0, -5);
}

// Format date for display
export function formatDate(timestamp: number): string {
  return new Date(timestamp).toISOString().split('T')[0];
}

// Check if a URL is likely a contact page
export function isLikelyContactPage(url: string, patterns: string[]): boolean {
  const lower = url.toLowerCase();
  return patterns.some((pattern) => lower.includes(pattern.toLowerCase()));
}

// Extract emails from text
export function extractEmails(text: string, patterns: string[]): string[] {
  const emails: Set<string> = new Set();

  for (const pattern of patterns) {
    const regex = new RegExp(pattern, 'gi');
    const matches = text.match(regex);
    if (matches) {
      for (const match of matches) {
        const normalized = normalizeEmail(match);
        // Filter out common false positives
        if (
          !normalized.includes('example.com') &&
          !normalized.includes('domain.com') &&
          !normalized.endsWith('.png') &&
          !normalized.endsWith('.jpg') &&
          !normalized.endsWith('.gif')
        ) {
          emails.add(normalized);
        }
      }
    }
  }

  return Array.from(emails);
}

// Extract phone numbers from text
export function extractPhones(text: string, patterns: string[]): string[] {
  const phones: Set<string> = new Set();

  for (const pattern of patterns) {
    const regex = new RegExp(pattern, 'g');
    const matches = text.match(regex);
    if (matches) {
      for (const match of matches) {
        phones.add(normalizePhone(match));
      }
    }
  }

  return Array.from(phones);
}

// Rate limiter helper
export class RateLimiter {
  private queue: number[] = [];
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  async acquire(): Promise<void> {
    const now = Date.now();

    // Remove old entries
    this.queue = this.queue.filter((time) => now - time < this.windowMs);

    if (this.queue.length >= this.maxRequests) {
      // Wait until oldest request expires
      const oldestTime = this.queue[0];
      const waitTime = this.windowMs - (now - oldestTime) + 100; // +100ms buffer
      await sleep(waitTime);
      return this.acquire();
    }

    this.queue.push(now);
  }
}
