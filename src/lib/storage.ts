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

import { STORAGE_KEYS, DEFAULT_SETTINGS, DEBUG } from './constants';
import { safeJsonParse, safeJsonStringify } from './utils';
import type { Workspace, Tab, UserSettings, WorkspaceSuggestion } from '../types';

// IS_DEV alias so existing internal code that references IS_DEV still works
const IS_DEV = DEBUG;

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
const logStorage = (operation: string, key: string, data?: unknown) => {
  if (IS_DEV) {
    console.log(`[Storage] ${operation}:`, key, data ? `(${JSON.stringify(data).length} bytes)` : '');
  }
};

// =============================================================================
// CORE STORAGE OPERATIONS
// =============================================================================

/**
 * Gets a value from chrome.storage.local
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
 */
export const getWorkspaces = async (): Promise<Workspace[]> => {
  const workspaces = await getLocal(STORAGE_KEYS.WORKSPACES);
  return workspaces || [];
};

/**
 * Gets a single workspace by ID
 */
export const getWorkspaceById = async (id: string): Promise<Workspace | null> => {
  const workspaces = await getWorkspaces();
  return workspaces.find(w => w.id === id) || null;
};

/**
 * Alias for getWorkspaceById — used by background worker imports.
 */
export const getWorkspace = async (id: string): Promise<Workspace | undefined> => {
  const workspaces = await getWorkspaces();
  return workspaces.find(w => w.id === id);
};

/**
 * Saves a new workspace or updates an existing one
 */
