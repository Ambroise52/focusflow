/**
 * FocusFlow Tab Manager
 * 
 * Handles all tab manipulation operations:
 * - Pause/Resume workspaces (discard/reopen tabs)
 * - Duplicate detection and merging
 * - Memory usage calculations
 * - Tab archiving suggestions
 * - Pin/unpin, move, close operations
 * 
 * Uses chrome.tabs API extensively to manage browser tabs.
 * 
 * @module background/tabManager
 */

import { 
  getWorkspace, 
  saveWorkspace, 
  updateWorkspace,
  getAllTabs,
  saveTab,
  deleteTab 
} from '../lib/storage';
import { calculateMemorySaved, sanitizeUrl, extractDomain } from '../lib/utils';
import { DEBUG } from '../lib/constants';
import type { Workspace } from '../types/workspace';
import type { Tab } from '../types/tab';

/**
 * Average memory per tab (MB)
 * Based on Chrome's typical memory usage patterns
 */
const AVG_TAB_MEMORY_MB = 75; // Conservative estimate

/**
 * Pause a workspace - discard all tabs to free RAM
 * Keeps tabs in storage but removes them from memory
 * 
 * @param workspaceId - ID of workspace to pause
 * @returns Object with success status and memory saved
 */
export async function pauseWorkspace(workspaceId: string): Promise<{
  success: boolean;
  memorySaved: number;
  tabCount: number;
  error?: string;
}> {
  try {
    if (DEBUG) {
      console.log(`⏸️  Pausing workspace: ${workspaceId}`);
    }

    // Get workspace
    const workspace = await getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    if (workspace.isPaused) {
      if (DEBUG) {
        console.log('⚠️  Workspace already paused');
      }
      return {
        success: true,
        memorySaved: 0,
        tabCount: 0
      };
    }

    let discardedCount = 0;
    const tabsToKeep: Tab[] = [];

    // Process each tab
    for (const tab of workspace.tabs) {
      try {
        // Try to find the actual Chrome tab
        const chromeTabs = await chrome.tabs.query({ url: tab.url });
        
        if (chromeTabs.length > 0) {
          const chromeTab = chromeTabs[0];
          
          // Check if tab can be discarded
          if (canDiscardTab(chromeTab)) {
            // Discard tab (unload from memory but keep visible in tab bar)
            await chrome.tabs.discard(chromeTab.id!);
            discardedCount++;
            
            if (DEBUG) {
              console.log(`💤 Discarded tab: ${tab.title}`);
            }
          } else {
            if (DEBUG) {
              console.log(`⏭️  Skipped protected tab: ${tab.title}`);
            }
          }
        }

        // Keep tab in workspace storage
        tabsToKeep.push(tab);

      } catch (error) {
        console.error(`❌ Failed to discard tab: ${tab.title}`, error);
        // Keep tab in storage even if discard failed
        tabsToKeep.push(tab);
      }
    }

    // Update workspace state
    workspace.isPaused = true;
    workspace.isActive = false;
    workspace.tabs = tabsToKeep;
    workspace.lastUsedAt = Date.now();
    
    await saveWorkspace(workspace);

    const memorySaved = calculateMemorySaved(discardedCount);

    if (DEBUG) {
      console.log(`✅ Workspace paused: ${discardedCount} tabs discarded, saved ${memorySaved}MB`);
    }

    return {
      success: true,
      memorySaved,
      tabCount: discardedCount
    };

  } catch (error) {
    console.error('❌ Failed to pause workspace:', error);
    return {
      success: false,
      memorySaved: 0,
      tabCount: 0,
      error: String(error)
    };
  }
}

/**
 * Resume a workspace - reopen all tabs in a new window
 * 
 * @param workspaceId - ID of workspace to resume
 * @returns Object with success status and window ID
 */
