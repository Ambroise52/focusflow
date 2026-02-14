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
import { 
  initializeStorage, 
  getSettings, 
  updateSettings,
  cleanupOldWorkspaces,
  getWorkspaces,
  saveWorkspace
} from '../lib/storage';
import { DEBUG, ALARM_NAMES } from '../lib/constants';
import { initializeTabListeners } from './tabListener';
import type { UserSettings } from '../types/settings';

/**
 * Extension installation handler
 * Runs on first install, update, or Chrome update
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

    if (DEBUG) {
      console.log('✅ FocusFlow installation complete');
    }
  } catch (error) {
    console.error('❌ Installation failed:', error);
  }
});

/**
 * Handle first-time installation
 * Initialize default settings and welcome workspace
 */
async function handleFirstInstall(): Promise<void> {
  if (DEBUG) {
    console.log('📦 First install detected - initializing...');
  }

  // Initialize storage with default values
  await initializeStorage();

  // Create a welcome workspace with helpful tabs
  const welcomeWorkspace = {
    id: crypto.randomUUID(),
    name: '👋 Welcome to FocusFlow',
    tabs: [
      {
        id: 0, // Placeholder ID (will be replaced when tabs are actually opened)
        url: 'https://github.com/Ambroise57/focusflow',
        title: 'FocusFlow - GitHub Repository',
        isImportant: true,
        lastAccessed: Date.now(),
        workspaceId: crypto.randomUUID()
      }
    ],
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
    isActive: false,
    isPaused: true,
    icon: '👋'
  };

  await saveWorkspace(welcomeWorkspace);

  // Open welcome page (optional - can be disabled in production)
  if (DEBUG) {
    chrome.tabs.create({
      url: 'https://github.com/Ambroise57/focusflow',
      active: true
    });
  }

  if (DEBUG) {
    console.log('✅ First install complete - welcome workspace created');
  }
}

/**
 * Handle extension updates
 * Migrate data if needed between versions
 * 
 * @param previousVersion - The version number before the update
 */
async function handleUpdate(previousVersion?: string): Promise<void> {
  if (DEBUG) {
    console.log(`🔄 Updating from version ${previousVersion}`);
  }

  // Future migration logic can go here
  // Example:
  // if (previousVersion && compareVersions(previousVersion, '2.0.0') < 0) {
  //   await migrateToV2();
  // }

  // For now, just log the update
  const currentVersion = chrome.runtime.getManifest().version;
  console.log(`✅ Updated to version ${currentVersion}`);
}

/**
 * Set up periodic alarms for background tasks
 * - Cleanup: Remove old archived workspaces (daily)
 * - Sync: Cloud sync for premium users (every 30 minutes)
 * - Memory: Suggest discarding unused tabs (every hour)
 */
async function setupAlarms(): Promise<void> {
  if (DEBUG) {
    console.log('⏰ Setting up periodic alarms...');
  }

  // Clear existing alarms to avoid duplicates
  await chrome.alarms.clearAll();

  // Daily cleanup at 3 AM
  chrome.alarms.create(ALARM_NAMES.CLEANUP, {
    when: getNextMidnight(3), // 3 AM
    periodInMinutes: 60 * 24 // Daily
  });

  // Cloud sync every 30 minutes (for premium users)
  chrome.alarms.create(ALARM_NAMES.SYNC, {
    delayInMinutes: 1, // Start 1 minute after install
    periodInMinutes: 30
  });

  // Memory optimization check every hour
  chrome.alarms.create(ALARM_NAMES.MEMORY_CHECK, {
    delayInMinutes: 5,
    periodInMinutes: 60
  });

  if (DEBUG) {
    console.log('✅ Alarms configured');
  }
}

/**
 * Calculate the next occurrence of a specific hour (for daily alarms)
 * 
 * @param hour - Target hour (0-23)
 * @returns Timestamp in milliseconds
 */
function getNextMidnight(hour: number): number {
  const now = new Date();
  const target = new Date();
  target.setHours(hour, 0, 0, 0);

  // If target time has passed today, schedule for tomorrow
  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }

  return target.getTime();
}

/**
 * Alarm listener - handles periodic background tasks
 */
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

/**
 * Cleanup handler - remove old archived workspaces
 * Runs daily at 3 AM
 */
async function handleCleanup(): Promise<void> {
  if (DEBUG) {
    console.log('🧹 Running cleanup...');
  }

  try {
    const deleted = await cleanupOldWorkspaces(30); // 30-day retention
    
    if (DEBUG) {
      console.log(`✅ Cleanup complete - removed ${deleted} old workspaces`);
    }
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
  }
}

/**
 * Sync handler - cloud sync for premium users
 * Runs every 30 minutes
 */
async function handleSync(): Promise<void> {
  try {
    const settings = await getSettings();
    
    // Only sync if user is premium and has sync enabled
    if (!settings.isPremium || !settings.syncEnabled) {
      if (DEBUG) {
        console.log('⏭️  Skipping sync (not premium or sync disabled)');
      }
      return;
    }

    if (DEBUG) {
      console.log('☁️  Syncing workspaces to cloud...');
    }

    // Import supabase sync function dynamically to avoid loading for free users
    const { syncWorkspaces } = await import('../lib/supabase');
    const result = await syncWorkspaces();

    if (DEBUG) {
      console.log('✅ Sync complete:', result);
    }
  } catch (error) {
    console.error('❌ Sync failed:', error);
  }
}