export const saveWorkspace = async (
  workspace: Workspace
): Promise<StorageResult<Workspace>> => {
  try {
    const workspaces = await getWorkspaces();
    const existingIndex = workspaces.findIndex(w => w.id === workspace.id);

    if (existingIndex !== -1) {
      workspaces[existingIndex] = { ...workspace, lastUsedAt: Date.now() };
    } else {
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
    return { success: false, error: 'An error occurred while saving workspace' };
  }
};

/**
 * Deletes a workspace by ID
 *
 * @param id - Workspace ID to delete
 * @param archive - If true, moves to archived instead of permanent delete
 */
export const deleteWorkspace = async (
  id: string,
  archive: boolean = true
): Promise<StorageResult<void>> => {
  try {
    const workspaces = await getWorkspaces();
    const workspace = workspaces.find(w => w.id === id);

    if (!workspace) {
      return { success: false, error: 'Workspace not found' };
    }

    const updatedWorkspaces = workspaces.filter(w => w.id !== id);
    await setLocal(STORAGE_KEYS.WORKSPACES, updatedWorkspaces);

    if (archive) {
      const archived = await getLocal(STORAGE_KEYS.ARCHIVED_WORKSPACES) || [];
      archived.push({ ...workspace, lastUsedAt: Date.now() });
      await setLocal(STORAGE_KEYS.ARCHIVED_WORKSPACES, archived);
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting workspace:', error);
    return { success: false, error: 'Failed to delete workspace' };
  }
};

/**
 * Updates a workspace's tabs
 */
export const updateWorkspaceTabs = async (
  workspaceId: string,
  tabs: Tab[]
): Promise<StorageResult<Workspace>> => {
  try {
    const workspaces = await getWorkspaces();
    const workspace = workspaces.find(w => w.id === workspaceId);

    if (!workspace) {
      return { success: false, error: 'Workspace not found' };
    }

    workspace.tabs = tabs;
    workspace.lastUsedAt = Date.now();

    return await saveWorkspace(workspace);
  } catch (error) {
    console.error('Error updating workspace tabs:', error);
    return { success: false, error: 'Failed to update workspace tabs' };
  }
};

/**
 * Marks a workspace as active/inactive
 */
export const setWorkspaceActive = async (
  id: string,
  isActive: boolean
): Promise<StorageResult<Workspace>> => {
  try {
    const workspaces = await getWorkspaces();

    workspaces.forEach(w => { w.isActive = false; });

    const workspace = workspaces.find(w => w.id === id);

    if (!workspace) {
      return { success: false, error: 'Workspace not found' };
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
    return { success: false, error: 'Failed to set workspace active' };
  }
};

/**
 * Update the lastUsedAt timestamp on a workspace without a full save.
 */
export const updateWorkspaceLastUsed = async (id: string): Promise<void> => {
  try {
    const workspaces = await getWorkspaces();
    const updated = workspaces.map(w =>
      w.id === id ? { ...w, lastUsedAt: Date.now() } : w
    );
    await setLocal(STORAGE_KEYS.WORKSPACES, updated);
  } catch (err) {
    console.error('[FocusFlow] Failed to update workspace lastUsedAt:', err);
  }
};

// =============================================================================
// TAB OPERATIONS
// =============================================================================

/**
 * Gets all tabs from storage
 */
export const getTabs = async (): Promise<Tab[]> => {
  const tabs = await getLocal(STORAGE_KEYS.TABS);
  return tabs || [];
};

/**
 * Get all tabs stored across all workspaces (flat array).
 */
export const getAllTabs = async (): Promise<Tab[]> => {
  try {
    const workspaces = await getWorkspaces();
    return workspaces.flatMap(w => w.tabs ?? []);
  } catch (err) {
    console.error('[FocusFlow] Failed to get all tabs:', err);
    return [];
  }
};

/**
 * Finds which workspace a tab belongs to, matched by tab ID.
 * Returns null if the tab is not in any workspace.
 *
 * @param tabId - Chrome tab ID to search for
 */
export const findWorkspaceByTab = async (tabId: number): Promise<Workspace | null> => {
  const workspaces = await getWorkspaces();
  return workspaces.find(w => w.tabs.some(t => t.id === tabId)) || null;
};

/**
 * Gets a single tab by its Chrome tab ID.
 * Returns null if not found.
 *
 * @param tabId - Chrome tab ID
 */
export const getTab = async (tabId: number): Promise<Tab | null> => {
  const tabs = await getTabs();
  return tabs.find(t => t.id === tabId) || null;
};

/**
 * Saves a single tab, updating it if it exists or adding it if new.
 * Alias used by the background worker.
 *
 * @param tab - Tab to save
 */
export const saveTab = async (tab: Tab): Promise<boolean> => {
  return await addTab(tab);
};

/**
 * Saves tabs to storage
 */
export const saveTabs = async (tabs: Tab[]): Promise<boolean> => {
  return await setLocal(STORAGE_KEYS.TABS, tabs);
};

/**
 * Adds a tab to storage
 */
export const addTab = async (tab: Tab): Promise<boolean> => {
  const tabs = await getTabs();
  const existingIndex = tabs.findIndex(t => t.id === tab.id);

  if (existingIndex !== -1) {
    tabs[existingIndex] = tab;
  } else {
    tabs.push(tab);
  }

  return await saveTabs(tabs);
};

/**
 * Removes a tab from storage
 */
export const removeTab = async (tabId: number): Promise<boolean> => {
  const tabs = await getTabs();
  return await saveTabs(tabs.filter(t => t.id !== tabId));
};

/**
 * Updates a tab's importance flag
 */
export const toggleTabImportance = async (
  tabId: number,
  isImportant: boolean
): Promise<boolean> => {
  const tabs = await getTabs();
  const tab = tabs.find(t => t.id === tabId);

  if (!tab) return false;

  tab.isImportant = isImportant;
  return await saveTabs(tabs);
};

// =============================================================================
// SETTINGS OPERATIONS
// =============================================================================

/**
 * Gets user settings from sync storage
 */
export const getSettings = async (): Promise<UserSettings> => {
  const settings = await getSync(STORAGE_KEYS.SETTINGS);
  return settings ? { ...DEFAULT_SETTINGS, ...settings } : { ...DEFAULT_SETTINGS };
};

/**
 * Updates user settings in sync storage
 */
export const updateSettings = async (
  settings: Partial<UserSettings>
): Promise<StorageResult<UserSettings>> => {
  try {
    const currentSettings = await getSettings();
    const updatedSettings = { ...currentSettings, ...settings };
    const success = await setSync(STORAGE_KEYS.SETTINGS, updatedSettings);

    return {
      success,
      data: updatedSettings,
      error: success ? undefined : 'Failed to update settings',
    };
  } catch (error) {
    console.error('Error updating settings:', error);
    return { success: false, error: 'An error occurred while updating settings' };
  }
};

/**
 * Resets settings to defaults
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
    return { success: false, error: 'An error occurred while resetting settings' };
  }
};

// =============================================================================
// WORKSPACE SUGGESTIONS
// =============================================================================

/**
 * Gets workspace suggestions from storage
 */
export const getSuggestions = async (): Promise<WorkspaceSuggestion[]> => {
  const suggestions = await getLocal(STORAGE_KEYS.SUGGESTIONS);
  return suggestions || [];
};

/**
 * Saves workspace suggestions
 */
export const saveSuggestions = async (
  suggestions: WorkspaceSuggestion[]
): Promise<boolean> => {
  return await setLocal(STORAGE_KEYS.SUGGESTIONS, suggestions);
};

/**
 * Adds a single new suggestion (limits to 5 most recent).
 */
export const addSuggestion = async (
  suggestion: WorkspaceSuggestion
): Promise<boolean> => {
  const suggestions = await getSuggestions();
  return await saveSuggestions([suggestion, ...suggestions].slice(0, 5));
};

/**
 * Alias used by the background worker — saves one suggestion to storage.
 * Keeps last 10 suggestions to allow the popup to display recent ones.
 */
export const saveWorkspaceSuggestion = async (
  suggestion: WorkspaceSuggestion
): Promise<void> => {
  try {
    const suggestions = await getSuggestions();
    await saveSuggestions([suggestion, ...suggestions].slice(0, 10));
  } catch (err) {
    console.error('[FocusFlow] Failed to save workspace suggestion:', err);
  }
};

/**
 * Clears all suggestions
 */
export const clearSuggestions = async (): Promise<boolean> => {
  return await setLocal(STORAGE_KEYS.SUGGESTIONS, []);
};

// =============================================================================
// ARCHIVED WORKSPACES
// =============================================================================

/**
 * Gets archived workspaces
 */
export const getArchivedWorkspaces = async (): Promise<Workspace[]> => {
  const archived = await getLocal(STORAGE_KEYS.ARCHIVED_WORKSPACES);
  return archived || [];
};

/**
 * Restores an archived workspace
 */
export const restoreArchivedWorkspace = async (
  id: string
): Promise<StorageResult<Workspace>> => {
  try {
    const archived = await getArchivedWorkspaces();
    const workspace = archived.find(w => w.id === id);

    if (!workspace) {
      return { success: false, error: 'Archived workspace not found' };
    }

    await setLocal(
      STORAGE_KEYS.ARCHIVED_WORKSPACES,
      archived.filter(w => w.id !== id)
    );

    return await saveWorkspace(workspace);
  } catch (error) {
    console.error('Error restoring archived workspace:', error);
    return { success: false, error: 'Failed to restore archived workspace' };
  }
};

/**
 * Permanently deletes old archived workspaces past the retention window.
 */
export const cleanOldArchives = async (
  retentionDays: number = 30
): Promise<number> => {
  try {
    const archived = await getArchivedWorkspaces();
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const recent = archived.filter(w => w.lastUsedAt > cutoff);
    const deletedCount = archived.length - recent.length;

    if (deletedCount > 0) {
      await setLocal(STORAGE_KEYS.ARCHIVED_WORKSPACES, recent);
    }

    return deletedCount;
  } catch (error) {
    console.error('Error cleaning old archives:', error);
    return 0;
  }
};

/**
 * Alias used by background worker scheduled alarm cleanup.
 * Removes workspaces soft-deleted more than 30 days ago.
 */
export const cleanupOldWorkspaces = async (): Promise<void> => {
  await cleanOldArchives(30);
};

// =============================================================================
// SYNC OPERATIONS
// =============================================================================

/**
 * Gets the last sync timestamp
 */
export const getLastSyncTime = async (): Promise<number | null> => {
  return await getLocal(STORAGE_KEYS.LAST_SYNC);
};

/**
 * Updates the last sync timestamp
 */
export const updateLastSyncTime = async (): Promise<boolean> => {
  return await setLocal(STORAGE_KEYS.LAST_SYNC, Date.now());
};

// =============================================================================
// BATCH OPERATIONS
// =============================================================================

/**
 * Gets all storage data at once (for backup/export)
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

  return { workspaces, tabs, settings, archived, suggestions };
};

/**
 * Imports data (for restore from backup)
 * WARNING: This will overwrite all existing data!
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

    if (data.workspaces) operations.push(setLocal(STORAGE_KEYS.WORKSPACES, data.workspaces));
    if (data.tabs)       operations.push(setLocal(STORAGE_KEYS.TABS, data.tabs));
    if (data.settings)   operations.push(setSync(STORAGE_KEYS.SETTINGS, data.settings));
    if (data.archived)   operations.push(setLocal(STORAGE_KEYS.ARCHIVED_WORKSPACES, data.archived));
    if (data.suggestions) operations.push(setLocal(STORAGE_KEYS.SUGGESTIONS, data.suggestions));

    const results = await Promise.all(operations);
    const success = results.every(r => r === true);

    return { success, error: success ? undefined : 'Some data failed to import' };
  } catch (error) {
    console.error('Error importing data:', error);
    return { success: false, error: 'An error occurred during import' };
  }
};

/**
 * Exports all data as JSON string (for user download)
 */
export const exportDataAsJson = async (): Promise<string> => {
  const data = await getAllData();
  return safeJsonStringify(data);
};

/**
 * Imports data from JSON string
 */
export const importDataFromJson = async (
  jsonString: string
): Promise<StorageResult<void>> => {
  try {
    const data = safeJsonParse(jsonString, {});
    return await importAllData(data);
  } catch (error) {
    console.error('Error parsing JSON:', error);
    return { success: false, error: 'Invalid JSON data' };
  }
};

// =============================================================================
// INITIALISATION & CLEANUP
// =============================================================================

/**
 * Initialize storage with default values on first install.
 * Called by the background service worker on chrome.runtime.onInstalled.
 * Safe to call multiple times — only writes if values don't already exist.
 */
export const initializeStorage = async (): Promise<void> => {
  try {
    const workspaces = await getWorkspaces();
    const settings   = await getSettings();

    if (!workspaces.length) {
      await setLocal(STORAGE_KEYS.WORKSPACES, []);
    }

    // Settings always merges with defaults, so just ensure the key exists
    await setSync(STORAGE_KEYS.SETTINGS, settings);
  } catch (err) {
    console.error('[FocusFlow] Failed to initialize storage:', err);
  }
};

// =============================================================================
// STORAGE INFO & DEBUGGING
// =============================================================================

/**
 * Gets storage usage information
 */
export const getStorageUsage = async (): Promise<{
  local: number;
  sync: number;
  localFormatted: string;
  syncFormatted: string;
}> => {
  try {
    const localBytes = await chrome.storage.local.getBytesInUse();
    const syncBytes  = await chrome.storage.sync.getBytesInUse();

    const formatBytes = (bytes: number): string => {
      if (bytes < 1024)    return `${bytes} B`;
      if (bytes < 1048576) return `${(bytes / 1024).toFixed(2)} KB`;
      return `${(bytes / 1048576).toFixed(2)} MB`;
    };

    return {
      local: localBytes,
      sync: syncBytes,
      localFormatted: formatBytes(localBytes),
      syncFormatted:  formatBytes(syncBytes),
    };
  } catch (error) {
    console.error('Error getting storage usage:', error);
    return { local: 0, sync: 0, localFormatted: '0 B', syncFormatted: '0 B' };
  }
};

/**
 * Clears all storage (for debugging or reset).
 * WARNING: Deletes everything!
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
    return { success: false, error: 'Failed to clear storage' };
  }
};

// =============================================================================
// STORAGE EVENT LISTENERS
// =============================================================================

/**
 * Listens for changes to a specific storage key.
 * Returns an unsubscribe function.
 */
export const onStorageChange = <T>(
  key: string,
  callback: (newValue: T | null, oldValue: T | null) => void
): (() => void) => {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    _areaName: string
  ) => {
    if (changes[key]) {
      callback(changes[key].newValue || null, changes[key].oldValue || null);
    }
  };

  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
};

/**
 * Deletes a tab from storage by its Chrome tab ID.
 * Alias used by the background worker.
 */
export const deleteTab = async (tabId: number): Promise<boolean> => {
  return await removeTab(tabId);
};

// =============================================================================
// CONVENIENCE OBJECT EXPORT
// =============================================================================

export const storage = {
  getWorkspaces,
  getWorkspaceById,
  getWorkspace,
  saveWorkspace,
  deleteWorkspace,
  updateWorkspaceTabs,
  setWorkspaceActive,
  updateWorkspaceLastUsed,
  getTabs,
  getAllTabs,
  saveTabs,
  addTab,
  removeTab,
  toggleTabImportance,
  getSettings,
  updateSettings,
  resetSettings,
  getSuggestions,
  saveSuggestions,
  addSuggestion,
  saveWorkspaceSuggestion,
  clearSuggestions,
  getArchivedWorkspaces,
  restoreArchivedWorkspace,
  cleanOldArchives,
  cleanupOldWorkspaces,
  getLastSyncTime,
  updateLastSyncTime,
  getAllData,
  importAllData,
  exportDataAsJson,
  importDataFromJson,
  initializeStorage,
  getStorageUsage,
  clearAllStorage,
  onStorageChange,
  getTab,
  saveTab,
  deleteTab,
  findWorkspaceByTab,
};