export async function resumeWorkspace(workspaceId: string): Promise<{
  success: boolean;
  windowId?: number;
  tabCount: number;
  error?: string;
}> {
  try {
    if (DEBUG) {
      console.log(`▶️  Resuming workspace: ${workspaceId}`);
    }

    // Get workspace
    const workspace = await getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    if (workspace.tabs.length === 0) {
      throw new Error('Workspace has no tabs');
    }

    // Create new window for workspace
    const firstTab = workspace.tabs[0];
    const newWindow = await chrome.windows.create({
      url: firstTab.url,
      focused: true,
      type: 'normal'
    });

    if (!newWindow || !newWindow.id) {
      throw new Error('Failed to create window');
    }

    const windowId = newWindow.id;
    let openedCount = 1; // First tab is already open

    // Open remaining tabs in the new window
    for (let i = 1; i < workspace.tabs.length; i++) {
      const tab = workspace.tabs[i];
      
      try {
        await chrome.tabs.create({
          windowId: windowId,
          url: tab.url,
          active: false,
          pinned: tab.isImportant // Pin important tabs
        });
        
        openedCount++;

        if (DEBUG) {
          console.log(`📂 Opened tab: ${tab.title}`);
        }
      } catch (error) {
        console.error(`❌ Failed to open tab: ${tab.title}`, error);
      }
    }

    // Update workspace state
    workspace.isPaused = false;
    workspace.isActive = true;
    workspace.lastUsedAt = Date.now();
    
    await saveWorkspace(workspace);

    if (DEBUG) {
      console.log(`✅ Workspace resumed: ${openedCount} tabs opened in window ${windowId}`);
    }

    return {
      success: true,
      windowId,
      tabCount: openedCount
    };

  } catch (error) {
    console.error('❌ Failed to resume workspace:', error);
    return {
      success: false,
      tabCount: 0,
      error: String(error)
    };
  }
}

/**
 * Check if a tab can be safely discarded
 * Some tabs (Chrome internal pages, pinned tabs) should not be discarded
 * 
 * @param tab - Chrome tab to check
 * @returns True if tab can be discarded
 */
function canDiscardTab(tab: chrome.tabs.Tab): boolean {
  if (!tab.url) return false;

  // Don't discard protected URL patterns
  const protectedPatterns = [
    'chrome://',
    'chrome-extension://',
    'edge://',
    'about:',
    'data:',
    'file://',
    'view-source:'
  ];

  if (protectedPatterns.some(pattern => tab.url!.startsWith(pattern))) {
    return false;
  }

  // Don't discard pinned tabs
  if (tab.pinned) {
    return false;
  }

  // Don't discard active tab
  if (tab.active) {
    return false;
  }

  // Don't discard tabs playing audio/video
  if (tab.audible) {
    return false;
  }

  return true;
}

/**
 * Find and merge duplicate tabs across all windows
 * Returns the number of duplicates closed
 * 
 * @param closeAutomatically - If true, closes duplicates automatically
 * @returns Object with duplicate count and details
 */
export async function findDuplicateTabs(closeAutomatically: boolean = false): Promise<{
  count: number;
  duplicates: Array<{ url: string; tabIds: number[] }>;
  closed: number;
}> {
  try {
    if (DEBUG) {
      console.log('🔍 Searching for duplicate tabs...');
    }

    // Get all tabs
    const allTabs = await chrome.tabs.query({});
    
    // Group tabs by normalized URL
    const urlMap = new Map<string, number[]>();
    
    for (const tab of allTabs) {
      if (!tab.url || !tab.id) continue;
      
      // Normalize URL (remove trailing slashes, fragments)
      const normalizedUrl = normalizeUrl(tab.url);
      
      if (!urlMap.has(normalizedUrl)) {
        urlMap.set(normalizedUrl, []);
      }
      
      urlMap.get(normalizedUrl)!.push(tab.id);
    }

    // Find duplicates (URLs with 2+ tabs)
    const duplicates: Array<{ url: string; tabIds: number[] }> = [];
    
    for (const [url, tabIds] of urlMap.entries()) {
      if (tabIds.length > 1) {
        duplicates.push({ url, tabIds });
      }
    }

    let closedCount = 0;

    // Close duplicates if requested
    if (closeAutomatically && duplicates.length > 0) {
      for (const duplicate of duplicates) {
        // Keep the first tab, close the rest
        const [keepTab, ...closeTabs] = duplicate.tabIds;
        
        for (const tabId of closeTabs) {
          try {
            await chrome.tabs.remove(tabId);
            closedCount++;
            
            if (DEBUG) {
              console.log(`🗑️  Closed duplicate tab: ${duplicate.url}`);
            }
          } catch (error) {
            console.error(`❌ Failed to close duplicate tab ${tabId}:`, error);
          }
        }
      }
    }

    if (DEBUG) {
      console.log(`✅ Found ${duplicates.length} duplicate URLs (${closedCount} closed)`);
    }

    return {
      count: duplicates.length,
      duplicates,
      closed: closedCount
    };

  } catch (error) {
    console.error('❌ Failed to find duplicates:', error);
    return {
      count: 0,
      duplicates: [],
      closed: 0
    };
  }
}

