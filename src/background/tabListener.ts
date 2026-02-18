/**
 * FocusFlow Tab Event Listener
 * 
 * Monitors all Chrome tab events and maintains synchronized state in storage.
 * Triggers auto-grouping suggestions when tab count thresholds are exceeded.
 * 
 * Events monitored:
 * - onCreated: New tabs opened
 * - onUpdated: URL/title changes, loading states
 * - onRemoved: Tabs closed
 * - onActivated: Tab focus changes
 * - onReplaced: Tab replacements (rare)
 * 
 * @module background/tabListener
 */

import { 
  saveTab, 
  getTab, 
  deleteTab, 
  updateTabMetadata,
  getAllTabs,
  getWorkspaces,
  findWorkspaceByTab,
  getSettings
} from '../lib/storage';
import { sanitizeUrl, extractDomain, generateId } from '../lib/utils';
import { DEBUG } from '../lib/constants';
import { suggestWorkspaceGrouping } from './autoGrouping';
import type { Tab } from '../types/tab';

/**
 * Tab metadata cache for quick lookups
 * Reduces storage reads for frequently accessed data
 */
const tabCache = new Map<number, Tab>();

/**
 * Debounce timer for auto-grouping suggestions
 * Prevents excessive suggestion triggers during rapid tab creation
 */
let autoGroupingTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Initialize tab listeners
 * Called by background/index.ts on extension startup
 */
export function initializeTabListeners(): void {
  if (DEBUG) {
    console.log('🎧 Initializing tab listeners...');
  }

  // Remove any existing listeners (prevent duplicates on reload)
  chrome.tabs.onCreated.removeListener(handleTabCreated);
  chrome.tabs.onUpdated.removeListener(handleTabUpdated);
  chrome.tabs.onRemoved.removeListener(handleTabRemoved);
  chrome.tabs.onActivated.removeListener(handleTabActivated);
  chrome.tabs.onReplaced.removeListener(handleTabReplaced);

  // Register listeners
  chrome.tabs.onCreated.addListener(handleTabCreated);
  chrome.tabs.onUpdated.addListener(handleTabUpdated);
  chrome.tabs.onRemoved.addListener(handleTabRemoved);
  chrome.tabs.onActivated.addListener(handleTabActivated);
  chrome.tabs.onReplaced.addListener(handleTabReplaced);

  if (DEBUG) {
    console.log('✅ Tab listeners initialized');
  }

  // Sync existing tabs to storage on startup
  syncExistingTabs();
}

/**
 * Sync all currently open tabs to storage
 * Runs on extension startup to ensure storage is accurate
 */
async function syncExistingTabs(): Promise<void> {
  try {
    if (DEBUG) {
      console.log('🔄 Syncing existing tabs to storage...');
    }

    const tabs = await chrome.tabs.query({});
    
    for (const chromeTab of tabs) {
      // Skip invalid tabs (no URL)
      if (!chromeTab.url || chromeTab.url.startsWith('chrome://')) {
        continue;
      }

      // Create tab metadata
      const tab: Tab = {
        id: chromeTab.id!,
        url: sanitizeUrl(chromeTab.url),
        title: chromeTab.title || 'Untitled',
        favIconUrl: chromeTab.favIconUrl,
        isImportant: false, // Default to not important
        lastAccessed: Date.now(),
        workspaceId: undefined // Will be assigned during auto-grouping
      };

      // Save to storage and cache
      await saveTab(tab);
      tabCache.set(tab.id, tab);
    }

    if (DEBUG) {
      console.log(`✅ Synced ${tabs.length} tabs to storage`);
    }
  } catch (error) {
    console.error('❌ Failed to sync existing tabs:', error);
  }
}

/**
 * Handle tab creation event
 * Triggered when user opens a new tab
 * 
 * @param chromeTab - The newly created Chrome tab
 */
