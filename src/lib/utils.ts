/**
 * FocusFlow Extension - Utility Functions
 * 
 * Reusable helper functions used throughout the application.
 * These functions handle common operations like URL sanitization,
 * date formatting, text manipulation, and data generation.
 * 
 * @module utils
 */

import { REGEX, LIMITS, COLORS, API } from './constants';
import type { Tab, Workspace } from '../types';

// =============================================================================
// URL OPERATIONS
// =============================================================================

/**
 * Sanitizes a URL by removing sensitive query parameters
 * 
 * This is a CRITICAL security function that prevents storing/displaying
 * URLs with tokens, passwords, or API keys in query parameters.
 * 
 * @param url - The URL to sanitize
 * @returns Sanitized URL with sensitive parameters removed
 * 
 * @example
 * sanitizeUrl('https://api.com?token=abc123&user=john')
 * // Returns: 'https://api.com?user=john'
 */
export const sanitizeUrl = (url: string): string => {
  if (!url) return '';
  
  try {
    const urlObj = new URL(url);
    
    // List of sensitive parameter names to remove
    const sensitiveParams = [
      'token', 'access_token', 'api_key', 'apikey',
      'password', 'pwd', 'pass',
      'session', 'sessionid', 'session_id',
      'auth', 'authorization',
      'key', 'secret',
      'credential', 'credentials',
    ];
    
    // Remove each sensitive parameter (case-insensitive)
    sensitiveParams.forEach(param => {
      urlObj.searchParams.delete(param);
      urlObj.searchParams.delete(param.toUpperCase());
      urlObj.searchParams.delete(param.toLowerCase());
    });
    
    return urlObj.toString();
  } catch (error) {
    // If URL parsing fails, return original (better than crashing)
    console.warn('Failed to sanitize URL:', url, error);
    return url;
  }
};

/**
 * Extracts the domain from a URL
 * 
 * @param url - Full URL
 * @returns Domain name without protocol or path
 * 
 * @example
 * extractDomain('https://www.github.com/user/repo')
 * // Returns: 'github.com'
 */
export const extractDomain = (url: string): string => {
  if (!url) return '';
  
  try {
    const urlObj = new URL(url);
    // Remove 'www.' prefix if present
    return urlObj.hostname.replace(/^www\./, '');
  } catch (error) {
    // Fallback: use regex if URL parsing fails
    const match = url.match(REGEX.DOMAIN);
    return match ? match[1].replace(/^www\./, '') : '';
  }
};

/**
 * Validates if a string is a valid HTTP(S) URL
 * 
 * @param url - String to validate
 * @returns True if valid URL, false otherwise
 */
export const isValidUrl = (url: string): boolean => {
  if (!url) return false;
  
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * Gets a reliable favicon URL for a given domain
 * Uses Google's S2 favicon service with fallback
 * 
 * @param url - Full URL or domain
 * @param size - Favicon size in pixels (default: 32)
 * @returns Favicon URL
 */
export const getFavicon = (url: string, size: number = 32): string => {
  try {
    const domain = extractDomain(url);
    if (!domain) return '/assets/default-favicon.svg';
    
    return API.FAVICON(domain, size);
  } catch {
    return '/assets/default-favicon.svg';
  }
};

// =============================================================================
// DATE & TIME FORMATTING
// =============================================================================

/**
 * Converts a timestamp to human-readable relative time
 * 
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Human-readable string (e.g., "2 hours ago", "just now")
 * 
 * @example
 * formatRelativeTime(Date.now() - 3600000)
 * // Returns: "1 hour ago"
 */
export const formatRelativeTime = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;
  
  // Less than 1 minute
  if (diff < 60000) {
    return 'just now';
  }
  
  // Less than 1 hour (show minutes)
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  }
  
  // Less than 1 day (show hours)
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  }
  
  // Less than 1 week (show days)
  if (diff < 604800000) {
    const days = Math.floor(diff / 86400000);
    return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  }
  
  // Less than 1 month (show weeks)
  if (diff < 2592000000) {
    const weeks = Math.floor(diff / 604800000);
    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
  }
  
  // Less than 1 year (show months)
  if (diff < 31536000000) {
    const months = Math.floor(diff / 2592000000);
    return `${months} ${months === 1 ? 'month' : 'months'} ago`;
  }
  
  // Show years
  const years = Math.floor(diff / 31536000000);
  return `${years} ${years === 1 ? 'year' : 'years'} ago`;
};