/**
 * Normalize URL for duplicate detection
 * Removes query params, fragments, trailing slashes
 * 
 * @param url - URL to normalize
 * @returns Normalized URL
 */
function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    
    // Remove fragment (#hash)
    urlObj.hash = '';
    
    // Remove query params (optional - comment out to keep params)
    // urlObj.search = '';
    
    // Remove trailing slash
    let path = urlObj.pathname;
    if (path.endsWith('/') && path.length > 1) {
      path = path.slice(0, -1);
    }
    urlObj.pathname = path;
    
    return urlObj.toString();
  } catch (error) {
    // If URL parsing fails, return original
    return url;
  }
}

/**
 * Calculate total memory saved from discarded tabs
 * Scans all workspaces and counts paused tabs
 * 
 * @returns Object with memory stats
 */
export async function getMemoryStats(): Promise<{
  totalTabsManaged: number;
  pausedTabs: number;
  memorySavedMB: number;
  memorySavedGB: number;
}> {
  try {
    const allTabs = await getAllTabs();
    const chromeTabs = await chrome.tabs.query({});
    
    // Count discarded tabs
    const discardedTabs = chromeTabs.filter(tab => tab.discarded).length;
    
    const memorySavedMB = calculateMemorySaved(discardedTabs);
    
    return {
      totalTabsManaged: allTabs.length,
      pausedTabs: discardedTabs,
      memorySavedMB,
      memorySavedGB: parseFloat((memorySavedMB / 1024).toFixed(2))
    };

  } catch (error) {
    console.error('❌ Failed to calculate memory stats:', error);
    return {
      totalTabsManaged: 0,
      pausedTabs: 0,
      memorySavedMB: 0,
      memorySavedGB: 0
    };
  }
}

/**
 * Find tabs that haven't been accessed in X days
 * Useful for suggesting archival
 * 
 * @param daysThreshold - Number of days (default: 30)
 * @returns Array of stale tabs
 */
export async function findStaleTabs(daysThreshold: number = 30): Promise<{
  count: number;
  tabs: Tab[];
}> {
  try {
    if (DEBUG) {
      console.log(`🕰️  Finding tabs not accessed in ${daysThreshold} days...`);
    }

    const allTabs = await getAllTabs();
    const thresholdTimestamp = Date.now() - (daysThreshold * 24 * 60 * 60 * 1000);
    
    const staleTabs = allTabs.filter(tab => 
      tab.lastAccessed < thresholdTimestamp && !tab.isImportant
    );

    if (DEBUG) {
      console.log(`✅ Found ${staleTabs.length} stale tabs`);
    }

    return {
      count: staleTabs.length,
      tabs: staleTabs
    };

  } catch (error) {
    console.error('❌ Failed to find stale tabs:', error);
    return {
      count: 0,
      tabs: []
    };
  }
}

/**
 * Move tabs to a workspace
 * 
 * @param tabIds - Chrome tab IDs to move
 * @param workspaceId - Target workspace ID
 * @returns Success status
 */
