/**
 * FocusFlow Extension - Constants
 * 
 * Centralized configuration and constants for the entire application.
 * Import these instead of hardcoding values throughout the codebase.
 * 
 * @module constants
 */

// =============================================================================
// CHROME STORAGE KEYS
// =============================================================================

/**
 * Keys used for Chrome storage (both local and sync)
 * These must be consistent across the extension to prevent data loss
 */
export const STORAGE_KEYS = {
  // Local storage (unlimited, device-specific)
  WORKSPACES: 'focusflow_workspaces',
  TABS: 'focusflow_tabs',
  ARCHIVED_WORKSPACES: 'focusflow_archived',
  SUGGESTIONS: 'focusflow_suggestions',
  LAST_SYNC: 'focusflow_last_sync',
  
  // Sync storage (100KB limit, syncs across Chrome devices)
  SETTINGS: 'focusflow_settings',
  USER_PREFERENCES: 'focusflow_preferences',
  THEME: 'focusflow_theme',
  SHORTCUTS: 'focusflow_shortcuts',
} as const;

// =============================================================================
// API CONFIGURATION
// =============================================================================

/**
 * Supabase backend configuration
 * Note: The anon key is safe to expose (it's client-side and has RLS policies)
 */
export const SUPABASE = {
  URL: 'https://bdtoctmhyylusvutswea.supabase.co',
  ANON_KEY: 'sb_publishable_dXf0R39HDz01g3ytcx5Oiw_r39AkTGr',
  
  // Table names in Supabase
  TABLES: {
    USERS: 'users',
    WORKSPACES: 'workspaces',
    SYNC_LOG: 'sync_log',
  },
} as const;

/**
 * External API endpoints
 */
export const API = {
  // Google Favicon Service (reliable favicon fetching)
  FAVICON: (domain: string, size: number = 32) => 
    `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`,
  
  // Stripe payment links (will be added when monetization is implemented)
  STRIPE_CHECKOUT_MONTHLY: '',
  STRIPE_CHECKOUT_YEARLY: '',
} as const;

// =============================================================================
// DESIGN SYSTEM (COLORS)
// =============================================================================

/**
 * Color palette matching tailwind.config.js
 * Use these for programmatic styling (e.g., workspace color indicators)
 */
export const COLORS = {
  // Backgrounds
  BACKGROUND_PRIMARY: '#0A0A0A',   // Near-black main background
  BACKGROUND_SURFACE: '#1A1A1A',   // Card backgrounds
  BACKGROUND_HOVER: '#2A2A2A',     // Hover states
  
  // Borders
  BORDER_DEFAULT: '#2A2A2A',       // Subtle dividers
  BORDER_ACCENT: '#404040',        // Emphasized borders
  
  // Text
  TEXT_PRIMARY: '#FFFFFF',         // Main text
  TEXT_SECONDARY: '#A0A0A0',       // Secondary text
  TEXT_TERTIARY: '#666666',        // Very subtle text
  
  // Accents
  ACCENT_BLUE: '#3B82F6',          // Primary CTAs, links
  ACCENT_GREEN: '#10B981',         // Success states
  ACCENT_ORANGE: '#F59E0B',        // Warnings
  ACCENT_RED: '#EF4444',           // Errors, destructive actions
  
  // Workspace color palette (for user customization)
  WORKSPACE_COLORS: [
    '#3B82F6', // Blue
    '#10B981', // Green
    '#F59E0B', // Orange
    '#EF4444', // Red
    '#8B5CF6', // Purple
    '#EC4899', // Pink
    '#06B6D4', // Cyan
    '#84CC16', // Lime
  ],
} as const;

// =============================================================================
// APP DEFAULTS
// =============================================================================

/**
 * Default settings for new users
 */
export const DEFAULT_SETTINGS = {
  enableAutoGrouping: true,           // Auto-group tabs by default
  maxTabsBeforeSuggestion: 5,         // Suggest workspace after 5+ tabs
  theme: 'dark' as const,             // Always start with dark mode
  isPremium: false,                   // Free tier by default
  syncEnabled: false,                 // Cloud sync requires explicit opt-in
  autoDiscardTabs: true,              // Automatically discard paused tabs to save RAM
  showMemoryStats: true,              // Display RAM saved in UI
  notificationsEnabled: true,         // Show workspace suggestions
} as const;

