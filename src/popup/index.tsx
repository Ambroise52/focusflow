/**
 * FocusFlow Popup UI - Main Entry Point
 * 
 * The primary user interface shown when clicking the extension icon.
 * Displays active tabs and workspace library in a clean, minimalist design.
 * 
 * Dimensions: 400px (width) × 600px (height)
 * Theme: Dark mode by default with black & white aesthetic
 * 
 * @module popup/index
 */

import React, { useState, useEffect } from 'react';
import { LayoutGrid, Folder, Settings, Menu } from 'lucide-react';
import type { Workspace } from '../types/workspace';
import type { UserSettings } from '../types/settings';

/**
 * View types for tab navigation
 */
type ViewType = 'active' | 'workspaces';

/**
 * Main Popup Component
 * Entry point for the extension popup UI
 */
function FocusFlowPopup() {
  // State management
  const [currentView, setCurrentView] = useState<ViewType>('active');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load initial data on mount
  useEffect(() => {
    loadInitialData();
  }, []);

  /**
   * Load workspaces and settings from background worker
   */
  const loadInitialData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Request workspaces from background worker
      const workspacesResponse = await chrome.runtime.sendMessage({
        action: 'GET_WORKSPACES'
      });

      // Request settings from background worker
      const settingsResponse = await chrome.runtime.sendMessage({
        action: 'GET_SETTINGS'
      });

      if (workspacesResponse.success) {
        setWorkspaces(workspacesResponse.data || []);
      }

      if (settingsResponse.success) {
        setSettings(settingsResponse.data);
      }

    } catch (err) {
      console.error('Failed to load data:', err);
      setError('Failed to load data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Refresh data manually
   */
  const handleRefresh = () => {
    loadInitialData();
  };

  return (
    <div className="w-[400px] h-[600px] bg-[#0A0A0A] text-white flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-[#1A1A1A] border-b border-[#2A2A2A] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#3B82F6] rounded-lg flex items-center justify-center">
            <LayoutGrid size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold">FocusFlow</h1>
            <p className="text-xs text-gray-400">Tab Manager</p>
          </div>
        </div>

        {/* Settings button */}
        <button
          onClick={() => {/* TODO: Open settings modal */}}
          className="p-2 hover:bg-[#2A2A2A] rounded-lg transition-colors"
          aria-label="Settings"
        >
          <Settings size={18} className="text-gray-400" />
        </button>
      </header>

      {/* Tab Navigation */}
      <nav className="bg-[#0A0A0A] border-b border-[#2A2A2A] px-4 flex gap-1">
        <button
          onClick={() => setCurrentView('active')}
          className={`
            flex-1 py-3 text-sm font-medium transition-all
            ${currentView === 'active' 
              ? 'text-white border-b-2 border-[#3B82F6]' 
              : 'text-gray-400 hover:text-gray-300'
            }
          `}
        >
          <div className="flex items-center justify-center gap-2">
            <Menu size={16} />
            Active Tabs
          </div>
        </button>

        <button
          onClick={() => setCurrentView('workspaces')}
          className={`
            flex-1 py-3 text-sm font-medium transition-all
            ${currentView === 'workspaces' 
              ? 'text-white border-b-2 border-[#3B82F6]' 
              : 'text-gray-400 hover:text-gray-300'
            }
          `}
        >
          <div className="flex items-center justify-center gap-2">
            <Folder size={16} />
            Workspaces ({workspaces.length})
          </div>
        </button>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">
        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={handleRefresh} />
        ) : (
          <>
            {currentView === 'active' ? (
              <ActiveSessionPlaceholder />
            ) : (
              <WorkspaceLibraryPlaceholder workspaces={workspaces} />
            )}
          </>
        )}
      </main>

      {/* Footer - Memory Stats */}
      {!isLoading && !error && (
        <footer className="bg-[#1A1A1A] border-t border-[#2A2A2A] px-4 py-2">
          <MemoryStats />
        </footer>
      )}
    </div>
  );
}

/**
 * Loading skeleton component
 */