export async function moveTabsToWorkspace(
  tabIds: number[], 
  workspaceId: string
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    if (DEBUG) {
      console.log(`📁 Moving ${tabIds.length} tabs to workspace ${workspaceId}`);
    }

    const workspace = await getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    let movedCount = 0;

    for (const tabId of tabIds) {
      try {
        const chromeTab = await chrome.tabs.get(tabId);
        
        if (!chromeTab.url) continue;

        // Create tab metadata
        const tab: Tab = {
          id: chromeTab.id!,
          url: sanitizeUrl(chromeTab.url),
          title: chromeTab.title || 'Untitled',
          favIconUrl: chromeTab.favIconUrl,
          isImportant: false,
          lastAccessed: Date.now(),
          workspaceId: workspaceId
        };

        // Add to workspace
        workspace.tabs.push(tab);
        await saveTab(tab);
        
        movedCount++;

      } catch (error) {
        console.error(`❌ Failed to move tab ${tabId}:`, error);
      }
    }

    // Update workspace
    workspace.lastUsedAt = Date.now();
    await saveWorkspace(workspace);

    if (DEBUG) {
      console.log(`✅ Moved ${movedCount} tabs to workspace`);
    }

    return {
      success: true,
      count: movedCount
    };

  } catch (error) {
    console.error('❌ Failed to move tabs:', error);
    return {
      success: false,
      count: 0,
      error: String(error)
    };
  }
}

/**
 * Close all tabs in a workspace
 * 
 * @param workspaceId - ID of workspace
 * @returns Success status and count
 */
export async function closeWorkspaceTabs(workspaceId: string): Promise<{
  success: boolean;
  count: number;
  error?: string;
}> {
  try {
    if (DEBUG) {
      console.log(`🗑️  Closing all tabs in workspace: ${workspaceId}`);
    }

    const workspace = await getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    let closedCount = 0;

    // Close each tab
    for (const tab of workspace.tabs) {
      try {
        // Find and close the Chrome tab
        const chromeTabs = await chrome.tabs.query({ url: tab.url });
        
        for (const chromeTab of chromeTabs) {
          if (chromeTab.id) {
            await chrome.tabs.remove(chromeTab.id);
            closedCount++;
          }
        }

      } catch (error) {
        console.error(`❌ Failed to close tab: ${tab.title}`, error);
      }
    }

    if (DEBUG) {
      console.log(`✅ Closed ${closedCount} tabs`);
    }

    return {
      success: true,
      count: closedCount
    };

  } catch (error) {
    console.error('❌ Failed to close workspace tabs:', error);
    return {
      success: false,
      count: 0,
      error: String(error)
    };
  }
}

/**
 * Pin/unpin a tab
 * 
 * @param tabId - Chrome tab ID
 * @param pinned - True to pin, false to unpin
 * @returns Success status
 */
export async function setTabPinned(
  tabId: number, 
  pinned: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    await chrome.tabs.update(tabId, { pinned });
    
    if (DEBUG) {
      console.log(`📌 Tab ${tabId} ${pinned ? 'pinned' : 'unpinned'}`);
    }

    return { success: true };

  } catch (error) {
    console.error('❌ Failed to pin/unpin tab:', error);
    return {
      success: false,
      error: String(error)
    };
  }
}

/**
 * Mute/unmute a tab
 * 
 * @param tabId - Chrome tab ID
 * @param muted - True to mute, false to unmute
 * @returns Success status
 */
export async function setTabMuted(
  tabId: number, 
  muted: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    await chrome.tabs.update(tabId, { muted });
    
    if (DEBUG) {
      console.log(`🔇 Tab ${tabId} ${muted ? 'muted' : 'unmuted'}`);
    }

    return { success: true };

  } catch (error) {
    console.error('❌ Failed to mute/unmute tab:', error);
    return {
      success: false,
      error: String(error)
    };
  }
}

// Log that tab manager module is loaded
if (DEBUG) {
  console.log('✅ Tab manager module loaded');
}