/**
 * Auto-grouping thresholds and confidence scores
 */
export const AUTO_GROUPING = {
  // Minimum tabs needed to trigger auto-grouping
  MIN_TABS_FOR_GROUPING: 3,
  
  // Minimum confidence score (0-100) to show suggestion
  MIN_CONFIDENCE_SCORE: 60,
  
  // How long to wait before suggesting (to avoid spam)
  SUGGESTION_DELAY_MS: 3000, // 3 seconds
  
  // Maximum suggestions to show at once
  MAX_CONCURRENT_SUGGESTIONS: 2,
} as const;

/**
 * Tab and workspace limits
 */
export const LIMITS = {
  // Free tier limits
  FREE_MAX_WORKSPACES: 5,
  FREE_MAX_TABS_PER_WORKSPACE: 50,
  
  // Premium tier limits
  PREMIUM_MAX_WORKSPACES: 999, // Effectively unlimited
  PREMIUM_MAX_TABS_PER_WORKSPACE: 500,
  
  // Technical limits (to prevent performance issues)
  ABSOLUTE_MAX_TABS: 1000,
  
  // Archive retention
  ARCHIVED_WORKSPACE_RETENTION_DAYS: 30,
  
  // Tab title truncation
  MAX_TAB_TITLE_LENGTH: 60,
  MAX_URL_DISPLAY_LENGTH: 80,
} as const;

/**
 * Timeouts and intervals (in milliseconds)
 */
export const TIMING = {
  // Auto-save intervals
  AUTO_SAVE_INTERVAL: 30000,          // 30 seconds
  
  // Sync intervals
  SYNC_INTERVAL: 300000,              // 5 minutes
  
  // UI feedback
  TOAST_DURATION: 3000,               // 3 seconds
  LOADING_DEBOUNCE: 300,              // 300ms before showing loader
  
  // Tab discard delay (give user time to click back)
  DISCARD_GRACE_PERIOD: 60000,        // 1 minute
  
  // Old tab detection
  OLD_TAB_THRESHOLD: 2592000000,      // 30 days in milliseconds
  
  // Service worker keep-alive
  KEEP_ALIVE_INTERVAL: 20000,         // 20 seconds (keep worker active)
} as const;

// =============================================================================
// FEATURE FLAGS
// =============================================================================

/**
 * Feature flags for enabling/disabling features
 * Useful for development, testing, and gradual rollouts
 */
export const FEATURES = {
  // MVP features (always enabled)
  WORKSPACE_CREATION: true,
  TAB_GROUPING: true,
  PAUSE_RESUME: true,
  IMPORTANCE_FLAGGING: true,
  
  // V2 features (can be toggled)
  AUTO_GROUPING: true,                // AI-powered suggestions
  CLOUD_SYNC: true,                   // Supabase backend
  CROSS_DEVICE: true,                 // Access workspaces on other devices
  
  // Future features (disabled by default)
  SHARED_WORKSPACES: false,           // Team collaboration
  VOICE_COMMANDS: false,              // "Pause work workspace"
  BROWSER_HISTORY_ANALYSIS: false,    // Learn from past behavior
  MOBILE_APP: false,                  // Companion mobile app
  
  // Beta features (for testing)
  EXPERIMENTAL_ML: false,             // Machine learning auto-grouping
  ADVANCED_ANALYTICS: false,          // Detailed usage stats
} as const;

// =============================================================================
// ERROR MESSAGES
// =============================================================================

/**
 * User-facing error messages
 * Keep these friendly, helpful, and actionable
 */
