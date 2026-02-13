/**
 * FocusFlow Extension - Chrome Storage Wrapper
 * 
 * Type-safe wrapper around Chrome Storage API (both local and sync).
 * This is the single source of truth for all data persistence.
 * 
 * Storage Strategy:
 * - chrome.storage.local: Unlimited storage, device-specific (workspaces, tabs)
 * - chrome.storage.sync: 100KB limit, syncs across Chrome devices (settings, preferences)
 * 
 * @module storage
 */

import { STORAGE_KEYS, DEFAULT_SETTINGS, IS_DEV } from './constants';
import { safeJsonParse, safeJsonStringify } from './utils';
import type { Workspace, Tab, UserSettings, WorkspaceSuggestion } from '../types';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Structure of data stored in chrome.storage.local
 */
interface LocalStorageData {
  [STORAGE_KEYS.WORKSPACES]: Workspace[];
  [STORAGE_KEYS.TABS]: Tab[];
  [STORAGE_KEYS.ARCHIVED_WORKSPACES]: Workspace[];
  [STORAGE_KEYS.SUGGESTIONS]: WorkspaceSuggestion[];
  [STORAGE_KEYS.LAST_SYNC]: number;
}

/**
 * Structure of data stored in chrome.storage.sync
 */
interface SyncStorageData {
  [STORAGE_KEYS.SETTINGS]: UserSettings;
  [STORAGE_KEYS.THEME]: 'dark' | 'light';
}

/**
 * Generic storage operation result
 */
interface StorageResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// =============================================================================
// DEBUG LOGGING
// =============================================================================

/**
 * Logs storage operations in development mode
 */
const logStorage = (operation: string, key: string, data?: any) => {
  if (IS_DEV) {
    console.log(`[Storage] ${operation}:`, key, data ? `(${JSON.stringify(data).length} bytes)` : '');
  }
};

// =============================================================================
// CORE STORAGE OPERATIONS
// =============================================================================

/**
 * Gets a value from chrome.storage.local
 * 
 * @param key - Storage key to retrieve
 * @returns Promise with the stored value or null if not found
 */
const getLocal = async <K extends keyof LocalStorageData>(
  key: K
): Promise<LocalStorageData[K] | null> => {
  try {
    const result = await chrome.storage.local.get(key);
    logStorage('GET_LOCAL', key, result[key]);
    return result[key] || null;
  } catch (error) {
    console.error(`Failed to get local storage key: ${key}`, error);
    return null;
  }
};

/**
 * Sets a value in chrome.storage.local
 * 
 * @param key - Storage key
 * @param value - Value to store
 * @returns Promise that resolves when storage is complete
 */
const setLocal = async <K extends keyof LocalStorageData>(
  key: K,
  value: LocalStorageData[K]
): Promise<boolean> => {
  try {
    await chrome.storage.local.set({ [key]: value });
    logStorage('SET_LOCAL', key, value);
    return true;
  } catch (error) {
    console.error(`Failed to set local storage key: ${key}`, error);
    return false;
  }
};

/**
 * Gets a value from chrome.storage.sync
 * 
 * @param key - Storage key to retrieve
 * @returns Promise with the stored value or null if not found
 */
const getSync = async <K extends keyof SyncStorageData>(
  key: K
): Promise<SyncStorageData[K] | null> => {
  try {
    const result = await chrome.storage.sync.get(key);
    logStorage('GET_SYNC', key, result[key]);
    return result[key] || null;
  } catch (error) {
    console.error(`Failed to get sync storage key: ${key}`, error);
    return null;
  }
};

/**
 * Sets a value in chrome.storage.sync
 * 
 * @param key - Storage key
 * @param value - Value to store
 * @returns Promise that resolves when storage is complete
 */
const setSync = async <K extends keyof SyncStorageData>(
  key: K,
  value: SyncStorageData[K]
): Promise<boolean> => {
  try {
    await chrome.storage.sync.set({ [key]: value });
    logStorage('SET_SYNC', key, value);
    return true;
  } catch (error) {
    console.error(`Failed to set sync storage key: ${key}`, error);
    return false;
  }
};

