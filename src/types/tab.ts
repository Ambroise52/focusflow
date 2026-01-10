/**
 * Tab Type Definitions
 * 
 * Defines the structure for individual browser tabs with metadata
 * used throughout the FocusFlow extension.
 */

/**
 * Unique identifier for a browser tab
 * Corresponds to Chrome's tab.id
 */
export type TabId = number;

/**
 * Represents a browser tab with its metadata
 * 
 * This is our simplified version of chrome.tabs.Tab that includes
 * only the properties we need, plus our custom fields.
 */
export interface Tab {
  /**
   * Unique Chrome tab ID
   * This is the ID Chrome assigns to each tab
   */
  id: TabId;

  /**
   * Full URL of the tab
   * Sanitized to remove sensitive query parameters (tokens, passwords, etc.)
   * 
   * @example "https://github.com/Ambroise57/focusflow"
   */
  url: string;

  /**
   * Page title as reported by the browser
   * Falls back to URL if title is unavailable
   * 
   * @example "FocusFlow - Smart Tab Manager"
   */
  title: string;

  /**
   * URL of the page's favicon
   * May be undefined if the page hasn't loaded yet
   * We use Google's favicon service as fallback
   * 
   * @example "https://github.com/favicon.ico"
   */
  favIconUrl?: string;

  /**
   * Whether this tab has been marked as important by the user
   * Starred tabs are highlighted in the UI and prioritized
   * 
   * @default false
   */
  isImportant: boolean;

  /**
   * Timestamp (milliseconds) when this tab was last accessed/focused
   * Used for sorting and identifying stale tabs
   * 
   * @example 1704931200000 (Date.now())
   */
  lastAccessed: number;

  /**
   * ID of the workspace this tab belongs to
   * undefined if tab is not assigned to any workspace
   */
  workspaceId?: string;

  /**
   * Original Chrome window ID
   * Used when reopening tabs in their original window
   */
  windowId?: number;

  /**
   * Tab's position in the window (0-indexed)
   * Used to restore tab order when resuming workspaces
   */
  index?: number;
}

/**
 * Additional metadata about a tab
 * Used for analytics and suggestions
 */
export interface TabMetadata {
  /**
   * Extracted domain from the URL (e.g., "github.com")
   */
  domain: string;

  /**
   * Top-level domain (e.g., "github.com" from "docs.github.com")
   */
  rootDomain: string;

  /**
   * Whether this tab is currently active in its window
   */
  isActive: boolean;

  /**
   * Whether this tab is currently audible (playing sound)
   */
  isAudible: boolean;

  /**
   * Whether this tab has been discarded to save memory
   * Discarded tabs are unloaded but still visible in the tab bar
   */
  isDiscarded: boolean;

  /**
   * Estimated memory usage in megabytes (if available)
   */
  memoryUsageMB?: number;
}

/**
 * Parameters for creating a new tab entry
 * Makes certain fields optional for convenience
 */
export type CreateTabParams = Omit<Tab, 'lastAccessed' | 'isImportant'> & {
  lastAccessed?: number;
  isImportant?: boolean;
};

/**
 * Parameters for updating an existing tab
 * All fields are optional
 */
export type UpdateTabParams = Partial<Omit<Tab, 'id'>> & {
  id: TabId;
};

/**
 * Filter criteria for querying tabs
 */
export interface TabFilter {
  /**
   * Filter by workspace ID
   */
  workspaceId?: string;

  /**
   * Filter by importance flag
   */
  isImportant?: boolean;

  /**
   * Filter by domain (exact match)
   */
  domain?: string;

  /**
   * Filter by whether tab is discarded
   */
  isDiscarded?: boolean;

  /**
   * Only return tabs older than this timestamp
   */
  olderThan?: number;

  /**
   * Only return tabs newer than this timestamp
   */
  newerThan?: number;
}

/**
 * Sort options for tab lists
 */
export type TabSortBy = 
  | 'lastAccessed'    // Most recently accessed first
  | 'title'           // Alphabetical by title
  | 'domain'          // Grouped by domain
  | 'importance'      // Starred tabs first
  | 'windowOrder';    // Original window order

/**
 * Sort direction
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Tab sorting configuration
 */
export interface TabSortOptions {
  sortBy: TabSortBy;
  direction: SortDirection;
}

/**
 * Result of a tab operation
 */
export interface TabOperationResult {
  success: boolean;
  tabId?: TabId;
  error?: string;
}

/**
 * Batch operation result for multiple tabs
 */
export interface BatchTabOperationResult {
  successCount: number;
  failureCount: number;
  errors: Array<{ tabId: TabId; error: string }>;
}