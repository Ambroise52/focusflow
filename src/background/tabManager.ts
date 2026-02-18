/**
 * FocusFlow Tab Manager
 *
 * Handles all tab and workspace operations:
 *   - Pause / resume workspaces (hibernate tabs to save memory)
 *   - Duplicate tab detection and cleanup
 *   - Memory usage estimation
 *   - Stale tab identification
 *   - Moving tabs between workspaces
 *   - Closing workspace tabs
 *   - Pin / mute individual tabs
 *
 * @module background/tabManager
 */

import {
  getWorkspace,
  getWorkspaces,
  saveWorkspace,
  getAllTabs,
  getTab,
  saveTab,
  deleteTab,
} from '../lib/storage';
import { calculateMemorySaved, sanitizeUrl } from '../lib/utils';
import { DEBUG } from '../lib/constants';
import type { Workspace } from '../types/workspace';
import type { Tab } from '../types/tab';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result returned by findDuplicateTabs(). */
export interface DuplicateTabResult {
  /** URL shared by the duplicate group. */
  url: string;
  /** IDs of all Chrome tabs open at that URL (first = kept, rest = duplicates). */
  tabIds: number[];
  /** Number of duplicate tabs (tabIds.length - 1). */
  duplicateCount: number;
}

/** Snapshot of current memory usage across all tracked tabs. */
export interface MemoryStats {
  /** Total number of tabs currently tracked in storage. */
  totalTabs: number;
  /** Number of tabs that are paused (discarded / hibernated). */
  pausedTabs: number;
  /** Number of tabs that are actively open in a browser window. */
  activeTabs: number;
  /** Estimated MB saved by pausing tabs (rough heuristic). */
  estimatedMBSaved: number;
  /** Number of workspaces currently marked as paused. */
  pausedWorkspaces: number;
}

/** A tab that has not been accessed for longer than the stale threshold. */
export interface StaleTab {
  /** The stored tab metadata. */
  tab: Tab;
  /** Number of days since the tab was last accessed. */
  daysInactive: number;
}