/**
 * Removes a key from local storage
 * 
 * @param key - Storage key to remove
 */
const removeLocal = async (key: keyof LocalStorageData): Promise<boolean> => {
  try {
    await chrome.storage.local.remove(key);
    logStorage('REMOVE_LOCAL', key);
    return true;
  } catch (error) {
    console.error(`Failed to remove local storage key: ${key}`, error);
    return false;
  }
};

/**
 * Clears all local storage (use with caution!)
 */
const clearLocal = async (): Promise<boolean> => {
  try {
    await chrome.storage.local.clear();
    logStorage('CLEAR_LOCAL', 'ALL');
    return true;
  } catch (error) {
    console.error('Failed to clear local storage', error);
    return false;
  }
};

// =============================================================================
// WORKSPACE OPERATIONS
// =============================================================================

/**
 * Gets all workspaces from storage
 * 
 * @returns Promise with array of workspaces (empty array if none exist)
 */
export const getWorkspaces = async (): Promise<Workspace[]> => {
  const workspaces = await getLocal(STORAGE_KEYS.WORKSPACES);
  return workspaces || [];
};

/**
 * Gets a single workspace by ID
 * 
 * @param id - Workspace ID
 * @returns Promise with workspace or null if not found
 */
export const getWorkspaceById = async (id: string): Promise<Workspace | null> => {
  const workspaces = await getWorkspaces();
  return workspaces.find(w => w.id === id) || null;
};

/**
 * Saves a new workspace or updates an existing one
 * 
 * @param workspace - Workspace to save
 * @returns Promise with operation result
 */
export const saveWorkspace = async (
  workspace: Workspace
): Promise<StorageResult<Workspace>> => {
  try {
    const workspaces = await getWorkspaces();
    
    // Check if workspace already exists
    const existingIndex = workspaces.findIndex(w => w.id === workspace.id);
    
    if (existingIndex !== -1) {
      // Update existing workspace
      workspaces[existingIndex] = {
        ...workspace,
        lastUsedAt: Date.now(),
      };
    } else {
      // Add new workspace
      workspaces.push(workspace);
    }
    
    const success = await setLocal(STORAGE_KEYS.WORKSPACES, workspaces);
    
    return {
      success,
      data: workspace,
      error: success ? undefined : 'Failed to save workspace',
    };
  } catch (error) {
    console.error('Error saving workspace:', error);
    return {
      success: false,
      error: 'An error occurred while saving workspace',
    };
  }
};

/**
 * Deletes a workspace by ID
 * 
 * @param id - Workspace ID to delete
 * @param archive - If true, moves to archived instead of permanent delete
 * @returns Promise with operation result
 */
