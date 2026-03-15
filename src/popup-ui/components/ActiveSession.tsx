import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Cpu,
  CheckSquare,
  FolderPlus,
  RefreshCw,
  Layers,
  X,
  Wind,
} from "lucide-react";

import TabItem from "./TabItem";
import { calculateMemorySaved, sanitizeUrl, generateId } from "../../lib/utils";
import { getMemoryStats } from "../../background/tabManager";
import { saveWorkspace } from "../../lib/storage";

import type { Tab } from "../../types/tab";
import type { Workspace } from "../../types/workspace";

// ─────────────────────────────────────────────
// Sub-component: skeleton placeholder row
// ─────────────────────────────────────────────
const SkeletonRow: React.FC = () => (
  <div className="flex items-center gap-2 px-3 py-2 rounded-lg animate-pulse">
    <span className="w-4 h-4 rounded-sm bg-neutral-800 flex-shrink-0" />
    <div className="flex-1 space-y-1.5 min-w-0">
      <span className="block h-2.5 bg-neutral-800 rounded w-3/4" />
      <span className="block h-2 bg-neutral-800 rounded w-1/3" />
    </div>
  </div>
);

// ─────────────────────────────────────────────
// Sub-component: empty state
// ─────────────────────────────────────────────
const EmptyState: React.FC<{ onRefresh: () => void }> = ({ onRefresh }) => (
  <div className="flex flex-col items-center justify-center py-12 px-6 text-center gap-4">
    <div className="w-16 h-16 rounded-2xl bg-neutral-800/60 flex items-center justify-center">
      <Wind size={28} className="text-neutral-600" strokeWidth={1.5} />
    </div>
    <div className="space-y-1">
      <p className="text-[13px] font-semibold text-neutral-300">No tabs open</p>
      <p className="text-[11px] text-neutral-600 leading-relaxed">
        Open a few tabs and they'll appear here,<br />
        ready to be grouped into a workspace.
      </p>
    </div>
    <button
      onClick={onRefresh}
      className="
        flex items-center gap-1.5 px-3 py-1.5 rounded-lg
        text-[11px] font-medium text-neutral-400
        border border-neutral-800 hover:border-neutral-700
        hover:text-neutral-200 transition-colors
      "
    >
      <RefreshCw size={11} strokeWidth={2} />
      Refresh
    </button>
  </div>
);