async function handleTabCreated(chromeTab: chrome.tabs.Tab): Promise<void> {
  try {
    // Skip invalid tabs (no ID or URL)
    if (!chromeTab.id || !chromeTab.url) {
      return;
    }

    // Skip Chrome internal pages
    if (chromeTab.url.startsWith('chrome://') || 
        chromeTab.url.startsWith('chrome-extension://')) {
      return;
    }

    if (DEBUG) {
      console.log('➕ New tab created:', {
        id: chromeTab.id,
        url: chromeTab.url,
        title: chromeTab.title
      });
    }

    // Create tab metadata
    const tab: Tab = {
      id: chromeTab.id,
      url: sanitizeUrl(chromeTab.url),
      title: chromeTab.title || 'Loading...',
      favIconUrl: chromeTab.favIconUrl,
      isImportant: false,
      lastAccessed: Date.now(),
      workspaceId: undefined
    };

    // Check if this tab belongs to an active workspace
    const workspace = await findWorkspaceByTab(tab.url);
    if (workspace && workspace.isActive) {
      tab.workspaceId = workspace.id;
      if (DEBUG) {
        console.log(`📁 Tab auto-assigned to workspace: ${workspace.name}`);
      }
    }

    // Save to storage and cache
    await saveTab(tab);
    tabCache.set(tab.id, tab);

    // Trigger auto-grouping check (debounced)
    scheduleAutoGroupingCheck();

  } catch (error) {
    console.error('❌ Tab creation handler failed:', error);
  }
}

/**
 * Handle tab update event
 * Triggered when tab URL, title, or loading state changes
 * 
 * @param tabId - Chrome tab ID
 * @param changeInfo - Information about what changed
 * @param chromeTab - Updated Chrome tab object
 */
async function handleTabUpdated(
  tabId: number, 
  changeInfo: chrome.tabs.TabChangeInfo, 
  chromeTab: chrome.tabs.Tab
): Promise<void> {
  try {
    // Only process complete page loads or URL changes
    if (changeInfo.status !== 'complete' && !changeInfo.url) {
      return;
    }

    // Skip Chrome internal pages
    if (chromeTab.url?.startsWith('chrome://') || 
        chromeTab.url?.startsWith('chrome-extension://')) {
      return;
    }

    if (DEBUG && changeInfo.url) {
      console.log('🔄 Tab updated:', {
        id: tabId,
        url: changeInfo.url,
        title: chromeTab.title
      });
    }

    // Get existing tab from cache or storage
    let tab = tabCache.get(tabId);
    if (!tab) {
      tab = await getTab(tabId);
    }

    // If tab doesn't exist yet, create it
    if (!tab) {
      if (!chromeTab.url) return;
      
      tab = {
        id: tabId,
        url: sanitizeUrl(chromeTab.url),
        title: chromeTab.title || 'Untitled',
        favIconUrl: chromeTab.favIconUrl,
        isImportant: false,
        lastAccessed: Date.now(),
        workspaceId: undefined
      };
    } else {
      // Update existing tab
      if (changeInfo.url) {
        tab.url = sanitizeUrl(changeInfo.url);
      }
      if (chromeTab.title) {
        tab.title = chromeTab.title;
      }
      if (chromeTab.favIconUrl) {
        tab.favIconUrl = chromeTab.favIconUrl;
      }
      tab.lastAccessed = Date.now();
    }

    // Save updated tab
    await saveTab(tab);
    tabCache.set(tabId, tab);

    // If URL changed significantly, check auto-grouping
    if (changeInfo.url) {
      scheduleAutoGroupingCheck();
    }

  } catch (error) {
    console.error('❌ Tab update handler failed:', error);
  }
}

/**
 * Handle tab removal event
 * Triggered when user closes a tab
 * 
 * @param tabId - Chrome tab ID
 * @param removeInfo - Information about the removal
 */
async function handleTabRemoved(
  tabId: number, 
  removeInfo: chrome.tabs.TabRemoveInfo
): Promise<void> {
  try {
    if (DEBUG) {
      console.log('➖ Tab removed:', {
        id: tabId,
        windowClosing: removeInfo.isWindowClosing
      });
    }

    // Get tab metadata before deletion
    const tab = tabCache.get(tabId) || await getTab(tabId);

    // If tab belongs to a workspace, keep it in the workspace
    // (user might want to resume it later)
    if (tab?.workspaceId) {
      if (DEBUG) {
        console.log(`📁 Tab belongs to workspace ${tab.workspaceId}, keeping in storage`);
      }
      // Don't delete from storage, just update state
      // The workspace still needs this tab URL for resuming
      return;
    }

    // Delete from storage and cache (only if not in a workspace)
    await deleteTab(tabId);
    tabCache.delete(tabId);

    if (DEBUG) {
      console.log(`✅ Tab ${tabId} removed from storage`);
    }

  } catch (error) {
    console.error('❌ Tab removal handler failed:', error);
  }
}

/**
 * Handle tab activation event
 * Triggered when user switches to a different tab
 * 
 * @param activeInfo - Information about the activated tab
 */
