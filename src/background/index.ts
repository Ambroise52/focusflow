/**
 * FocusFlow Background Service Worker
 *
 * The "brain" of the extension - runs persistently in the background.
 * Handles initialization, periodic tasks, message passing, and coordinates
 * between tab monitoring, auto-grouping, and tab management.
 *
 * @module background/index
 */

import * as TabManager from './tabManager';
import { handleSuggestionNotificationClick } from './autoGrouping';
import { syncWorkspaces } from '../lib/supabase';
import {
  initializeStorage,
  getSettings,
  updateSettings,
  cleanupOldWorkspaces,
  getWorkspaces,
  saveWorkspace,
} from '../lib/storage';
import { DEBUG, ALARM_NAMES } from '../lib/constants';
import { initializeTabListeners } from './tabListener';

// ─────────────────────────────────────────────
// INSTALLATION HANDLER
// ─────────────────────────────────────────────

/**
 * Extension installation handler.
 * Runs on first install, update, or Chrome update.
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  try {
    if (DEBUG) {
      console.log('🚀 FocusFlow installing...', details);
    }

    if (details.reason === 'install') {
      await handleFirstInstall();
    } else if (details.reason === 'update') {
      await handleUpdate(details.previousVersion);
    }

    // Set up periodic alarms (run regardless of install/update)
    await setupAlarms();

    // Initialize tab listeners
    initializeTabListeners();

    // Build initial context menu (no workspaces yet on fresh install)
    await rebuildWorkspaceContextMenu([]);

    if (DEBUG) {
      console.log('✅ FocusFlow installation complete');
    }
  } catch (error) {
    console.error('❌ Installation failed:', error);
  }
});

// ─────────────────────────────────────────────
// FIRST INSTALL
// ─────────────────────────────────────────────

/**
 * Handle first-time installation.
 * Initializes default settings and creates a welcome workspace.
 */
async function handleFirstInstall(): Promise<void> {
  if (DEBUG) {
    console.log('📦 First install detected - initializing...');
  }

  await initializeStorage();

  const welcomeWorkspace = {
    id: crypto.randomUUID(),
    name: '👋 Welcome to FocusFlow',
    tabs: [
      {
        id: 0,
        url: 'https://github.com/Ambroise57/focusflow',
        title: 'FocusFlow - GitHub Repository',
        isImportant: true,
        lastAccessed: Date.now(),
        workspaceId: crypto.randomUUID(),
      },
    ],
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
    isActive: false,
    isPaused: true,
    icon: '👋',
  };

  await saveWorkspace(welcomeWorkspace);

  if (DEBUG) {
    chrome.tabs.create({
      url: 'https://github.com/Ambroise57/focusflow',
      active: true,
    });
    console.log('✅ First install complete - welcome workspace created');
  }
}

// ─────────────────────────────────────────────
// UPDATE HANDLER
// ─────────────────────────────────────────────

/**
 * Handle extension updates.
 * Migrate data if needed between versions.
 *
 * @param previousVersion - The version number before the update
 */
async function handleUpdate(previousVersion?: string): Promise<void> {
  if (DEBUG) {
    console.log(`🔄 Updating from version ${previousVersion}`);
  }

  const currentVersion = chrome.runtime.getManifest().version;
  console.log(`✅ Updated to version ${currentVersion}`);
}

// ─────────────────────────────────────────────
// ALARMS
// ─────────────────────────────────────────────

/**
 * Set up periodic alarms for background tasks.
 * - Cleanup:      Remove old archived workspaces (daily at 3 AM)
 * - Sync:         Cloud sync for premium users (every 30 minutes)
 * - Memory Check: Suggest discarding unused tabs (every hour)
 */
async function setupAlarms(): Promise<void> {
  if (DEBUG) {
    console.log('⏰ Setting up periodic alarms...');
  }

  await chrome.alarms.clearAll();

  chrome.alarms.create(ALARM_NAMES.CLEANUP, {
    when: getNextHour(3),
    periodInMinutes: 60 * 24,
  });

  chrome.alarms.create(ALARM_NAMES.SYNC, {
    delayInMinutes: 1,
    periodInMinutes: 30,
  });

  chrome.alarms.create(ALARM_NAMES.MEMORY_CHECK, {
    delayInMinutes: 5,
    periodInMinutes: 60,
  });

  if (DEBUG) {
    console.log('✅ Alarms configured');
  }
}

/**
 * Calculate the next occurrence of a specific hour for daily alarms.
 *
 * @param hour - Target hour (0-23)
 * @returns Timestamp in milliseconds
 */