export const deleteWorkspace = async (
  id: string,
  archive: boolean = true
): Promise<StorageResult<void>> => {
  try {
    const workspaces = await getWorkspaces();
    const workspace = workspaces.find(w => w.id === id);
    
    if (!workspace) {
      return {
        success: false,
        error: 'Workspace not found',
      };
    }
    
    // Remove from active workspaces
    const updatedWorkspaces = workspaces.filter(w => w.id !== id);
    await setLocal(STORAGE_KEYS.WORKSPACES, updatedWorkspaces);
    
    // Archive if requested
    if (archive) {
      const archived = await getLocal(STORAGE_KEYS.ARCHIVED_WORKSPACES) || [];
      archived.push({ ...workspace, lastUsedAt: Date.now() });
      await setLocal(STORAGE_KEYS.ARCHIVED_WORKSPACES, archived);
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error deleting workspace:', error);
    return {
      success: false,
      error: 'Failed to delete workspace',
    };
  }
};

/**
 * Updates a workspace's tabs
 * 
 * @param workspaceId - Workspace ID
 * @param tabs - New tabs array
 * @returns Promise with operation result
 */
export const updateWorkspaceTabs = async (
  workspaceId: string,
  tabs: Tab[]
): Promise<StorageResult<Workspace>> => {
  try {
    const workspaces = await getWorkspaces();
    const workspace = workspaces.find(w => w.id === workspaceId);
    
    if (!workspace) {
      return {
        success: false,
        error: 'Workspace not found',
      };
    }
    
    workspace.tabs = tabs;
    workspace.lastUsedAt = Date.now();
    
    return await saveWorkspace(workspace);
  } catch (error) {
    console.error('Error updating workspace tabs:', error);
    return {
      success: false,
      error: 'Failed to update workspace tabs',
    };
  }
};

/**
 * Marks a workspace as active
 * 
 * @param id - Workspace ID
 * @returns Promise with operation result
 */
export const setWorkspaceActive = async (
  id: string,
  isActive: boolean
): Promise<StorageResult<Workspace>> => {
  try {
    const workspaces = await getWorkspaces();
    
    // Set all workspaces to inactive first (only one can be active)
    workspaces.forEach(w => {
      w.isActive = false;
    });
    
    const workspace = workspaces.find(w => w.id === id);
    
    if (!workspace) {
      return {
        success: false,
        error: 'Workspace not found',
      };
    }
    
    workspace.isActive = isActive;
    workspace.lastUsedAt = Date.now();
    
    const success = await setLocal(STORAGE_KEYS.WORKSPACES, workspaces);
    
    return {
      success,
      data: workspace,
      error: success ? undefined : 'Failed to set workspace active',
    };
  } catch (error) {
    console.error('Error setting workspace active:', error);
    return {
      success: false,
      error: 'Failed to set workspace active',
    };
  }
};

// =============================================================================
// TAB OPERATIONS
// =============================================================================

/**
 * Gets all tabs from storage
 * 
 * @returns Promise with array of tabs
 */
export const getTabs = async (): Promise<Tab[]> => {
  const tabs = await getLocal(STORAGE_KEYS.TABS);
  return tabs || [];
};

/**
 * Saves tabs to storage
 * 
 * @param tabs - Array of tabs to save
 * @returns Promise with operation result
 */
export const saveTabs = async (tabs: Tab[]): Promise<boolean> => {
  return await setLocal(STORAGE_KEYS.TABS, tabs);
};

/**
 * Adds a tab to storage
 * 
 * @param tab - Tab to add
 * @returns Promise with operation result
 */
export const addTab = async (tab: Tab): Promise<boolean> => {
  const tabs = await getTabs();
  
  // Check if tab already exists (by ID)
  const existingIndex = tabs.findIndex(t => t.id === tab.id);
  
  if (existingIndex !== -1) {
    // Update existing tab
    tabs[existingIndex] = tab;
  } else {
    // Add new tab
    tabs.push(tab);
  }
  
  return await saveTabs(tabs);
};

/**
 * Removes a tab from storage
 * 
 * @param tabId - Chrome tab ID
 * @returns Promise with operation result
 */
export const removeTab = async (tabId: number): Promise<boolean> => {
  const tabs = await getTabs();
  const updatedTabs = tabs.filter(t => t.id !== tabId);
  return await saveTabs(updatedTabs);
};

/**
 * Updates a tab's importance flag
 * 
 * @param tabId - Chrome tab ID
 * @param isImportant - New importance state
 * @returns Promise with operation result
 */
export const toggleTabImportance = async (
  tabId: number,
  isImportant: boolean
): Promise<boolean> => {
  const tabs = await getTabs();
  const tab = tabs.find(t => t.id === tabId);
  
  if (!tab) {
    return false;
  }
  
  tab.isImportant = isImportant;
  return await saveTabs(tabs);
};

// =============================================================================
// SETTINGS OPERATIONS
// =============================================================================

/**
 * Gets user settings from sync storage
 * 
 * @returns Promise with user settings (returns defaults if not found)
 */
export const getSettings = async (): Promise<UserSettings> => {
  const settings = await getSync(STORAGE_KEYS.SETTINGS);
  
  // Return default settings if none exist
  if (!settings) {
    return { ...DEFAULT_SETTINGS };
  }
  
  // Merge with defaults to ensure all properties exist
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
  };
};