function LoadingState() {
  return (
    <div className="p-4 space-y-4">
      <div className="animate-pulse space-y-3">
        {/* Skeleton items */}
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-3 p-3 bg-[#1A1A1A] rounded-lg">
            <div className="w-8 h-8 bg-[#2A2A2A] rounded"></div>
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-[#2A2A2A] rounded w-3/4"></div>
              <div className="h-3 bg-[#2A2A2A] rounded w-1/2"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Error state component
 */
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
        <span className="text-3xl">⚠️</span>
      </div>
      <h3 className="text-lg font-semibold mb-2">Something went wrong</h3>
      <p className="text-sm text-gray-400 mb-4">{message}</p>
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-[#3B82F6] hover:bg-[#2563EB] rounded-lg text-sm font-medium transition-colors"
      >
        Try Again
      </button>
    </div>
  );
}

/**
 * Placeholder for Active Session view (will be replaced with actual component)
 */
function ActiveSessionPlaceholder() {
  const [tabCount, setTabCount] = useState(0);

  useEffect(() => {
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      setTabCount(tabs.length);
    });
  }, []);

  return (
    <div className="p-4">
      <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg p-8 text-center">
        <div className="w-16 h-16 bg-[#3B82F6]/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <Menu size={32} className="text-[#3B82F6]" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Active Session</h3>
        <p className="text-sm text-gray-400 mb-4">
          You have {tabCount} tab{tabCount !== 1 ? 's' : ''} open
        </p>
        <p className="text-xs text-gray-500">
          Coming soon: See all your active tabs here
        </p>
      </div>
    </div>
  );
}

/**
 * Placeholder for Workspace Library view (will be replaced with actual component)
 */
function WorkspaceLibraryPlaceholder({ workspaces }: { workspaces: Workspace[] }) {
  if (workspaces.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="w-16 h-16 bg-[#3B82F6]/10 rounded-full flex items-center justify-center mb-4">
          <Folder size={32} className="text-[#3B82F6]" />
        </div>
        <h3 className="text-lg font-semibold mb-2">No workspaces yet</h3>
        <p className="text-sm text-gray-400 mb-4">
          Create your first workspace to get started organizing your tabs
        </p>
        <button className="px-4 py-2 bg-[#3B82F6] hover:bg-[#2563EB] rounded-lg text-sm font-medium transition-colors">
          Create Workspace
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-400">Your Workspaces</h3>
        <button className="text-xs text-[#3B82F6] hover:text-[#2563EB] font-medium">
          + New
        </button>
      </div>

      {workspaces.map((workspace) => (
        <div
          key={workspace.id}
          className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg p-4 hover:border-[#3B82F6]/30 transition-colors cursor-pointer"
        >
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              {workspace.icon && <span className="text-lg">{workspace.icon}</span>}
              <h4 className="font-medium">{workspace.name}</h4>
            </div>
            <span className="text-xs text-gray-500">
              {workspace.tabs.length} tabs
            </span>
          </div>
          <p className="text-xs text-gray-400">
            {workspace.isPaused ? '⏸️ Paused' : '▶️ Active'} • 
            Last used {formatRelativeTime(workspace.lastUsedAt)}
          </p>
        </div>
      ))}
    </div>
  );
}

/**
 * Memory stats footer component
 */
function MemoryStats() {
  const [stats, setStats] = useState({ memorySavedMB: 0, pausedTabs: 0 });

  useEffect(() => {
    // Request memory stats from background worker
    chrome.runtime.sendMessage({ action: 'GET_MEMORY_STATS' })
      .then(response => {
        if (response.success) {
          setStats({
            memorySavedMB: response.data.memorySavedMB,
            pausedTabs: response.data.pausedTabs
          });
        }
      })
      .catch(console.error);
  }, []);

  if (stats.pausedTabs === 0) {
    return (
      <p className="text-xs text-gray-400 text-center">
        💡 Pause workspaces to save memory
      </p>
    );
  }

  return (
    <div className="flex items-center justify-center gap-2 text-xs">
      <span className="text-gray-400">💾</span>
      <span className="text-gray-300">
        Saved <span className="font-semibold text-[#3B82F6]">
          {formatMemory(stats.memorySavedMB)}
        </span>
      </span>
      <span className="text-gray-500">•</span>
      <span className="text-gray-400">
        {stats.pausedTabs} tab{stats.pausedTabs !== 1 ? 's' : ''} paused
      </span>
    </div>
  );
}

/**
 * Format memory size (MB/GB)
 */
function formatMemory(mb: number): string {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  return `${Math.round(mb)} MB`;
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  
  return new Date(timestamp).toLocaleDateString();
}

// Export as default for Plasmo framework
export default FocusFlowPopup;