export const ERROR_MESSAGES = {
  // Storage errors
  STORAGE_QUOTA_EXCEEDED: 'Storage limit reached. Try archiving old workspaces.',
  STORAGE_ACCESS_DENIED: 'Cannot access browser storage. Check extension permissions.',
  
  // Sync errors
  SYNC_FAILED: 'Could not sync to cloud. Check your internet connection.',
  SYNC_CONFLICT: 'Workspace was modified on another device. Refresh to see latest version.',
  
  // Premium errors
  PREMIUM_REQUIRED: 'This feature requires FocusFlow Premium.',
  WORKSPACE_LIMIT_REACHED: 'Free tier allows up to 5 workspaces. Upgrade for unlimited.',
  
  // Tab errors
  TAB_NOT_FOUND: 'Tab no longer exists.',
  TAB_CANNOT_DISCARD: 'This tab cannot be discarded (system tab).',
  
  // Workspace errors
  WORKSPACE_NOT_FOUND: 'Workspace not found. It may have been deleted.',
  WORKSPACE_EMPTY: 'Workspace has no tabs.',
  DUPLICATE_WORKSPACE_NAME: 'A workspace with this name already exists.',
  
  // Network errors
  NETWORK_ERROR: 'Network error. Please try again.',
  TIMEOUT_ERROR: 'Request timed out. Please try again.',
  
  // General errors
  UNKNOWN_ERROR: 'Something went wrong. Please try again.',
} as const;

/**
 * Success messages
 */
export const SUCCESS_MESSAGES = {
  WORKSPACE_CREATED: 'Workspace created successfully!',
  WORKSPACE_SAVED: 'Workspace saved.',
  WORKSPACE_DELETED: 'Workspace deleted.',
  WORKSPACE_PAUSED: 'Workspace paused. Tabs hibernated to save RAM.',
  WORKSPACE_RESUMED: 'Workspace resumed. All tabs reopened.',
  
  TAB_STARRED: 'Tab marked as important.',
  TAB_UNSTARRED: 'Tab unmarked.',
  
  SYNC_SUCCESS: 'Synced to cloud.',
  SETTINGS_SAVED: 'Settings saved.',
  
  PREMIUM_ACTIVATED: 'Welcome to FocusFlow Premium! 🎉',
} as const;

// =============================================================================
// KEYBOARD SHORTCUTS
// =============================================================================

/**
 * Default keyboard shortcuts
 * Note: Chrome allows users to customize these in chrome://extensions/shortcuts
 */
export const SHORTCUTS = {
  OPEN_POPUP: 'Cmd+Shift+K',          // Mac: ⌘⇧K, Windows: Ctrl+Shift+K
  NEW_WORKSPACE: 'Cmd+Shift+N',       // Mac: ⌘⇧N, Windows: Ctrl+Shift+N
  PAUSE_WORKSPACE: 'Cmd+Shift+P',     // Mac: ⌘⇧P, Windows: Ctrl+Shift+P
  RESUME_WORKSPACE: 'Cmd+Shift+R',    // Mac: ⌘⇧R, Windows: Ctrl+Shift+R
  SEARCH_WORKSPACES: 'Cmd+Shift+F',   // Mac: ⌘⇧F, Windows: Ctrl+Shift+F
  OPEN_SETTINGS: 'Cmd+,',             // Standard settings shortcut
} as const;

// =============================================================================
// AUTO-GROUPING PATTERNS
// =============================================================================

/**
 * Domain patterns for auto-grouping
 * These are used by the auto-grouping algorithm in src/background/autoGrouping.ts
 */
export const DOMAIN_PATTERNS = {
  Development: [
    'github.com',
    'gitlab.com',
    'bitbucket.org',
    'stackoverflow.com',
    'developer.mozilla.org',
    'docs.python.org',
    'nodejs.org',
    'npmjs.com',
  ],
  
  Work: [
    'notion.so',
    'docs.google.com',
    'sheets.google.com',
    'slides.google.com',
    'slack.com',
    'zoom.us',
    'teams.microsoft.com',
    'office.com',
    'monday.com',
    'asana.com',
    'trello.com',
  ],
  
  Entertainment: [
    'youtube.com',
    'netflix.com',
    'spotify.com',
    'twitch.tv',
    'reddit.com',
    'twitter.com',
    'instagram.com',
    'tiktok.com',
  ],
  
  Shopping: [
    'amazon.com',
    'ebay.com',
    'etsy.com',
    'shopify.com',
    'aliexpress.com',
    'walmart.com',
    'target.com',
  ],
  
  Research: [
    'scholar.google.com',
    'researchgate.net',
    'arxiv.org',
    'pubmed.ncbi.nlm.nih.gov',
    'jstor.org',
    'wikipedia.org',
  ],
  
  News: [
    'nytimes.com',
    'bbc.com',
    'cnn.com',
    'theguardian.com',
    'reuters.com',
    'apnews.com',
  ],
} as const;