/**
 * Updates user settings in sync storage
 * 
 * @param settings - Partial settings to update
 * @returns Promise with operation result
 */
export const updateSettings = async (
  settings: Partial<UserSettings>
): Promise<StorageResult<UserSettings>> => {
  try {
    const currentSettings = await getSettings();
    const updatedSettings = {
      ...currentSettings,
      ...settings,
    };
    
    const success = await setSync(STORAGE_KEYS.SETTINGS, updatedSettings);
    
    return {
      success,
      data: updatedSettings,
      error: success ? undefined : 'Failed to update settings',
    };
  } catch (error) {
    console.error('Error updating settings:', error);
    return {
      success: false,
      error: 'An error occurred while updating settings',
    };
  }
};

/**
 * Resets settings to defaults
 * 
 * @returns Promise with operation result
 */
export const resetSettings = async (): Promise<StorageResult<UserSettings>> => {
  try {
    const success = await setSync(STORAGE_KEYS.SETTINGS, { ...DEFAULT_SETTINGS });
    
    return {
      success,
      data: { ...DEFAULT_SETTINGS },
      error: success ? undefined : 'Failed to reset settings',
    };
  } catch (error) {
    console.error('Error resetting settings:', error);
    return {
      success: false,
      error: 'An error occurred while resetting settings',
    };
  }
};

// =============================================================================
// WORKSPACE SUGGESTIONS
// =============================================================================

/**
 * Gets workspace suggestions from storage
 * 
 * @returns Promise with array of suggestions
 */
export const getSuggestions = async (): Promise<WorkspaceSuggestion[]> => {
  const suggestions = await getLocal(STORAGE_KEYS.SUGGESTIONS);
  return suggestions || [];
};

/**
 * Saves workspace suggestions
 * 
 * @param suggestions - Array of suggestions
 * @returns Promise with operation result
 */
export const saveSuggestions = async (
  suggestions: WorkspaceSuggestion[]
): Promise<boolean> => {
  return await setLocal(STORAGE_KEYS.SUGGESTIONS, suggestions);
};

/**
 * Adds a new suggestion
 * 
 * @param suggestion - Suggestion to add
 * @returns Promise with operation result
 */
export const addSuggestion = async (
  suggestion: WorkspaceSuggestion
): Promise<boolean> => {
  const suggestions = await getSuggestions();
  
  // Limit to 5 most recent suggestions
  const updatedSuggestions = [suggestion, ...suggestions].slice(0, 5);
  
  return await saveSuggestions(updatedSuggestions);
};

/**
 * Clears all suggestions
 * 
 * @returns Promise with operation result
 */
export const clearSuggestions = async (): Promise<boolean> => {
  return await setLocal(STORAGE_KEYS.SUGGESTIONS, []);
};

// =============================================================================
// ARCHIVED WORKSPACES
// =============================================================================

/**
 * Gets archived workspaces
 * 
 * @returns Promise with array of archived workspaces
 */
export const getArchivedWorkspaces = async (): Promise<Workspace[]> => {
  const archived = await getLocal(STORAGE_KEYS.ARCHIVED_WORKSPACES);
  return archived || [];
};

/**
 * Restores an archived workspace
 * 
 * @param id - Workspace ID to restore
 * @returns Promise with operation result
 */
export const restoreArchivedWorkspace = async (
  id: string
): Promise<StorageResult<Workspace>> => {
  try {
    const archived = await getArchivedWorkspaces();
    const workspace = archived.find(w => w.id === id);
    
    if (!workspace) {
      return {
        success: false,
        error: 'Archived workspace not found',
      };
    }
    
    // Remove from archived
    const updatedArchived = archived.filter(w => w.id !== id);
    await setLocal(STORAGE_KEYS.ARCHIVED_WORKSPACES, updatedArchived);
    
    // Add back to active workspaces
    return await saveWorkspace(workspace);
  } catch (error) {
    console.error('Error restoring archived workspace:', error);
    return {
      success: false,
      error: 'Failed to restore archived workspace',
    };
  }
};