async function handleTabActivated(
  activeInfo: chrome.tabs.TabActiveInfo
): Promise<void> {
  try {
    const { tabId, windowId } = activeInfo;

    if (DEBUG) {
      console.log('👁️  Tab activated:', { tabId, windowId });
    }

    // Update lastAccessed timestamp
    const tab = tabCache.get(tabId) || await getTab(tabId);
    
    if (tab) {
      tab.lastAccessed = Date.now();
      await saveTab(tab);
      tabCache.set(tabId, tab);
    }

  } catch (error) {
    console.error('❌ Tab activation handler failed:', error);
  }
}

/**
 * Handle tab replacement event
 * Triggered when a tab is replaced by another (rare, usually during prerendering)
 * 
 * @param addedTabId - ID of the new tab
 * @param removedTabId - ID of the old tab
 */
async function handleTabReplaced(
  addedTabId: number, 
  removedTabId: number
): Promise<void> {
  try {
    if (DEBUG) {
      console.log('🔄 Tab replaced:', {
        old: removedTabId,
        new: addedTabId
      });
    }

    // Get old tab metadata
    const oldTab = tabCache.get(removedTabId) || await getTab(removedTabId);

    if (oldTab) {
      // Transfer metadata to new tab ID
      const newTab: Tab = {
        ...oldTab,
        id: addedTabId,
        lastAccessed: Date.now()
      };

      // Save new tab and delete old
      await saveTab(newTab);
      await deleteTab(removedTabId);

      // Update cache
      tabCache.set(addedTabId, newTab);
      tabCache.delete(removedTabId);
    }

  } catch (error) {
    console.error('❌ Tab replacement handler failed:', error);
  }
}

/**
 * Schedule an auto-grouping check (debounced)
 * Prevents excessive checks during rapid tab creation
 */
function scheduleAutoGroupingCheck(): void {
  // Clear existing timer
  if (autoGroupingTimer) {
    clearTimeout(autoGroupingTimer);
  }

  // Schedule new check after 2 seconds of inactivity
  autoGroupingTimer = setTimeout(async () => {
    await checkAutoGrouping();
  }, 2000);
}

/**
 * Check if auto-grouping should be triggered
 * Runs after tab creation/update events (debounced)
 */
async function checkAutoGrouping(): Promise<void> {
  try {
    const settings = await getSettings();

    // Only proceed if auto-grouping is enabled
    if (!settings.enableAutoGrouping) {
      if (DEBUG) {
        console.log('⏭️  Auto-grouping disabled in settings');
      }
      return;
    }

    // Get all tabs in current window
    const tabs = await chrome.tabs.query({ currentWindow: true });
    
    // Filter out Chrome internal pages and already-grouped tabs
    const ungroupedTabs = tabs.filter(tab => 
      tab.url && 
      !tab.url.startsWith('chrome://') &&
      !tab.url.startsWith('chrome-extension://')
    );

    // Check if we've exceeded the threshold
    if (ungroupedTabs.length >= settings.maxTabsBeforeSuggestion) {
      if (DEBUG) {
        console.log(`💡 Auto-grouping threshold reached: ${ungroupedTabs.length} tabs`);
      }

      // Trigger workspace grouping suggestion
      await suggestWorkspaceGrouping(ungroupedTabs);
    }

  } catch (error) {
    console.error('❌ Auto-grouping check failed:', error);
  }
}

/**
 * Get tab statistics for debugging/monitoring
 * 
 * @returns Object with tab counts and memory estimates
 */
export async function getTabStats(): Promise<{
  total: number;
  cached: number;
  ungrouped: number;
  important: number;
}> {
  try {
    const allTabs = await getAllTabs();
    const ungrouped = allTabs.filter(tab => !tab.workspaceId);
    const important = allTabs.filter(tab => tab.isImportant);

    return {
      total: allTabs.length,
      cached: tabCache.size,
      ungrouped: ungrouped.length,
      important: important.length
    };
  } catch (error) {
    console.error('❌ Failed to get tab stats:', error);
    return {
      total: 0,
      cached: 0,
      ungrouped: 0,
      important: 0
    };
  }
}

/**
 * Clear tab cache (for testing/debugging)
 */
export function clearTabCache(): void {
  tabCache.clear();
  if (DEBUG) {
    console.log('🗑️  Tab cache cleared');
  }
}

// Log that tab listener module is loaded
if (DEBUG) {
  console.log('✅ Tab listener module loaded');
}