/** Result of a moveTabsToWorkspace() call. */
export interface MoveResult {
  /** Number of tabs successfully moved. */
  moved: number;
  /** Number of tabs that could not be moved (not found, already in workspace). */
  skipped: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * URL schemes that must never be discarded by Chrome.
 * Attempting chrome.tabs.discard() on these throws an error.
 */
const NON_DISCARDABLE_SCHEMES = [
  'chrome://',
  'chrome-extension://',
  'edge://',
  'about:',
  'data:',
  'file://',
  'view-source://',
];

/** Average memory footprint per tab in MB (used for estimates). */
const AVERAGE_TAB_MB = 150;

// ---------------------------------------------------------------------------
// Pause / Resume workspace
// ---------------------------------------------------------------------------

/**
 * Pauses a workspace by discarding all its open tabs from memory.
 * The tab URLs are preserved in storage so the workspace can be resumed.
 * Pinned, active, and audible tabs are skipped (cannot/should not be discarded).
 *
 * @param workspaceId - UUID of the workspace to pause
 * @returns Number of tabs successfully discarded
 */
export async function pauseWorkspace(workspaceId: string): Promise<number> {
  try {
    if (DEBUG) {
      console.log(`⏸️  Pausing workspace: ${workspaceId}`);
    }

    const workspace = await getWorkspace(workspaceId);
    if (!workspace) {
      console.error(`❌ Workspace not found: ${workspaceId}`);
      return 0;
    }

    // Query all open Chrome tabs in this workspace
    const chromeTabs = await chrome.tabs.query({});
    const workspaceUrls = new Set(workspace.tabs.map((t) => t.url));

    let discardedCount = 0;

    for (const chromeTab of chromeTabs) {
      if (!chromeTab.id || !chromeTab.url) continue;
      if (!workspaceUrls.has(chromeTab.url)) continue;

      // Skip tabs that cannot or should not be discarded
      if (!canDiscardTab(chromeTab)) {
        if (DEBUG) {
          console.log(`⏭️  Skipping non-discardable tab: ${chromeTab.url}`);
        }
        continue;
      }

      try {
        await chrome.tabs.discard(chromeTab.id);
        discardedCount++;

        if (DEBUG) {
          console.log(`💤 Discarded tab: ${chromeTab.url}`);
        }
      } catch (err) {
        console.warn(`⚠️  Could not discard tab ${chromeTab.id}:`, err);
      }
    }

    // Mark workspace as paused in storage
    const updatedWorkspace: Workspace = {
      ...workspace,
      isPaused: true,
      isActive: false,
    };
    await saveWorkspace(updatedWorkspace);

    if (DEBUG) {
      console.log(`✅ Workspace "${workspace.name}" paused (${discardedCount} tabs discarded)`);
    }

    return discardedCount;
  } catch (error) {
    console.error('❌ pauseWorkspace failed:', error);
    return 0;
  }
}

/**
 * Resumes a paused workspace by opening all its saved tabs in a new window.
 * The workspace is marked as active once the window is created.
 *
 * @param workspaceId - UUID of the workspace to resume
 * @returns The newly created Chrome window, or null on failure
 */
export async function resumeWorkspace(
  workspaceId: string
): Promise<chrome.windows.Window | null> {
  try {
    if (DEBUG) {
      console.log(`▶️  Resuming workspace: ${workspaceId}`);
    }

    const workspace = await getWorkspace(workspaceId);
    if (!workspace) {
      console.error(`❌ Workspace not found: ${workspaceId}`);
      return null;
    }

    if (workspace.tabs.length === 0) {
      console.warn(`⚠️  Workspace "${workspace.name}" has no tabs to restore`);
      return null;
    }

    const urls = workspace.tabs.map((t) => t.url).filter(Boolean);

    if (urls.length === 0) {
      console.warn(`⚠️  Workspace "${workspace.name}" has no valid URLs`);
      return null;
    }

    // Open all tabs in a new window
    const newWindow = await chrome.windows.create({ url: urls, focused: true });

    if (!newWindow) {
      console.error('❌ Failed to create window for workspace');
      return null;
    }

    // Mark workspace as active and not paused
    const updatedWorkspace: Workspace = {
      ...workspace,
      isPaused: false,
      isActive: true,
      lastUsedAt: Date.now(),
    };
    await saveWorkspace(updatedWorkspace);

    if (DEBUG) {
      console.log(
        `✅ Workspace "${workspace.name}" resumed in window ${newWindow.id} (${urls.length} tabs)`
      );
    }

    return newWindow;
  } catch (error) {
    console.error('❌ resumeWorkspace failed:', error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Duplicate detection
// ---------------------------------------------------------------------------

/**
 * Finds groups of open Chrome tabs that share the same URL.
 * Optionally auto-closes all duplicates, keeping only the first tab per URL.
 *
 * @param closeAutomatically - If true, duplicate tabs are closed immediately
 * @returns Array of duplicate groups found (including already-closed ones if auto-closed)
 */
export async function findDuplicateTabs(
  closeAutomatically = false
): Promise<DuplicateTabResult[]> {
  try {
    if (DEBUG) {
      console.log('🔍 Scanning for duplicate tabs...');
    }

    const chromeTabs = await chrome.tabs.query({});

    // Group tab IDs by normalised URL
    const urlMap = new Map<string, number[]>();

    for (const tab of chromeTabs) {
      if (!tab.id || !tab.url) continue;
      // Strip hash fragment for comparison (same page, different anchor = duplicate)
      const normalised = tab.url.split('#')[0];
      const existing = urlMap.get(normalised) ?? [];
      existing.push(tab.id);
      urlMap.set(normalised, existing);
    }

    const duplicates: DuplicateTabResult[] = [];

    for (const [url, tabIds] of urlMap.entries()) {
      if (tabIds.length < 2) continue;

      duplicates.push({
        url,
        tabIds,
        duplicateCount: tabIds.length - 1,
      });

      if (closeAutomatically) {
        // Keep the first tab, close the rest
        const toClose = tabIds.slice(1);
        for (const id of toClose) {
          try {
            await chrome.tabs.remove(id);
            if (DEBUG) {
              console.log(`🗑️  Closed duplicate tab ${id}: ${url}`);
            }
          } catch (err) {
            console.warn(`⚠️  Could not close tab ${id}:`, err);
          }
        }
      }
    }

    if (DEBUG) {
      console.log(
        `✅ Found ${duplicates.length} duplicate group(s) ` +
          `(${duplicates.reduce((s, d) => s + d.duplicateCount, 0)} extra tabs)`
      );
    }

    return duplicates;
  } catch (error) {
    console.error('❌ findDuplicateTabs failed:', error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Memory statistics
// ---------------------------------------------------------------------------

/**
 * Returns a snapshot of memory-related statistics across all tracked tabs
 * and workspaces. Uses a rough 150 MB-per-tab heuristic.
 *
 * @returns MemoryStats object
 */
export async function getMemoryStats(): Promise<MemoryStats> {
  try {
    if (DEBUG) {
      console.log('📊 Calculating memory stats...');
    }

    const allStoredTabs = await getAllTabs();
    const chromeTabs = await chrome.tabs.query({});
    const openTabIds = new Set(chromeTabs.map((t) => t.id));

    const activeTabs = allStoredTabs.filter((t) => openTabIds.has(t.id));
    const pausedTabs = allStoredTabs.filter((t) => !openTabIds.has(t.id));

    // Count paused workspaces
    const workspaces = await getWorkspaces();
    const pausedWorkspaces = workspaces.filter((w) => w.isPaused).length;

    const estimatedMBSaved = calculateMemorySaved(pausedTabs.length);

    const stats: MemoryStats = {
      totalTabs: allStoredTabs.length,
      activeTabs: activeTabs.length,
      pausedTabs: pausedTabs.length,
      estimatedMBSaved,
      pausedWorkspaces,
    };

    if (DEBUG) {
      console.log('✅ Memory stats:', stats);
    }

    return stats;
  } catch (error) {
    console.error('❌ getMemoryStats failed:', error);
    return {
      totalTabs: 0,
      activeTabs: 0,
      pausedTabs: 0,
      estimatedMBSaved: 0,
      pausedWorkspaces: 0,
    };
  }
}

// ---------------------------------------------------------------------------
// Stale tab detection
// ---------------------------------------------------------------------------

/**
 * Returns tabs that have not been accessed for longer than the given threshold.
 * Useful for prompting the user to close or archive forgotten tabs.
 *
 * @param daysThreshold - Number of days of inactivity to qualify as stale (default 30)
 * @returns Array of StaleTab objects sorted by daysInactive descending
 */
export async function findStaleTabs(daysThreshold = 30): Promise<StaleTab[]> {
  try {
    if (DEBUG) {
      console.log(`🔍 Finding tabs inactive for ${daysThreshold}+ days...`);
    }

    const allTabs = await getAllTabs();
    const now = Date.now();
    const thresholdMs = daysThreshold * 24 * 60 * 60 * 1000;

    const staleTabs: StaleTab[] = allTabs
      .filter((tab) => now - tab.lastAccessed > thresholdMs)
      .map((tab) => ({
        tab,
        daysInactive: Math.floor((now - tab.lastAccessed) / (24 * 60 * 60 * 1000)),
      }))
      .sort((a, b) => b.daysInactive - a.daysInactive);

    if (DEBUG) {
      console.log(`✅ Found ${staleTabs.length} stale tab(s)`);
    }

    return staleTabs;
  } catch (error) {
    console.error('❌ findStaleTabs failed:', error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Move tabs between workspaces
// ---------------------------------------------------------------------------

/**
 * Assigns the given Chrome tab IDs to a target workspace.
 * Updates both the Tab records in storage and the Workspace's tab list.
 *
 * @param tabIds - Array of Chrome tab IDs to move
 * @param workspaceId - UUID of the destination workspace
 * @returns MoveResult with counts of moved and skipped tabs
 */
export async function moveTabsToWorkspace(
  tabIds: number[],
  workspaceId: string
): Promise<MoveResult> {
  try {
    if (DEBUG) {
      console.log(`📁 Moving ${tabIds.length} tab(s) to workspace ${workspaceId}...`);
    }

    const workspace = await getWorkspace(workspaceId);
    if (!workspace) {
      console.error(`❌ Target workspace not found: ${workspaceId}`);
      return { moved: 0, skipped: tabIds.length };
    }

    let moved = 0;
    let skipped = 0;
    const existingWorkspaceTabIds = new Set(workspace.tabs.map((t) => t.id));

    for (const tabId of tabIds) {
      // Fetch current tab record from storage
      const tab = await getTab(tabId);

      if (!tab) {
        if (DEBUG) {
          console.warn(`⚠️  Tab ${tabId} not found in storage, skipping`);
        }
        skipped++;
        continue;
      }

      if (existingWorkspaceTabIds.has(tabId)) {
        if (DEBUG) {
          console.log(`⏭️  Tab ${tabId} already in workspace, skipping`);
        }
        skipped++;
        continue;
      }

      // Update tab's workspaceId
      const updatedTab: Tab = { ...tab, workspaceId };
      await saveTab(updatedTab);

      // Add to workspace tab list
      workspace.tabs.push(updatedTab);
      existingWorkspaceTabIds.add(tabId);
      moved++;
    }

    // Persist updated workspace
    if (moved > 0) {
      await saveWorkspace({ ...workspace, lastUsedAt: Date.now() });
    }

    if (DEBUG) {
      console.log(`✅ Moved ${moved} tab(s), skipped ${skipped}`);
    }

    return { moved, skipped };
  } catch (error) {
    console.error('❌ moveTabsToWorkspace failed:', error);
    return { moved: 0, skipped: tabIds.length };
  }
}

// ---------------------------------------------------------------------------
// Close workspace tabs
// ---------------------------------------------------------------------------

/**
 * Closes all currently open Chrome tabs that belong to the given workspace.
 * Tab records are kept in storage so the workspace can be resumed later.
 *
 * @param workspaceId - UUID of the workspace whose tabs should be closed
 * @returns Number of tabs closed
 */
export async function closeWorkspaceTabs(workspaceId: string): Promise<number> {
  try {
    if (DEBUG) {
      console.log(`🗑️  Closing tabs for workspace: ${workspaceId}`);
    }

    const workspace = await getWorkspace(workspaceId);
    if (!workspace) {
      console.error(`❌ Workspace not found: ${workspaceId}`);
      return 0;
    }

    const workspaceUrls = new Set(workspace.tabs.map((t) => t.url));
    const chromeTabs = await chrome.tabs.query({});

    const tabsToClose = chromeTabs.filter(
      (t) => t.id && t.url && workspaceUrls.has(t.url)
    );

    let closedCount = 0;

    for (const tab of tabsToClose) {
      if (!tab.id) continue;
      try {
        await chrome.tabs.remove(tab.id);
        closedCount++;
      } catch (err) {
        console.warn(`⚠️  Could not close tab ${tab.id}:`, err);
      }
    }

    // Mark workspace as inactive (not paused — tabs were closed, not hibernated)
    await saveWorkspace({ ...workspace, isActive: false });

    if (DEBUG) {
      console.log(`✅ Closed ${closedCount} tab(s) for workspace "${workspace.name}"`);
    }

    return closedCount;
  } catch (error) {
    console.error('❌ closeWorkspaceTabs failed:', error);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Pin / mute individual tabs
// ---------------------------------------------------------------------------

/**
 * Pins or unpins a Chrome tab.
 *
 * @param tabId - Chrome tab ID
 * @param pinned - True to pin, false to unpin
 */
export async function setTabPinned(tabId: number, pinned: boolean): Promise<void> {
  try {
    await chrome.tabs.update(tabId, { pinned });

    if (DEBUG) {
      console.log(`📌 Tab ${tabId} ${pinned ? 'pinned' : 'unpinned'}`);
    }
  } catch (error) {
    console.error(`❌ setTabPinned failed for tab ${tabId}:`, error);
  }
}

/**
 * Mutes or unmutes a Chrome tab.
 *
 * @param tabId - Chrome tab ID
 * @param muted - True to mute, false to unmute
 */
export async function setTabMuted(tabId: number, muted: boolean): Promise<void> {
  try {
    await chrome.tabs.update(tabId, { muted });

    if (DEBUG) {
      console.log(`🔇 Tab ${tabId} ${muted ? 'muted' : 'unmuted'}`);
    }
  } catch (error) {
    console.error(`❌ setTabMuted failed for tab ${tabId}:`, error);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if a Chrome tab is safe to discard with chrome.tabs.discard().
 *
 * A tab MUST NOT be discarded if:
 *   - Its URL uses a non-discardable scheme (chrome://, about:, file://, etc.)
 *   - It is pinned (user has intentionally kept it accessible)
 *   - It is currently active (the foreground tab)
 *   - It is playing audio (would interrupt the user)
 *
 * @param tab - Chrome tab object
 */
function canDiscardTab(tab: chrome.tabs.Tab): boolean {
  if (!tab.url) return false;

  // Block non-discardable URL schemes
  for (const scheme of NON_DISCARDABLE_SCHEMES) {
    if (tab.url.startsWith(scheme)) {
      return false;
    }
  }

  // Block pinned tabs
  if (tab.pinned) {
    return false;
  }

  // Block active (foreground) tabs
  if (tab.active) {
    return false;
  }

  // Block audible tabs (playing audio/video)
  if (tab.audible) {
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Module init
// ---------------------------------------------------------------------------

if (DEBUG) {
  console.log('✅ tabManager module loaded');
}