/**
 * Permanently deletes old archived workspaces
 * 
 * @param retentionDays - Number of days to keep archives (default: 30)
 * @returns Promise with number of deleted workspaces
 */
export const cleanOldArchives = async (
  retentionDays: number = 30
): Promise<number> => {
  try {
    const archived = await getArchivedWorkspaces();
    const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
    
    // Keep only recent archives
    const recentArchives = archived.filter(
      w => w.lastUsedAt > cutoffTime
    );
    
    const deletedCount = archived.length - recentArchives.length;
    
    if (deletedCount > 0) {
      await setLocal(STORAGE_KEYS.ARCHIVED_WORKSPACES, recentArchives);
    }
    
    return deletedCount;
  } catch (error) {
    console.error('Error cleaning old archives:', error);
    return 0;
  }
};

// =============================================================================
// SYNC OPERATIONS
// =============================================================================

/**
 * Gets the last sync timestamp
 * 
 * @returns Promise with timestamp or null if never synced
 */
export const getLastSyncTime = async (): Promise<number | null> => {
  return await getLocal(STORAGE_KEYS.LAST_SYNC);
};

/**
 * Updates the last sync timestamp
 * 
 * @returns Promise with operation result
 */
export const updateLastSyncTime = async (): Promise<boolean> => {
  return await setLocal(STORAGE_KEYS.LAST_SYNC, Date.now());
};

// =============================================================================
// BATCH OPERATIONS
// =============================================================================

/**
 * Gets all storage data at once (for backup/export)
 * 
 * @returns Promise with all storage data
 */
export const getAllData = async (): Promise<{
  workspaces: Workspace[];
  tabs: Tab[];
  settings: UserSettings;
  archived: Workspace[];
  suggestions: WorkspaceSuggestion[];
}> => {
  const [workspaces, tabs, settings, archived, suggestions] = await Promise.all([
    getWorkspaces(),
    getTabs(),
    getSettings(),
    getArchivedWorkspaces(),
    getSuggestions(),
  ]);
  
  return {
    workspaces,
    tabs,
    settings,
    archived,
    suggestions,
  };
};

/**
 * Imports data (for restore from backup)
 * 
 * WARNING: This will overwrite all existing data!
 * 
 * @param data - Data to import
 * @returns Promise with operation result
 */
export const importAllData = async (data: {
  workspaces?: Workspace[];
  tabs?: Tab[];
  settings?: UserSettings;
  archived?: Workspace[];
  suggestions?: WorkspaceSuggestion[];
}): Promise<StorageResult<void>> => {
  try {
    const operations: Promise<boolean>[] = [];
    
    if (data.workspaces) {
      operations.push(setLocal(STORAGE_KEYS.WORKSPACES, data.workspaces));
    }
    
    if (data.tabs) {
      operations.push(setLocal(STORAGE_KEYS.TABS, data.tabs));
    }
    
    if (data.settings) {
      operations.push(setSync(STORAGE_KEYS.SETTINGS, data.settings));
    }
    
    if (data.archived) {
      operations.push(setLocal(STORAGE_KEYS.ARCHIVED_WORKSPACES, data.archived));
    }
    
    if (data.suggestions) {
      operations.push(setLocal(STORAGE_KEYS.SUGGESTIONS, data.suggestions));
    }
    
    const results = await Promise.all(operations);
    const success = results.every(r => r === true);
    
    return {
      success,
      error: success ? undefined : 'Some data failed to import',
    };
  } catch (error) {
    console.error('Error importing data:', error);
    return {
      success: false,
      error: 'An error occurred during import',
    };
  }
};

/**
 * Exports all data as JSON string (for user download)
 * 
 * @returns Promise with JSON string
 */
export const exportDataAsJson = async (): Promise<string> => {
  const data = await getAllData();
  return safeJsonStringify(data);
};