function getNextHour(hour: number): number {
  const now    = new Date();
  const target = new Date();
  target.setHours(hour, 0, 0, 0);

  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }

  return target.getTime();
}

// ─────────────────────────────────────────────
// CONTEXT MENU — DYNAMIC WORKSPACE ITEMS
// ─────────────────────────────────────────────

/**
 * Rebuilds the "Add to workspace" context menu dynamically
 * from the current list of saved workspaces.
 *
 * Called:
 *  - On install/startup (with empty list initially)
 *  - When quickActions.tsx sends REBUILD_CONTEXT_MENU
 *  - After ADD_CURRENT_TAB_TO_WORKSPACE mutates workspace data
 *
 * @param workspaces - Array of { id, name } workspace summaries
 */
async function rebuildWorkspaceContextMenu(
  workspaces: { id: string; name: string }[]
): Promise<void> {
  // Remove all existing FocusFlow context menu items
  await chrome.contextMenus.removeAll();

  // Root parent item
  chrome.contextMenus.create({
    id:       'focusflow-root',
    title:    'FocusFlow',
    contexts: ['page'],
  });

  if (workspaces.length === 0) {
    // Placeholder when no workspaces exist yet
    chrome.contextMenus.create({
      id:       'focusflow-no-workspaces',
      parentId: 'focusflow-root',
      title:    'No workspaces yet — open FocusFlow to create one',
      contexts: ['page'],
      enabled:  false,
    });
    return;
  }

  // One sub-item per workspace
  workspaces.forEach(({ id, name }) => {
    chrome.contextMenus.create({
      id:       `add-to-workspace-${id}`,
      parentId: 'focusflow-root',
      title:    `Add to "${name}"`,
      contexts: ['page'],
    });
  });
}

// ─────────────────────────────────────────────
// ALARM LISTENER
// ─────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (DEBUG) {
    console.log(`⏰ Alarm triggered: ${alarm.name}`);
  }

  try {
    switch (alarm.name) {
      case ALARM_NAMES.CLEANUP:
        await handleCleanup();
        break;

      case ALARM_NAMES.SYNC:
        await handleSync();
        break;

      case ALARM_NAMES.MEMORY_CHECK:
        await handleMemoryCheck();
        break;

      default:
        console.warn(`Unknown alarm: ${alarm.name}`);
    }
  } catch (error) {
    console.error(`❌ Alarm handler failed (${alarm.name}):`, error);
  }
});

// ─────────────────────────────────────────────
// ALARM HANDLERS
// ─────────────────────────────────────────────

/**
 * Cleanup handler — removes archived workspaces older than 30 days.
 * Runs daily at 3 AM.
 */
async function handleCleanup(): Promise<void> {
  if (DEBUG) {
    console.log('🧹 Running cleanup...');
  }

  try {
    // cleanupOldWorkspaces() takes no arguments — it uses 30-day default internally
    await cleanupOldWorkspaces();

    if (DEBUG) {
      console.log('✅ Cleanup complete');
    }
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
  }
}

/**
 * Sync handler — cloud sync for premium users.
 * Runs every 30 minutes.
 */
async function handleSync(): Promise<void> {
  try {
    const settings = await getSettings();

    if (!settings.isPremium || !settings.syncEnabled) {
      if (DEBUG) {
        console.log('⏭️  Skipping sync (not premium or sync disabled)');
      }
      return;
    }

    if (DEBUG) {
      console.log('☁️  Syncing workspaces to cloud...');
    }

    const result = await syncWorkspaces();

    if (DEBUG) {
      console.log('✅ Sync complete:', result);
    }
  } catch (error) {
    console.error('❌ Sync failed:', error);
  }
}

/**
 * Memory check handler — logs unused tab count.
 * Runs every hour.
 */
async function handleMemoryCheck(): Promise<void> {
  if (DEBUG) {
    console.log('💾 Checking memory usage...');
  }

  try {
    const settings = await getSettings();

    if (!settings.enableAutoGrouping) return;

    const tabs = await chrome.tabs.query({});
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    const unusedTabs = tabs.filter(
      (tab) =>
        !tab.pinned &&
        !tab.active &&
        tab.lastAccessed &&
        tab.lastAccessed < oneHourAgo
    );

    if (DEBUG && unusedTabs.length >= 10) {
      console.log(
        `💡 Found ${unusedTabs.length} unused tabs - could suggest grouping`
      );
    }
  } catch (error) {
    console.error('❌ Memory check failed:', error);
  }
}

