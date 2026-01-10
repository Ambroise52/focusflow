/**
 * Settings Type Definitions
 * 
 * Defines user preferences and extension configuration options.
 * These settings are stored in chrome.storage.sync (syncs across devices).
 */

/**
 * Theme mode for the extension UI
 */
export type ThemeMode = 'light' | 'dark' | 'auto';

/**
 * Auto-grouping configuration
 * Controls how aggressive the auto-grouping algorithm is
 */
export interface AutoGroupingConfig {
  /**
   * Whether auto-grouping is enabled at all
   * @default true
   */
  enabled: boolean;

  /**
   * Minimum number of tabs required to trigger a suggestion
   * Lower = more suggestions, higher = fewer suggestions
   * 
   * @default 3
   * @min 2
   * @max 10
   */
  minTabsForSuggestion: number;

  /**
   * Minimum confidence score (0-100) to show a suggestion
   * Higher = only show very confident suggestions
   * 
   * @default 60
   * @min 0
   * @max 100
   */
  minConfidenceScore: number;

  /**
   * Whether to enable domain-based grouping
   * Groups tabs by shared root domain
   * 
   * @default true
   */
  enableDomainClustering: boolean;

  /**
   * Whether to enable keyword-based grouping
   * Groups tabs by keywords in URL/title
   * 
   * @default true
   */
  enableKeywordDetection: boolean;

  /**
   * Whether to enable time-based grouping
   * Groups tabs based on time of day (work hours, evening, etc.)
   * 
   * @default false
   */
  enableTimeBasedContext: boolean;

  /**
   * How often to check for grouping opportunities (milliseconds)
   * 
   * @default 30000 (30 seconds)
   */
  checkIntervalMs: number;
}

/**
 * Notification preferences
 */
export interface NotificationSettings {
  /**
   * Whether to show notifications at all
   * @default true
   */
  enabled: boolean;

  /**
   * Show notification when workspace is auto-created
   * @default true
   */
  onWorkspaceCreated: boolean;

  /**
   * Show notification when tabs are automatically grouped
   * @default true
   */
  onAutoGrouping: boolean;

  /**
   * Show notification when workspace is paused/resumed
   * @default false
   */
  onWorkspaceStateChange: boolean;

  /**
   * Show notification when memory is saved from tab hibernation
   * @default true
   */
  onMemorySaved: boolean;
}

/**
 * Privacy and data settings
 */
export interface PrivacySettings {
  /**
   * Whether to collect anonymous usage analytics
   * @default false
   */
  collectAnalytics: boolean;

  /**
   * Whether to sync data to cloud (requires premium)
   * @default false
   */
  enableCloudSync: boolean;

  /**
   * Whether to include tab titles in cloud sync
   * (More privacy-sensitive than just URLs)
   * 
   * @default true
   */
  syncTabTitles: boolean;

  /**
   * Whether to sanitize URLs before storage
   * Removes sensitive query parameters (tokens, passwords)
   * 
   * @default true (ALWAYS RECOMMENDED)
   */
  sanitizeUrls: boolean;
}

/**
 * Keyboard shortcut configuration
 */
export interface KeyboardShortcuts {
  /**
   * Open extension popup
   * @default "Ctrl+Shift+K" (Windows/Linux) or "Cmd+Shift+K" (Mac)
   */
  openPopup: string;

  /**
   * Create new workspace from current tabs
   * @default "Ctrl+Shift+N" (Windows/Linux) or "Cmd+Shift+N" (Mac)
   */
  createWorkspace: string;

  /**
   * Pause active workspace
   * @default "Ctrl+Shift+P" (Windows/Linux) or "Cmd+Shift+P" (Mac)
   */
  pauseWorkspace: string;

  /**
   * Star/unstar current tab
   * @default "Ctrl+Shift+S" (Windows/Linux) or "Cmd+Shift+S" (Mac)
   */
  toggleStar: string;
}

/**
 * Complete user settings object
 * Stored in chrome.storage.sync (syncs across devices)
 */