/**
 * Memory check handler - suggest discarding unused tabs
 * Runs every hour
 */
async function handleMemoryCheck(): Promise<void> {
  if (DEBUG) {
    console.log('💾 Checking memory usage...');
  }

  try {
    const settings = await getSettings();
    
    // Only run if user has auto-grouping enabled
    if (!settings.enableAutoGrouping) {
      return;
    }

    // Get all tabs
    const tabs = await chrome.tabs.query({});
    const unusedTabs = tabs.filter(tab => {
      // Find tabs that haven't been accessed in 1 hour and aren't pinned
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      return !tab.pinned && 
             !tab.active && 
             tab.lastAccessed && 
             tab.lastAccessed < oneHourAgo;
    });

    if (unusedTabs.length >= 10) {
      // Show notification suggesting to pause unused tabs
      if (DEBUG) {
        console.log(`💡 Found ${unusedTabs.length} unused tabs - could suggest grouping`);
      }

      // This will trigger auto-grouping suggestion in tabListener
      // (which we'll build in the next file)
    }
  } catch (error) {
    console.error('❌ Memory check failed:', error);
  }
}

/**
 * Message handler - handles requests from popup and content scripts
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (DEBUG) {
    console.log('📨 Message received:', request);
  }

  // Handle messages asynchronously
  (async () => {
    try {
      switch (request.action) {
        case 'GET_WORKSPACES':
          const workspaces = await getWorkspaces();
          sendResponse({ success: true, data: workspaces });
          break;

        case 'GET_SETTINGS':
          const settings = await getSettings();
          sendResponse({ success: true, data: settings });
          break;

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

        case 'PAUSE_WORKSPACE':
          const pauseResult = await TabManager.pauseWorkspace(request.workspaceId);
          sendResponse({ success: true, data: pauseResult });
          break;

        case 'RESUME_WORKSPACE':
          const resumeResult = await TabManager.resumeWorkspace(request.workspaceId);
          sendResponse({ success: true, data: resumeResult });
          break;

        case 'FIND_DUPLICATES':
          const dupResult = await TabManager.findDuplicateTabs(request.closeAutomatically);
          sendResponse({ success: true, data: dupResult });
          break;

        case 'GET_MEMORY_STATS':
          const memStats = await TabManager.getMemoryStats();
          sendResponse({ success: true, data: memStats });
          break;

        case 'FIND_STALE_TABS':
          const staleResult = await TabManager.findStaleTabs(request.daysThreshold);
          sendResponse({ success: true, data: staleResult });
          break;

        case 'MOVE_TABS':
          const moveResult = await TabManager.moveTabsToWorkspace(
            request.tabIds, 
            request.workspaceId
          );
          sendResponse({ success: true, data: moveResult });
          break;

        case 'CLOSE_WORKSPACE_TABS':
          const closeResult = await TabManager.closeWorkspaceTabs(request.workspaceId);
          sendResponse({ success: true, data: closeResult });
          break;

        default:
          console.warn('Unknown action:', request.action);
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('❌ Message handler error:', error);
      sendResponse({ success: false, error: String(error) });
    }
  })();

  // Return true to indicate we'll send response asynchronously
  return true;
});

/**
 * Extension startup handler
 * Runs when Chrome starts (browser opened)
 */
chrome.runtime.onStartup.addListener(async () => {
  if (DEBUG) {
    console.log('🌅 Chrome starting - FocusFlow initializing...');
  }

  try {
    // Ensure alarms are set up (in case they were cleared)
    await setupAlarms();

    // Initialize tab listeners
    initializeTabListeners();

    // Log startup
    const settings = await getSettings();
    if (DEBUG) {
      console.log('✅ FocusFlow ready', {
        premium: settings.isPremium,
        sync: settings.syncEnabled,
        autoGrouping: settings.enableAutoGrouping
      });
    }
  } catch (error) {
    console.error('❌ Startup failed:', error);
  }
});

/**
 * Context menu handler (optional)
 * Add right-click menu items for quick actions
 */
chrome.runtime.onInstalled.addListener(() => {
  // Create context menu items
  chrome.contextMenus.create({
    id: 'save-to-workspace',
    title: 'Save tab to workspace',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'create-workspace',
    title: 'Create workspace from tabs',
    contexts: ['page']
  });
});

/**
 * Context menu click handler
 */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (DEBUG) {
    console.log('🖱️  Context menu clicked:', info.menuItemId);
  }

  try {
    switch (info.menuItemId) {
      case 'save-to-workspace':
        // Open popup to select workspace
        chrome.action.openPopup();
        break;

      case 'create-workspace':
        // This will be handled by autoGrouping module
        if (DEBUG) {
          console.log('Creating workspace from current tabs...');
        }
        break;
    }
  } catch (error) {
    console.error('❌ Context menu handler error:', error);
  }
});

// Log that background script is loaded
if (DEBUG) {
  console.log('✅ FocusFlow background service worker loaded');
  console.log(`Version: ${chrome.runtime.getManifest().version}`);
}

/**
 * Notification button click handler
 */
chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  if (notificationId.startsWith('suggestion-')) {
    await handleSuggestionNotificationClick(notificationId, buttonIndex);
  }
});

// Export for testing (if needed)
export { 
  handleFirstInstall, 
  handleUpdate, 
  setupAlarms, 
  handleCleanup, 
  handleSync,
  handleMemoryCheck 
};