/**
 * Imports data from JSON string
 * 
 * @param jsonString - JSON string to import
 * @returns Promise with operation result
 */
export const importDataFromJson = async (
  jsonString: string
): Promise<StorageResult<void>> => {
  try {
    const data = safeJsonParse(jsonString, {});
    return await importAllData(data);
  } catch (error) {
    console.error('Error parsing JSON:', error);
    return {
      success: false,
      error: 'Invalid JSON data',
    };
  }
};

// =============================================================================
// STORAGE INFO & DEBUGGING
// =============================================================================

/**
 * Gets storage usage information
 * 
 * @returns Promise with storage usage in bytes
 */
export const getStorageUsage = async (): Promise<{
  local: number;
  sync: number;
  localFormatted: string;
  syncFormatted: string;
}> => {
  try {
    const localBytes = await chrome.storage.local.getBytesInUse();
    const syncBytes = await chrome.storage.sync.getBytesInUse();
    
    const formatBytes = (bytes: number): string => {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1048576) return `${(bytes / 1024).toFixed(2)} KB`;
      return `${(bytes / 1048576).toFixed(2)} MB`;
    };
    
    return {
      local: localBytes,
      sync: syncBytes,
      localFormatted: formatBytes(localBytes),
      syncFormatted: formatBytes(syncBytes),
    };
  } catch (error) {
    console.error('Error getting storage usage:', error);
    return {
      local: 0,
      sync: 0,
      localFormatted: '0 B',
      syncFormatted: '0 B',
    };
  }
};

/**
 * Clears all storage (for debugging or reset)
 * 
 * WARNING: This deletes everything! Use with caution!
 * 
 * @returns Promise with operation result
 */
export const clearAllStorage = async (): Promise<StorageResult<void>> => {
  try {
    await Promise.all([
      chrome.storage.local.clear(),
      chrome.storage.sync.clear(),
    ]);
    
    return { success: true };
  } catch (error) {
    console.error('Error clearing storage:', error);
    return {
      success: false,
      error: 'Failed to clear storage',
    };
  }
};

// =============================================================================
// STORAGE EVENT LISTENERS
// =============================================================================

/**
 * Listens for changes to a specific storage key
 * 
 * @param key - Storage key to watch
 * @param callback - Function to call when key changes
 * @returns Function to remove the listener
 * 
 * @example
 * const unsubscribe = onStorageChange(STORAGE_KEYS.WORKSPACES, (newValue) => {
 *   console.log('Workspaces updated:', newValue);
 * });
 * 
 * // Later: unsubscribe();
 */
export const onStorageChange = <T>(
  key: string,
  callback: (newValue: T | null, oldValue: T | null) => void
): (() => void) => {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string
  ) => {
    if (changes[key]) {
      callback(changes[key].newValue || null, changes[key].oldValue || null);
    }
  };
  
  chrome.storage.onChanged.addListener(listener);
  
  // Return unsubscribe function
  return () => {
    chrome.storage.onChanged.removeListener(listener);
  };
};

// =============================================================================
// EXPORTS
// =============================================================================

/**
 * Export all storage functions as a single object
 */
export const storage = {
  // Workspaces
  getWorkspaces,
  getWorkspaceById,
  saveWorkspace,
  deleteWorkspace,
  updateWorkspaceTabs,
  setWorkspaceActive,
  
  // Tabs
  getTabs,
  saveTabs,
  addTab,
  removeTab,
  toggleTabImportance,
  
  // Settings
  getSettings,
  updateSettings,
  resetSettings,
  
  // Suggestions
  getSuggestions,
  saveSuggestions,
  addSuggestion,
  clearSuggestions,
  
  // Archives
  getArchivedWorkspaces,
  restoreArchivedWorkspace,
  cleanOldArchives,
  
  // Sync
  getLastSyncTime,
  updateLastSyncTime,
  
  // Batch
  getAllData,
  importAllData,
  exportDataAsJson,
  importDataFromJson,
  
  // Info
  getStorageUsage,
  clearAllStorage,
  
  // Events
  onStorageChange,
};