export interface UserSettings {
  /**
   * Extension version (for migration purposes)
   * Automatically set by the extension
   */
  version: string;

  /**
   * UI theme preference
   * @default 'dark'
   */
  theme: ThemeMode;

  /**
   * Auto-grouping configuration
   */
  autoGrouping: AutoGroupingConfig;

  /**
   * Notification preferences
   */
  notifications: NotificationSettings;

  /**
   * Privacy and data settings
   */
  privacy: PrivacySettings;

  /**
   * Keyboard shortcuts
   */
  shortcuts: KeyboardShortcuts;

  /**
   * Whether user has premium subscription
   * Checked against backend, stored locally for quick access
   * 
   * @default false
   */
  isPremium: boolean;

  /**
   * Supabase user ID (if logged in for cloud sync)
   * undefined if user hasn't created an account
   */
  userId?: string;

  /**
   * Maximum number of workspaces allowed
   * 5 for free, unlimited for premium
   * 
   * @default 5
   */
  maxWorkspaces: number;

  /**
   * Language/locale preference
   * @default 'en' (English)
   */
  locale: string;

  /**
   * Whether user has completed onboarding tutorial
   * @default false
   */
  hasCompletedOnboarding: boolean;

  /**
   * Timestamp of first install
   * Used for analytics and feature gating
   */
  installedAt?: number;

  /**
   * Timestamp of last settings modification
   */
  lastModifiedAt: number;
}

/**
 * Default settings values
 * Used when initializing settings for new users
 */
export const DEFAULT_SETTINGS: UserSettings = {
  version: '1.0.0',
  theme: 'dark',
  autoGrouping: {
    enabled: true,
    minTabsForSuggestion: 3,
    minConfidenceScore: 60,
    enableDomainClustering: true,
    enableKeywordDetection: true,
    enableTimeBasedContext: false,
    checkIntervalMs: 30000,
  },
  notifications: {
    enabled: true,
    onWorkspaceCreated: true,
    onAutoGrouping: true,
    onWorkspaceStateChange: false,
    onMemorySaved: true,
  },
  privacy: {
    collectAnalytics: false,
    enableCloudSync: false,
    syncTabTitles: true,
    sanitizeUrls: true,
  },
  shortcuts: {
    openPopup: 'Ctrl+Shift+K',
    createWorkspace: 'Ctrl+Shift+N',
    pauseWorkspace: 'Ctrl+Shift+P',
    toggleStar: 'Ctrl+Shift+S',
  },
  isPremium: false,
  maxWorkspaces: 5,
  locale: 'en',
  hasCompletedOnboarding: false,
  lastModifiedAt: Date.now(),
};

/**
 * Settings that require premium subscription
 */
export const PREMIUM_SETTINGS = [
  'privacy.enableCloudSync',
  'autoGrouping.enableTimeBasedContext',
] as const;

/**
 * Parameters for updating settings
 * Allows partial updates (only changed fields)
 */
export type UpdateSettingsParams = Partial<UserSettings>;

/**
 * Settings validation result
 */
export interface SettingsValidationResult {
  valid: boolean;
  errors: Array<{
    field: keyof UserSettings;
    message: string;
  }>;
}

/**
 * Settings migration function type
 * Used when upgrading from old versions
 */
export type SettingsMigration = (oldSettings: Partial<UserSettings>) => UserSettings;

/**
 * Settings export format
 * Used for backing up settings as JSON
 */
export interface SettingsExport {
  version: string;
  exportedAt: number;
  settings: UserSettings;
}

/**
 * Settings categories for UI organization
 */
export const SETTINGS_CATEGORIES = {
  GENERAL: 'general',
  AUTO_GROUPING: 'autoGrouping',
  NOTIFICATIONS: 'notifications',
  PRIVACY: 'privacy',
  SHORTCUTS: 'shortcuts',
  PREMIUM: 'premium',
} as const;

export type SettingsCategory = typeof SETTINGS_CATEGORIES[keyof typeof SETTINGS_CATEGORIES];