/**
 * Formats a timestamp to a readable date string
 * 
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted date string
 * 
 * @example
 * formatDate(1704067200000)
 * // Returns: "Jan 1, 2024"
 */
export const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  };
  
  return date.toLocaleDateString('en-US', options);
};

/**
 * Formats a timestamp to include time
 * 
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted date and time string
 * 
 * @example
 * formatDateTime(1704067200000)
 * // Returns: "Jan 1, 2024 at 12:00 PM"
 */
export const formatDateTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  
  const dateOptions: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  };
  
  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  };
  
  const dateStr = date.toLocaleDateString('en-US', dateOptions);
  const timeStr = date.toLocaleTimeString('en-US', timeOptions);
  
  return `${dateStr} at ${timeStr}`;
};

// =============================================================================
// TEXT MANIPULATION
// =============================================================================

/**
 * Truncates text to a maximum length with ellipsis
 * 
 * @param text - Text to truncate
 * @param maxLength - Maximum length before truncation
 * @returns Truncated text with ellipsis if needed
 * 
 * @example
 * truncateText('This is a very long title that needs truncating', 20)
 * // Returns: "This is a very lo..."
 */
export const truncateText = (text: string, maxLength: number): string => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  
  return text.substring(0, maxLength - 3) + '...';
};

/**
 * Capitalizes the first letter of a string
 * 
 * @param text - Text to capitalize
 * @returns Capitalized text
 * 
 * @example
 * capitalize('hello world')
 * // Returns: "Hello world"
 */
