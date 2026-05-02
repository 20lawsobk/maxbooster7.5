import { logger } from '@/lib/logger';
/**
 * External Link Utility
 * Provides secure methods to open external URLs in the user's browser
 * Works in both PWA standalone mode and regular browser contexts
 */

// URL validation regex
const URL_PATTERN = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;

// Allowed URL schemes for security
const ALLOWED_SCHEMES = ['http:', 'https:', 'mailto:', 'tel:'];

/**
 * Validates and sanitizes a URL before opening
 */
export function sanitizeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!ALLOWED_SCHEMES.includes(parsed.protocol)) {
      logger.warn(`[ExternalLinks] Blocked URL with unsafe protocol: ${parsed.protocol}`);
      return null;
    }
    return parsed.href;
  } catch {
    // Try adding https:// if no protocol
    try {
      const withProtocol = new URL(`https://${url}`);
      return withProtocol.href;
    } catch {
      logger.warn(`[ExternalLinks] Invalid URL: ${url}`);
      return null;
    }
  }
}

/**
 * Opens a URL in a new browser tab/window
 * Automatically sanitizes the URL for security
 * Handles PWA standalone mode by ensuring external links open in browser
 */
export function openExternalLink(url: string, options?: {
  newTab?: boolean;
  noopener?: boolean;
  noreferrer?: boolean;
}): boolean {
  const sanitized = sanitizeUrl(url);
  if (!sanitized) return false;
  
  const { newTab = true, noopener = true, noreferrer = true } = options || {};
  
  const features: string[] = [];
  if (noopener) features.push('noopener');
  if (noreferrer) features.push('noreferrer');
  
  const target = newTab ? '_blank' : '_self';
  const rel = features.join(',');
  
  // In PWA standalone mode, window.open may behave differently
  // Using anchor element click is more reliable
  const anchor = document.createElement('a');
  anchor.href = sanitized;
  anchor.target = target;
  anchor.rel = rel;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  
  return true;
}

/**
 * Checks if the app is running in PWA standalone mode
 */
export function isPWAStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
         (window.navigator as Record<string, unknown>).standalone === true ||
         document.referrer.includes('android-app://');
}

/**
 * Opens email client with pre-filled fields
 */
export function openMailto(email: string, subject?: string, body?: string): boolean {
  const params = new URLSearchParams();
  if (subject) params.set('subject', subject);
  if (body) params.set('body', body);
  
  const mailto = params.toString() 
    ? `mailto:${email}?${params.toString()}`
    : `mailto:${email}`;
  
  return openExternalLink(mailto);
}

/**
 * Opens phone dialer
 */
export function openTel(phoneNumber: string): boolean {
  const cleaned = phoneNumber.replace(/[^\d+]/g, '');
  return openExternalLink(`tel:${cleaned}`);
}