/**
 * Keyword patterns for URL and title matching
 */
export const KEYWORD_PATTERNS = {
  Research: ['research', 'paper', 'study', 'journal', 'academic', 'thesis', 'publication'],
  Recipes: ['recipe', 'cooking', 'food', 'baking', 'cuisine', 'ingredient'],
  Travel: ['travel', 'flight', 'hotel', 'booking', 'vacation', 'trip', 'destination'],
  Learning: ['tutorial', 'course', 'learn', 'education', 'training', 'lesson', 'guide'],
  Finance: ['invest', 'stock', 'crypto', 'trading', 'portfolio', 'finance', 'banking'],
  Health: ['health', 'fitness', 'workout', 'exercise', 'medical', 'wellness', 'nutrition'],
} as const;

// =============================================================================
// REGEX PATTERNS
// =============================================================================

/**
 * Regular expressions for URL sanitization and parsing
 */
export const REGEX = {
  // Sensitive URL parameters to strip (security measure)
  SENSITIVE_PARAMS: /([?&])(token|access_token|api_key|apikey|password|pwd|pass|session|sessionid|session_id|auth|authorization|key|secret|credential|credentials)=[^&]*/gi,
  
  // URL validation
  VALID_URL: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/,
  
  // Domain extraction
  DOMAIN: /^(?:https?:\/\/)?(?:www\.)?([^\/]+)/,
  
  // Email validation (for premium signup)
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
} as const;

// =============================================================================
// ANALYTICS EVENTS (PRIVACY-RESPECTING)
// =============================================================================

/**
 * Event names for analytics (only track anonymous usage, never PII)
 * Note: Analytics are opt-in and use privacy-respecting service (Plausible)
 */
export const ANALYTICS_EVENTS = {
  // Workspace events
  WORKSPACE_CREATED: 'workspace_created',
  WORKSPACE_PAUSED: 'workspace_paused',
  WORKSPACE_RESUMED: 'workspace_resumed',
  WORKSPACE_DELETED: 'workspace_deleted',
  
  // Tab events
  TAB_STARRED: 'tab_starred',
  TAB_DISCARDED: 'tab_discarded',
  
  // Auto-grouping events
  SUGGESTION_SHOWN: 'suggestion_shown',
  SUGGESTION_ACCEPTED: 'suggestion_accepted',
  SUGGESTION_DISMISSED: 'suggestion_dismissed',
  
  // Premium events
  PAYWALL_SHOWN: 'paywall_shown',
  UPGRADE_CLICKED: 'upgrade_clicked',
  PREMIUM_ACTIVATED: 'premium_activated',
  
  // Settings events
  SETTINGS_CHANGED: 'settings_changed',
  THEME_TOGGLED: 'theme_toggled',
} as const;

// =============================================================================
// TYPE GUARDS AND UTILITIES
// =============================================================================

/**
 * Check if running in development mode
 */
export const IS_DEV = process.env.NODE_ENV === 'development';

/**
 * Check if running in production
 */
export const IS_PROD = process.env.NODE_ENV === 'production';

/**
 * Extension version (from package.json, will be injected by build process)
 */
export const VERSION = '0.1.0';

/**
 * Extension metadata
 */
export const APP = {
  NAME: 'FocusFlow',
  INTERNAL_CODE_NAME: 'ResearchOS',
  DESCRIPTION: 'Smart browser extension that automatically organizes tabs into context-aware workspaces',
  WEBSITE: 'https://focusflow.app',
  SUPPORT_EMAIL: 'support@focusflow.app',
  GITHUB: 'https://github.com/Ambroise57/focusflow',
} as const;

// =============================================================================
// EXPORT TYPE FOR AUTOCOMPLETE
// =============================================================================

/**
 * Export types for better TypeScript autocomplete
 * Usage: import type { StorageKey } from './constants';
 */
export type StorageKey = keyof typeof STORAGE_KEYS;
export type ColorName = keyof typeof COLORS;
export type FeatureFlag = keyof typeof FEATURES;
export type ErrorMessageKey = keyof typeof ERROR_MESSAGES;
export type SuccessMessageKey = keyof typeof SUCCESS_MESSAGES;
export type AnalyticsEvent = typeof ANALYTICS_EVENTS[keyof typeof ANALYTICS_EVENTS];