export const capitalize = (text: string): string => {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/**
 * Converts text to title case (capitalizes each word)
 * 
 * @param text - Text to convert
 * @returns Title-cased text
 * 
 * @example
 * toTitleCase('hello world from focusflow')
 * // Returns: "Hello World From Focusflow"
 */
export const toTitleCase = (text: string): string => {
  if (!text) return '';
  
  return text
    .toLowerCase()
    .split(' ')
    .map(word => capitalize(word))
    .join(' ');
};

/**
 * Generates a human-readable workspace name from URLs
 * 
 * @param tabs - Array of tabs to analyze
 * @returns Suggested workspace name
 * 
 * @example
 * generateWorkspaceName([{ url: 'https://github.com/...' }])
 * // Returns: "GitHub Workspace"
 */
export const generateWorkspaceName = (tabs: Tab[]): string => {
  if (!tabs || tabs.length === 0) return 'New Workspace';
  
  // Get the most common domain
  const domains = tabs.map(tab => extractDomain(tab.url));
  const domainCount = domains.reduce((acc, domain) => {
    acc[domain] = (acc[domain] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const mostCommonDomain = Object.entries(domainCount)
    .sort(([, a], [, b]) => b - a)[0]?.[0];
  
  if (mostCommonDomain) {
    // Clean up domain name (remove TLD, capitalize)
    const name = mostCommonDomain
      .replace(/\.(com|org|net|io|dev)$/, '')
      .split('.')
      .map(capitalize)
      .join(' ');
    
    return `${name} Workspace`;
  }
  
  return 'New Workspace';
};

// =============================================================================
// DATA GENERATION
// =============================================================================

/**
 * Generates a unique identifier (UUID v4)
 * 
 * @returns UUID string
 * 
 * @example
 * generateId()
 * // Returns: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 */
export const generateId = (): string => {
  // Simple UUID v4 implementation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

/**
 * Generates a random color from the workspace color palette
 * 
 * @returns Hex color code
 */
export const getRandomWorkspaceColor = (): string => {
  const colors = COLORS.WORKSPACE_COLORS;
  return colors[Math.floor(Math.random() * colors.length)];
};

/**
 * Generates a unique workspace name by appending number if needed
 * 
 * @param baseName - Base name to make unique
 * @param existingNames - Array of existing workspace names
 * @returns Unique workspace name
 * 
 * @example
 * getUniqueWorkspaceName('My Workspace', ['My Workspace', 'Other Workspace'])
 * // Returns: "My Workspace 2"
 */
export const getUniqueWorkspaceName = (
  baseName: string,
  existingNames: string[]
): string => {
  if (!existingNames.includes(baseName)) {
    return baseName;
  }
  
  let counter = 2;
  let uniqueName = `${baseName} ${counter}`;
  
  while (existingNames.includes(uniqueName)) {
    counter++;
    uniqueName = `${baseName} ${counter}`;
  }
  
  return uniqueName;
};

// =============================================================================
// CALCULATIONS
// =============================================================================

/**
 * Calculates estimated memory saved from discarded tabs
 * 
 * Chrome typically uses 50-200MB per tab depending on content.
 * This estimates conservatively at 75MB per tab.
 * 
 * @param tabCount - Number of discarded tabs
 * @returns Object with MB and GB values
 * 
 * @example
 * calculateMemorySaved(10)
 * // Returns: { mb: 750, gb: 0.75, formatted: "750 MB" }
 */
export const calculateMemorySaved = (tabCount: number): {
  mb: number;
  gb: number;
  formatted: string;
} => {
  const MB_PER_TAB = 75; // Conservative estimate
  const mb = tabCount * MB_PER_TAB;
  const gb = mb / 1024;
  
  // Format as MB if less than 1 GB, otherwise use GB
  const formatted = gb < 1 
    ? `${mb.toFixed(0)} MB`
    : `${gb.toFixed(2)} GB`;
  
  return { mb, gb, formatted };
};

/**
 * Calculates confidence score for auto-grouping suggestion
 * 
 * @param matchingTabs - Number of tabs that match the pattern
 * @param totalTabs - Total number of tabs being analyzed
 * @returns Confidence score (0-100)
 */
export const calculateConfidence = (
  matchingTabs: number,
  totalTabs: number
): number => {
  if (totalTabs === 0) return 0;
  
  const matchPercentage = (matchingTabs / totalTabs) * 100;
  
  // Boost confidence if there are more matching tabs
  let confidence = matchPercentage;
  
  if (matchingTabs >= 5) confidence += 10;
  if (matchingTabs >= 10) confidence += 10;
  
  // Cap at 100
  return Math.min(Math.round(confidence), 100);
};

/**
 * Counts the number of important (starred) tabs in a workspace
 * 
 * @param workspace - Workspace to analyze
 * @returns Count of important tabs
 */
export const countImportantTabs = (workspace: Workspace): number => {
  return workspace.tabs.filter(tab => tab.isImportant).length;
};

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validates a workspace name
 * 
 * @param name - Workspace name to validate
 * @returns Validation result with error message if invalid
 */
export const validateWorkspaceName = (name: string): {
  isValid: boolean;
  error?: string;
} => {
  // Empty check
  if (!name || name.trim().length === 0) {
    return { isValid: false, error: 'Workspace name cannot be empty' };
  }
  
  // Length check
  if (name.length > 50) {
    return { isValid: false, error: 'Workspace name must be under 50 characters' };
  }
  
  // Special characters check (allow alphanumeric, spaces, hyphens, underscores)
  const validPattern = /^[a-zA-Z0-9\s\-_]+$/;
  if (!validPattern.test(name)) {
    return { 
      isValid: false, 
      error: 'Workspace name can only contain letters, numbers, spaces, hyphens, and underscores' 
    };
  }
  
  return { isValid: true };
};

/**
 * Validates an email address
 * 
 * @param email - Email to validate
 * @returns True if valid email, false otherwise
 */
export const isValidEmail = (email: string): boolean => {
  return REGEX.EMAIL.test(email);
};

/**
 * Checks if a tab can be discarded (not a protected system tab)
 * 
 * @param tab - Chrome tab object
 * @returns True if tab can be safely discarded, false otherwise
 */
export const canDiscardTab = (tab: chrome.tabs.Tab): boolean => {
  if (!tab.url) return false;
  
  // Protected URL schemes that can't be discarded
  const protectedPatterns = [
    'chrome://',
    'chrome-extension://',
    'edge://',
    'about:',
    'data:',
    'file://',
    'view-source:',
  ];
  
  return !protectedPatterns.some(pattern => tab.url!.startsWith(pattern));
};

// =============================================================================
// ARRAY UTILITIES
// =============================================================================

/**
 * Groups an array of items by a key
 * 
 * @param array - Array to group
 * @param key - Key to group by
 * @returns Object with grouped items
 * 
 * @example
 * groupBy([{type: 'A'}, {type: 'B'}, {type: 'A'}], 'type')
 * // Returns: { A: [{type: 'A'}, {type: 'A'}], B: [{type: 'B'}] }
 */
export const groupBy = <T>(
  array: T[],
  key: keyof T
): Record<string, T[]> => {
  return array.reduce((result, item) => {
    const groupKey = String(item[key]);
    if (!result[groupKey]) {
      result[groupKey] = [];
    }
    result[groupKey].push(item);
    return result;
  }, {} as Record<string, T[]>);
};

/**
 * Removes duplicate items from an array based on a key
 * 
 * @param array - Array to deduplicate
 * @param key - Key to check for duplicates
 * @returns Array with duplicates removed
 */
export const uniqueBy = <T>(array: T[], key: keyof T): T[] => {
  const seen = new Set();
  return array.filter(item => {
    const value = item[key];
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
};

/**
 * Sorts workspaces by last used date (most recent first)
 * 
 * @param workspaces - Array of workspaces
 * @returns Sorted array
 */
export const sortWorkspacesByRecent = (workspaces: Workspace[]): Workspace[] => {
  return [...workspaces].sort((a, b) => b.lastUsedAt - a.lastUsedAt);
};

/**
 * Finds duplicate tabs (same URL) within a workspace
 * 
 * @param tabs - Array of tabs to check
 * @returns Array of duplicate tab groups
 */
export const findDuplicateTabs = (tabs: Tab[]): Tab[][] => {
  const urlGroups = groupBy(tabs, 'url');
  
  return Object.values(urlGroups).filter(group => group.length > 1);
};

// =============================================================================
// STORAGE HELPERS
// =============================================================================

/**
 * Safely parses JSON with fallback
 * 
 * @param jsonString - JSON string to parse
 * @param fallback - Fallback value if parsing fails
 * @returns Parsed object or fallback
 */
export const safeJsonParse = <T>(jsonString: string, fallback: T): T => {
  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    console.warn('JSON parse failed:', error);
    return fallback;
  }
};

/**
 * Safely stringifies JSON with error handling
 * 
 * @param data - Data to stringify
 * @returns JSON string or empty object string on error
 */
export const safeJsonStringify = (data: unknown): string => {
  try {
    return JSON.stringify(data);
  } catch (error) {
    console.error('JSON stringify failed:', error);
    return '{}';
  }
};

// =============================================================================
// CLIPBOARD UTILITIES
// =============================================================================

/**
 * Copies text to clipboard
 * 
 * @param text - Text to copy
 * @returns Promise that resolves when copy is complete
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    return false;
  }
};

// =============================================================================
// PERFORMANCE UTILITIES
// =============================================================================

/**
 * Debounces a function call
 * 
 * @param func - Function to debounce
 * @param wait - Wait time in milliseconds
 * @returns Debounced function
 */
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

/**
 * Throttles a function call
 * 
 * @param func - Function to throttle
 * @param limit - Time limit in milliseconds
 * @returns Throttled function
 */
export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle: boolean = false;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

// =============================================================================
// EXPORTS
// =============================================================================

/**
 * Export all utilities as a single object for easier importing
 * Usage: import { utils } from './utils'; then utils.sanitizeUrl(...)
 */
export const utils = {
  // URL
  sanitizeUrl,
  extractDomain,
  isValidUrl,
  getFavicon,
  
  // Date/Time
  formatRelativeTime,
  formatDate,
  formatDateTime,
  
  // Text
  truncateText,
  capitalize,
  toTitleCase,
  generateWorkspaceName,
  
  // Generation
  generateId,
  getRandomWorkspaceColor,
  getUniqueWorkspaceName,
  
  // Calculations
  calculateMemorySaved,
  calculateConfidence,
  countImportantTabs,
  
  // Validation
  validateWorkspaceName,
  isValidEmail,
  canDiscardTab,
  
  // Arrays
  groupBy,
  uniqueBy,
  sortWorkspacesByRecent,
  findDuplicateTabs,
  
  // Storage
  safeJsonParse,
  safeJsonStringify,
  
  // Clipboard
  copyToClipboard,
  
  // Performance
  debounce,
  throttle,
};