// ─────────────────────────────────────────────
// ADD TAB TO WORKSPACE HELPER
// ─────────────────────────────────────────────

/**
 * Adds a tab (sent from the content script) into a workspace.
 * Deduplicates by URL, then updates storage and refreshes context menus
 * in all open tabs.
 *
 * @param workspaceId - UUID of the target workspace
 * @param url         - Sanitized URL of the tab to add
 * @param title       - Page title of the tab to add
 */
async function handleAddTabToWorkspace(
  workspaceId: string,
  url: string,
  title: string
): Promise<void> {
  try {
    const workspaces = await getWorkspaces();
    const workspace  = workspaces.find((w) => w.id === workspaceId);

    if (!workspace) {
      console.warn('[FocusFlow] Workspace not found:', workspaceId);
      return;
    }

    // Avoid duplicate URLs in the same workspace
    const alreadyExists = workspace.tabs.some((t) => t.url === url);
    if (alreadyExists) return;

    workspace.tabs.push({
      id:           Date.now(), // synthetic ID for manually added tabs
      url,
      title,
      isImportant:  false,
      lastAccessed: Date.now(),
      workspaceId,
    });

    workspace.lastUsedAt = Date.now();
    await saveWorkspace(workspace);

    // Rebuild context menus in all tabs so names stay current
    const updatedWorkspaces = await getWorkspaces();
    const menuItems = updatedWorkspaces.map((w) => ({ id: w.id, name: w.name }));
    await rebuildWorkspaceContextMenu(menuItems);

    // Notify all content scripts to refresh their local menu request
    const openTabs = await chrome.tabs.query({});
    openTabs.forEach((tab) => {
      if (tab.id) {
        chrome.tabs
          .sendMessage(tab.id, { action: 'REFRESH_CONTEXT_MENU' })
          .catch(() => {
            // Tab may not have the content script injected — silently ignore
          });
      }
    });
  } catch (err) {
    console.error('[FocusFlow] Failed to add tab to workspace:', err);
  }
}

// ─────────────────────────────────────────────
// MESSAGE HANDLER
// ─────────────────────────────────────────────

/**
 * Handles all messages from the popup and content scripts.
 * Every case must call sendResponse() exactly once.
 */
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (DEBUG) {
    console.log('📨 Message received:', request);
  }

  (async () => {
    try {
      switch (request.action) {

        // ── Existing handlers ──────────────────────────────────

        case 'GET_WORKSPACES': {
          const workspaces = await getWorkspaces();
          sendResponse({ success: true, data: workspaces });
          break;
        }

        case 'GET_SETTINGS': {
          const settings = await getSettings();
          sendResponse({ success: true, data: settings });
          break;
        }

        case 'UPDATE_SETTINGS':
          await updateSettings(request.data);
          sendResponse({ success: true });
          break;

        case 'TRIGGER_SYNC':
          await handleSync();
          sendResponse({ success: true });
          break;

        case 'TRIGGER_CLEANUP':
          await handleCleanup();
          sendResponse({ success: true });
          break;

        case 'PAUSE_WORKSPACE': {
          const result = await TabManager.pauseWorkspace(request.workspaceId);
          sendResponse({ success: true, data: result });
          break;
        }

        case 'RESUME_WORKSPACE': {
          const result = await TabManager.resumeWorkspace(request.workspaceId);
          sendResponse({ success: true, data: result });
          break;
        }

        case 'FIND_DUPLICATES': {
          const result = await TabManager.findDuplicateTabs(request.closeAutomatically);
          sendResponse({ success: true, data: result });
          break;
        }

        case 'GET_MEMORY_STATS': {
          const result = await TabManager.getMemoryStats();
          sendResponse({ success: true, data: result });
          break;
        }

        case 'FIND_STALE_TABS': {
          const result = await TabManager.findStaleTabs(request.daysThreshold);
          sendResponse({ success: true, data: result });
          break;
        }

        case 'MOVE_TABS': {
          const result = await TabManager.moveTabsToWorkspace(
            request.tabIds,
            request.workspaceId
          );
          sendResponse({ success: true, data: result });
          break;
        }

        case 'CLOSE_WORKSPACE_TABS': {
          const result = await TabManager.closeWorkspaceTabs(request.workspaceId);
          sendResponse({ success: true, data: result });
          break;
        }

        // ── NEW: 3 handlers required by quickActions.tsx ───────

        /**
         * OPEN_POPUP
         * Triggered by Cmd/Ctrl+Shift+K keyboard shortcut in content script.
         * chrome.action.openPopup() only works from the background context.
         */
        case 'OPEN_POPUP':
          try {
            await chrome.action.openPopup();
          } catch {
            // openPopup() throws if popup is already open — not critical
          }
          sendResponse({ success: true });
          break;

        /**
         * REBUILD_CONTEXT_MENU
         * Triggered by quickActions.tsx on every page load to keep
         * workspace names in the right-click menu up to date.
         */
        case 'REBUILD_CONTEXT_MENU':
          await rebuildWorkspaceContextMenu(request.workspaces ?? []);
          sendResponse({ success: true });
          break;

        /**
         * ADD_CURRENT_TAB_TO_WORKSPACE
         * Triggered when the user selects a workspace from the
         * right-click context menu on any page.
         */
        case 'ADD_CURRENT_TAB_TO_WORKSPACE':
          await handleAddTabToWorkspace(
            request.workspaceId,
            request.url,
            request.title
          );
          sendResponse({ success: true });
          break;

        // ── Fallthrough ────────────────────────────────────────

        default:
          console.warn('Unknown action:', request.action);
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('❌ Message handler error:', error);
      sendResponse({ success: false, error: String(error) });
    }
  })();

  // Return true to keep message channel open for async sendResponse
  return true;
});

