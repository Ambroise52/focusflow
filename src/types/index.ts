/**
 * Type Definitions - Central Export Hub
 * 
 * This file re-exports all TypeScript interfaces and types used throughout
 * the FocusFlow extension, providing a single import source for type definitions.
 * 
 * Usage Example:
 * ```typescript
 * import { Tab, Workspace, UserSettings } from '@/types';
 * ```
 */

// ============================================================================
// CORE DATA MODELS
// ============================================================================

/**
 * Tab-related types
 * Represents individual browser tabs with metadata
 */
export type { Tab, TabId, TabMetadata } from './tab';

/**
 * Workspace-related types
 * Represents organized collections of tabs with context
 */
export type { 
  Workspace, 
  WorkspaceId, 
  WorkspaceColor,
  WorkspaceSuggestion 
} from './workspace';

/**
 * Settings and configuration types
 * User preferences and extension configuration
 */
export type { 
  UserSettings, 
  ThemeMode,
  AutoGroupingConfig 
} from './settings';

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Common utility types used across the extension
 */

/**
 * Represents a timestamp in milliseconds (Date.now())
 */
export type Timestamp = number;

/**
 * Generic result type for operations that can succeed or fail
 */
export type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Async function that returns a Result
 */
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

/**
 * Optional value that might be null or undefined
 */
export type Maybe<T> = T | null | undefined;

/**
 * Makes all properties of T optional recursively
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// ============================================================================
// STORAGE TYPES
// ============================================================================

/**
 * Structure of data stored in chrome.storage.local
 */
export interface LocalStorageData {
  workspaces: Workspace[];
  tabs: Tab[];
  archivedWorkspaces: Workspace[];
  suggestions: WorkspaceSuggestion[];
  lastSyncTimestamp?: Timestamp;
}

/**
 * Structure of data stored in chrome.storage.sync
 */
export interface SyncStorageData {
  settings: UserSettings;
  shortcuts?: Record<string, string>;
}

// ============================================================================
// EVENT TYPES
// ============================================================================

/**
 * Events emitted by the extension for inter-component communication
 */
export type ExtensionEvent =
  | { type: 'WORKSPACE_CREATED'; payload: Workspace }
  | { type: 'WORKSPACE_UPDATED'; payload: Workspace }
  | { type: 'WORKSPACE_DELETED'; payload: WorkspaceId }
  | { type: 'TAB_ADDED'; payload: Tab }
  | { type: 'TAB_REMOVED'; payload: TabId }
  | { type: 'TAB_STARRED'; payload: TabId }
  | { type: 'SETTINGS_CHANGED'; payload: Partial<UserSettings> }
  | { type: 'SYNC_STARTED' }
  | { type: 'SYNC_COMPLETED' }
  | { type: 'SYNC_FAILED'; payload: Error };

/**
 * Event listener callback type
 */
export type EventListener<T extends ExtensionEvent> = (event: T) => void;

// ============================================================================
// CHROME API TYPES
// ============================================================================

/**
 * Chrome tab with only the properties we care about
 * (Simplifies the complex chrome.tabs.Tab type)
 */
export interface SimplifiedChromeTab {
  id: number;
  url?: string;
  title?: string;
  favIconUrl?: string;
  active: boolean;
  windowId: number;
  index: number;
}

// ============================================================================
// COMPONENT PROP TYPES
// ============================================================================

/**
 * Common prop types for React components
 */

/**
 * Props for components that display a single tab
 */
export interface TabItemProps {
  tab: Tab;
  isImportant?: boolean;
  onStar?: (tabId: TabId) => void;
  onRemove?: (tabId: TabId) => void;
  onClick?: (tabId: TabId) => void;
}

/**
 * Props for components that display a workspace
 */
export interface WorkspaceCardProps {
  workspace: Workspace;
  onResume?: (workspaceId: WorkspaceId) => void;
  onPause?: (workspaceId: WorkspaceId) => void;
  onDelete?: (workspaceId: WorkspaceId) => void;
  onEdit?: (workspaceId: WorkspaceId, newName: string) => void;
}

// ============================================================================
// EXPORT GROUPED TYPES
// ============================================================================

/**
 * All core types exported as a namespace for convenience
 */
export * as CoreTypes from './tab';
export * as WorkspaceTypes from './workspace';
export * as SettingsTypes from './settings';