// ─────────────────────────────────────────────
// Sub-component: RAM saved metric pill
// ─────────────────────────────────────────────
const MemoryPill: React.FC<{ savedMb: number }> = ({ savedMb }) => {
  /**
   * Format raw MB value into a human-readable string.
   * e.g. 512 → "512 MB", 1536 → "1.5 GB"
   */
  const formatted =
    savedMb >= 1024
      ? `${(savedMb / 1024).toFixed(1)} GB`
      : `${Math.round(savedMb)} MB`;

  if (savedMb <= 0) return null;

  return (
    <div
      className="
        flex items-center gap-1.5 px-2.5 py-1 rounded-full
        bg-emerald-500/10 border border-emerald-500/20
      "
      title={`FocusFlow has freed approximately ${formatted} of RAM by hibernating paused workspace tabs`}
    >
      <Cpu size={11} className="text-emerald-400" strokeWidth={2} />
      <span className="text-[11px] font-semibold text-emerald-400">
        Saved {formatted} RAM
      </span>
    </div>
  );
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Map a raw chrome.tabs.Tab to the FocusFlow Tab interface.
 * Sanitizes the URL to strip any sensitive query parameters before storing.
 * Preserves isImportant from an existing starred set so stars survive refreshes.
 *
 * @param ct - Raw Chrome tab object
 * @param starredIds - Set of tab IDs the user has currently starred
 */
const mapChromeTab = (ct: chrome.tabs.Tab, starredIds: Set<number>): Tab => ({
  id: ct.id ?? 0,
  url: sanitizeUrl(ct.url ?? ""),
  title: ct.title ?? "Untitled",
  favIconUrl: ct.favIconUrl,
  // BUG FIX: preserve star state across refreshes by checking the starredIds set
  isImportant: starredIds.has(ct.id ?? 0),
  lastAccessed: Date.now(),
  workspaceId: undefined,
});

/**
 * Create a debounced version of a function.
 * Used to prevent chrome.tabs.onUpdated from triggering loadTabs() on every
 * title change, favicon update, or status event — which can fire 20+ times
 * per second on a busy page load.
 *
 * @param fn - Function to debounce
 * @param delay - Milliseconds to wait after the last call before executing
 */
function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────
const ActiveSession: React.FC = () => {
  // ── State ──────────────────────────────────
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [savedMb, setSavedMb] = useState<number>(0);

  /**
   * BUG FIX: Track starred tab IDs in a separate ref so they survive
   * the tab list being rebuilt on every chrome.tabs event.
   * A ref persists across renders without triggering re-renders.
   */
  const starredIdsRef = useRef<Set<number>>(new Set());

  // Bulk-select mode
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Quick Group state
  const [groupName, setGroupName] = useState("");
  const [grouping, setGrouping] = useState(false);
  const [groupSuccess, setGroupSuccess] = useState(false);
  const groupNameRef = useRef<HTMLInputElement>(null);

  // ── Load tabs ──────────────────────────────
  const loadTabs = useCallback(async () => {
    setLoadState("loading");
    try {
      const chromeTabs = await chrome.tabs.query({ currentWindow: true });
      // Filter out chrome:// and extension pages — these cannot be meaningfully managed
      const usable = chromeTabs.filter(
        (t) =>
          t.url &&
          !t.url.startsWith("chrome://") &&
          !t.url.startsWith("chrome-extension://")
      );
      // Pass current starred IDs so stars are preserved after list rebuilds
      setTabs(usable.map((ct) => mapChromeTab(ct, starredIdsRef.current)));
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, []);

  // ── Load RAM savings ───────────────────────
  const loadMemory = useCallback(async () => {
    try {
      const stats = await getMemoryStats();
      setSavedMb(stats.savedMb ?? 0);
    } catch {
      // Non-critical — metric simply won't display if stats are unavailable
      setSavedMb(calculateMemorySaved(0));
    }
  }, []);

  // ── Mount: initial load + tab change listeners ──
  useEffect(() => {
    loadTabs();
    loadMemory();

    const handleTabChange = () => {
      loadTabs();
      loadMemory();
    };

    /**
     * BUG FIX: Debounce the onUpdated handler.
     * chrome.tabs.onUpdated fires on every incremental change (status, title,
     * favicon, audible state, etc.). Without debouncing, a single page load
     * triggers loadTabs() 10–30 times in rapid succession.
     * 300ms delay collapses these into a single call once the tab settles.
     */
    const handleTabUpdated = debounce(handleTabChange, 300);

    chrome.tabs.onCreated.addListener(handleTabChange);
    chrome.tabs.onRemoved.addListener(handleTabChange);
    chrome.tabs.onUpdated.addListener(handleTabUpdated);

    return () => {
      chrome.tabs.onCreated.removeListener(handleTabChange);
      chrome.tabs.onRemoved.removeListener(handleTabChange);
      chrome.tabs.onUpdated.removeListener(handleTabUpdated);
    };
  }, [loadTabs, loadMemory]);

  // Focus name input when select mode activates
  useEffect(() => {
    if (selectMode) groupNameRef.current?.focus();
  }, [selectMode]);

  // ── Handlers ───────────────────────────────

  /**
   * Toggle the isImportant flag on a tab (star / unstar).
   * Updates both the tabs display array and the persistent starredIdsRef
   * so the star survives any subsequent tab list refresh.
   */
  const handleToggleStar = useCallback((tabId: number, current: boolean) => {
    // Update the persistent ref first
    if (current) {
      starredIdsRef.current.delete(tabId);
    } else {
      starredIdsRef.current.add(tabId);
    }
    // Then update display state
    setTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, isImportant: !current } : t))
    );
  }, []);

  /** Close a single tab via the Chrome API and remove it from local state. */
  const handleCloseTab = useCallback(async (tabId: number) => {
    try {
      await chrome.tabs.remove(tabId);
      // Remove from display immediately for snappy UX — onRemoved will also fire
      setTabs((prev) => prev.filter((t) => t.id !== tabId));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(tabId);
        return next;
      });
      // Clean up starred ref too
      starredIdsRef.current.delete(tabId);
    } catch {
      // Tab may already be closed — silently ignore and let onRemoved handle it
    }
  }, []);

  /** Toggle a single tab's selection in bulk-select mode. */
  const handleSelectChange = useCallback((tabId: number, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      selected ? next.add(tabId) : next.delete(tabId);
      return next;
    });
  }, []);

  /** Select all tabs, or clear selection if all are already selected. */
  const handleSelectAll = () => {
    if (selectedIds.size === tabs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tabs.map((t) => t.id)));
    }
  };

  /** Enter or exit bulk-select mode, resetting selection and group name. */
  const handleToggleSelectMode = () => {
    setSelectMode((v) => !v);
    setSelectedIds(new Set());
    setGroupName("");
    setGroupSuccess(false);
  };

  /**
   * Save the currently selected tabs as a new Workspace.
   * Constructs a full Workspace object, persists it to chrome.storage,
   * shows brief success feedback, then exits select mode.
   */
  const handleQuickGroup = async () => {
    const name = groupName.trim();
    if (!name || selectedIds.size === 0) return;

    const selectedTabs = tabs.filter((t) => selectedIds.has(t.id));

    const newWorkspace: Workspace = {
      id: generateId(),
      name,
      tabs: selectedTabs,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      isActive: false,
      isPaused: false,
      color: "#3B82F6",
    };

    setGrouping(true);
    try {
      await saveWorkspace(newWorkspace);
      setGroupSuccess(true);
      setTimeout(() => {
        setSelectMode(false);
        setSelectedIds(new Set());
        setGroupName("");
        setGroupSuccess(false);
      }, 1200);
    } catch {
      // Button returns to normal state — user can retry
    } finally {
      setGrouping(false);
    }
  };

  // ─────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────
  const allSelected = tabs.length > 0 && selectedIds.size === tabs.length;
  const someSelected = selectedIds.size > 0;

  return (
    <section className="flex flex-col h-full" aria-label="Active Session">

      {/* ── Top bar: tab count + RAM metric + action buttons ── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-800/60">

        {/* Left: tab count + RAM saved pill */}
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-[11px] text-neutral-500">
            <Layers size={11} strokeWidth={2} aria-hidden />
            {loadState === "ready"
              ? `${tabs.length} tab${tabs.length !== 1 ? "s" : ""}`
              : "Loading…"}
          </span>
          <MemoryPill savedMb={savedMb} />
        </div>

        {/* Right: Quick Group toggle + Refresh */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleToggleSelectMode}
            title={selectMode ? "Cancel selection" : "Quick Group — select tabs to save as workspace"}
            aria-pressed={selectMode}
            className={`
              flex items-center gap-1 px-2 py-1 rounded-md
              text-[11px] font-medium transition-colors
              ${selectMode
                ? "bg-blue-600/20 text-blue-400 border border-blue-600/30"
                : "text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800"
              }
            `}
          >
            <CheckSquare size={11} strokeWidth={2} />
            {selectMode ? "Cancel" : "Quick Group"}
          </button>

          <button
            onClick={loadTabs}
            title="Refresh tab list"
            aria-label="Refresh tab list"
            className="
              p-1.5 rounded-md text-neutral-600
              hover:text-neutral-300 hover:bg-neutral-800 transition-colors
            "
          >
            <RefreshCw size={11} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* ── Quick Group toolbar (visible only in select mode) ── */}
      {selectMode && (
        <div className="flex items-center gap-2 px-3 py-2 bg-neutral-900/80 border-b border-neutral-800/60">

          {/* Select all checkbox */}
          <input
            type="checkbox"
            checked={allSelected}
            onChange={handleSelectAll}
            aria-label="Select all tabs"
            className="
              h-3.5 w-3.5 rounded border-neutral-600
              bg-neutral-800 accent-blue-500
              cursor-pointer flex-shrink-0
            "
          />

          {/* Workspace name input */}
          <input
            ref={groupNameRef}
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleQuickGroup(); }}
            placeholder="New workspace name…"
            maxLength={60}
            aria-label="New workspace name"
            className="
              flex-1 min-w-0 bg-neutral-800 border border-neutral-700
              rounded-md px-2 py-1 text-[12px] text-neutral-100
              placeholder-neutral-600 outline-none
              focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/30
              transition-colors
            "
          />

          {/* Save as workspace button */}
          <button
            onClick={handleQuickGroup}
            disabled={!someSelected || !groupName.trim() || grouping}
            title={`Save ${selectedIds.size} selected tab${selectedIds.size !== 1 ? "s" : ""} as workspace`}
            className={`
              flex items-center gap-1.5 px-2.5 py-1 rounded-md
              text-[11px] font-semibold flex-shrink-0 transition-all
              disabled:opacity-40 disabled:cursor-not-allowed
              ${groupSuccess
                ? "bg-emerald-600/20 text-emerald-400 border border-emerald-600/30"
                : "bg-blue-600 hover:bg-blue-500 text-white"
              }
            `}
          >
            {grouping ? (
              <span
                className="animate-spin w-3 h-3 border border-white/30 border-t-white rounded-full"
                aria-hidden
              />
            ) : (
              <FolderPlus size={11} strokeWidth={2.5} aria-hidden />
            )}
            {groupSuccess ? "Saved!" : `Save ${someSelected ? `(${selectedIds.size})` : ""}`}
          </button>
        </div>
      )}

      {/* ── Tab list ─────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto overscroll-contain px-1 py-1"
        role="list"
        aria-label="Open tabs"
      >
        {/* Loading skeletons — never show a blank screen */}
        {loadState === "loading" && (
          <div aria-busy="true" aria-label="Loading tabs">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        )}

        {/* Error state */}
        {loadState === "error" && (
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-center px-4">
            <p className="text-[12px] text-neutral-500">
              Couldn't load tabs. Chrome may need a moment.
            </p>
            <button
              onClick={loadTabs}
              className="
                flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                text-[11px] font-medium text-neutral-400
                border border-neutral-800 hover:border-neutral-700
                hover:text-neutral-200 transition-colors
              "
            >
              <RefreshCw size={11} strokeWidth={2} />
              Try again
            </button>
          </div>
        )}

        {/* Empty state */}
        {loadState === "ready" && tabs.length === 0 && (
          <EmptyState onRefresh={loadTabs} />
        )}

        {/* Tab rows */}
        {loadState === "ready" &&
          tabs.map((tab) => (
            <div key={tab.id} role="listitem">
              <TabItem
                tab={tab}
                onToggleStar={handleToggleStar}
                onClose={handleCloseTab}
                showCheckbox={selectMode}
                isSelected={selectedIds.has(tab.id)}
                onSelectChange={handleSelectChange}
              />
            </div>
          ))}
      </div>

      {/* ── Footer: selection count hint (select mode only) ── */}
      {selectMode && tabs.length > 0 && (
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-neutral-800/60">
          <span className="text-[10px] text-neutral-600">
            {someSelected
              ? `${selectedIds.size} of ${tabs.length} selected`
              : "Select tabs to group them"}
          </span>
          {someSelected && (
            <button
              onClick={() => setSelectedIds(new Set())}
              className="
                flex items-center gap-1 text-[10px]
                text-neutral-600 hover:text-neutral-400 transition-colors
              "
            >
              <X size={9} strokeWidth={2} />
              Clear
            </button>
          )}
        </div>
      )}
    </section>
  );
};

export default ActiveSession;