// ─────────────────────────────────────────────
// STARTUP HANDLER
// ─────────────────────────────────────────────

/**
 * Extension startup handler.
 * Runs when Chrome starts (browser opened after being closed).
 */
chrome.runtime.onStartup.addListener(async () => {
  if (DEBUG) {
    console.log('🌅 Chrome starting - FocusFlow initializing...');
  }

  try {
    await setupAlarms();
    initializeTabListeners();

    // Rebuild context menu with current workspaces on startup
    const workspaces = await getWorkspaces();
    await rebuildWorkspaceContextMenu(
      workspaces.map((w) => ({ id: w.id, name: w.name }))
    );

    const settings = await getSettings();

    if (DEBUG) {
      console.log('✅ FocusFlow ready', {
        premium:      settings.isPremium,
        sync:         settings.syncEnabled,
        autoGrouping: settings.enableAutoGrouping,
      });
    }
  } catch (error) {
    console.error('❌ Startup failed:', error);
  }
});

// ─────────────────────────────────────────────
// CONTEXT MENU CLICK HANDLER
// ─────────────────────────────────────────────

/**
 * Handles clicks on all FocusFlow context menu items.
 * Routes "add-to-workspace-{id}" clicks to the content script
 * on the clicked tab, which then messages back ADD_CURRENT_TAB_TO_WORKSPACE.
 */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (DEBUG) {
    console.log('🖱️  Context menu clicked:', info.menuItemId);
  }

  try {
    const menuId = String(info.menuItemId);

    if (menuId.startsWith('add-to-workspace-')) {
      const workspaceId = menuId.replace('add-to-workspace-', '');
      const url         = info.pageUrl ?? tab?.url ?? '';
      const title       = tab?.title ?? url;

      if (tab?.id) {
        // Forward to content script first so it can sanitize the URL
        chrome.tabs
          .sendMessage(tab.id, {
            action: 'CONTEXT_MENU_CLICKED',
            workspaceId,
            url,
            title,
          })
          .catch(() => {
            // Fallback: handle directly in background if content script
            // is not injected on this page (e.g. chrome:// pages)
            handleAddTabToWorkspace(workspaceId, url, title);
          });
      }
    }
  } catch (error) {
    console.error('❌ Context menu handler error:', error);
  }
});

// ─────────────────────────────────────────────
// NOTIFICATION HANDLER
// ─────────────────────────────────────────────

chrome.notifications.onButtonClicked.addListener(
  async (notificationId, buttonIndex) => {
    if (notificationId.startsWith('suggestion-')) {
      await handleSuggestionNotificationClick(notificationId, buttonIndex);
    }
  }
);

// ─────────────────────────────────────────────
// BOOT LOG
// ─────────────────────────────────────────────

if (DEBUG) {
  console.log('✅ FocusFlow background service worker loaded');
  console.log(`Version: ${chrome.runtime.getManifest().version}`);
}

// ─────────────────────────────────────────────
// EXPORTS (for testing)
// ─────────────────────────────────────────────

export {
  handleFirstInstall,
  handleUpdate,
  setupAlarms,
  handleCleanup,
  handleSync,
  handleMemoryCheck,
};
