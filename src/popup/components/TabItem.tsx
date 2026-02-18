import React, { useState, useRef, useEffect, useCallback } from "react";
import { Star, MoreVertical, FolderPlus, ExternalLink, X } from "lucide-react";

import FaviconLoader from "./FaviconLoader";
import { sanitizeUrl, extractDomain } from "../../lib/utils";
import { getWorkspaces, moveTabsToWorkspace } from "../../lib/storage";

import type { Tab } from "../../types/tab";
import type { Workspace } from "../../types/workspace";

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const TITLE_MAX_LENGTH = 40;

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/** Truncate a string to `max` chars, appending "…" if cut. */
const truncate = (str: string, max: number): string =>
  str.length > max ? `${str.slice(0, max - 1)}…` : str;

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────
interface TabItemProps {
  tab: Tab;
  /** Called when the user toggles the star (important) flag. */
  onToggleStar: (tabId: number, current: boolean) => void;
  /** Called when the user asks to close this tab. */
  onClose?: (tabId: number) => void;
  /** Whether this row is currently selected (checkbox mode). */
  isSelected?: boolean;
  /** Called when the checkbox changes. */
  onSelectChange?: (tabId: number, selected: boolean) => void;
  /** Show the checkbox for bulk-select mode. */
  showCheckbox?: boolean;
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────
const TabItem: React.FC<TabItemProps> = ({
  tab,
  onToggleStar,
  onClose,
  isSelected = false,
  onSelectChange,
  showCheckbox = false,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [moveStatus, setMoveStatus] = useState<"idle" | "moving" | "done" | "error">("idle");

  const dropdownRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);

  const safeUrl = sanitizeUrl(tab.url);
  const domain = extractDomain(safeUrl);
  const displayTitle = truncate(tab.title || domain || "Untitled Tab", TITLE_MAX_LENGTH);

  // ── Close dropdown on outside click ──────
  useEffect(() => {
    if (!dropdownOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        moreButtonRef.current &&
        !moreButtonRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [dropdownOpen]);

  // ── Load workspaces when dropdown opens ──
  const handleMoreClick = useCallback(async () => {
    const next = !dropdownOpen;
    setDropdownOpen(next);

    if (next && workspaces.length === 0) {
      setLoadingWorkspaces(true);
      try {
        const all = await getWorkspaces();
        setWorkspaces(all);
      } catch {
        // Non-critical — dropdown will just show no options
      } finally {
        setLoadingWorkspaces(false);
      }
    }
  }, [dropdownOpen, workspaces.length]);

  // ── Move to workspace ─────────────────────
  const handleMoveToWorkspace = useCallback(
    async (workspaceId: string) => {
      setMoveStatus("moving");
      setDropdownOpen(false);
      try {
        await moveTabsToWorkspace([tab.id], workspaceId);
        setMoveStatus("done");
      } catch {
        setMoveStatus("error");
      } finally {
        // Reset status after brief feedback window
        setTimeout(() => setMoveStatus("idle"), 1800);
      }
    },
    [tab.id]
  );

  // ── Open tab in browser ───────────────────
  const handleOpenTab = () => {
    chrome.tabs.update(tab.id, { active: true });
  };

  // ─────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────
  return (
    <div
      role="row"
      aria-selected={isSelected}
      className={`
        group relative flex items-center gap-2 px-3 py-2
        rounded-lg transition-colors duration-100 cursor-default
        ${isSelected
          ? "bg-blue-600/20 border border-blue-600/40"
          : "hover:bg-neutral-800/70 border border-transparent"
        }
        ${moveStatus === "done" ? "opacity-50" : ""}
      `}
    >
      {/* ── Checkbox (bulk-select mode) ──── */}
      {showCheckbox && (
        <input
          type="checkbox"
          aria-label={`Select tab: ${displayTitle}`}
          checked={isSelected}
          onChange={(e) =>
            onSelectChange?.(tab.id, e.target.checked)
          }
          className="
            h-3.5 w-3.5 rounded border-neutral-600
            bg-neutral-800 text-blue-500
            focus:ring-1 focus:ring-blue-500 focus:ring-offset-0
            accent-blue-500 cursor-pointer flex-shrink-0
          "
        />
      )}

      {/* ── Favicon ──────────────────────── */}
      <FaviconLoader
        url={safeUrl}
        favIconUrl={tab.favIconUrl}
        displaySize={16}
        fetchSize={32}
        className="flex-shrink-0"
      />

      {/* ── Title + Domain ───────────────── */}
      <button
        onClick={handleOpenTab}
        title={tab.title || safeUrl}
        aria-label={`Switch to tab: ${displayTitle}`}
        className="
          flex-1 min-w-0 text-left
          focus:outline-none focus-visible:ring-1
          focus-visible:ring-blue-500 rounded
        "
      >
        <span className="block text-[13px] font-medium text-neutral-100 leading-tight truncate">
          {displayTitle}
        </span>
        <span className="block text-[11px] text-neutral-500 leading-tight truncate mt-0.5">
          {domain}
        </span>
      </button>

      {/* ── Move status feedback ─────────── */}
      {moveStatus !== "idle" && (
        <span
          className={`
            text-[10px] font-medium flex-shrink-0 transition-opacity
            ${moveStatus === "moving" ? "text-neutral-400 animate-pulse" : ""}
            ${moveStatus === "done"   ? "text-emerald-400" : ""}
            ${moveStatus === "error"  ? "text-rose-400"    : ""}
          `}
        >
          {moveStatus === "moving" && "Moving…"}
          {moveStatus === "done"   && "Moved ✓"}
          {moveStatus === "error"  && "Failed"}
        </span>
      )}

      {/* ── Action buttons (visible on hover or when active) ─── */}
      <div
        className={`
          flex items-center gap-0.5 flex-shrink-0
          transition-opacity duration-100
          ${dropdownOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"}
        `}
      >
        {/* Star button */}
        <button
          onClick={() => onToggleStar(tab.id, tab.isImportant)}
          title={tab.isImportant ? "Unstar tab" : "Star tab"}
          aria-label={tab.isImportant ? "Unstar tab" : "Star tab"}
          aria-pressed={tab.isImportant}
          className={`
            p-1 rounded transition-colors
            ${tab.isImportant
              ? "text-amber-400 hover:text-amber-300"
              : "text-neutral-600 hover:text-neutral-300"
            }
          `}
        >
          <Star
            size={13}
            fill={tab.isImportant ? "currentColor" : "none"}
            strokeWidth={2}
          />
        </button>

        {/* More / dropdown trigger */}
        <button
          ref={moreButtonRef}
          onClick={handleMoreClick}
          title="More actions"
          aria-label="More actions"
          aria-haspopup="menu"
          aria-expanded={dropdownOpen}
          className="p-1 rounded text-neutral-600 hover:text-neutral-300 transition-colors"
        >
          <MoreVertical size={13} strokeWidth={2} />
        </button>

        {/* Close tab button */}
        {onClose && (
          <button
            onClick={() => onClose(tab.id)}
            title="Close tab"
            aria-label="Close tab"
            className="p-1 rounded text-neutral-600 hover:text-rose-400 transition-colors"
          >
            <X size={13} strokeWidth={2} />
          </button>
        )}
      </div>

      {/* ── Dropdown menu ───────────────── */}
      {dropdownOpen && (
        <div
          ref={dropdownRef}
          role="menu"
          aria-label="Tab actions"
          className="
            absolute right-2 top-full mt-1 z-50
            min-w-[180px] max-w-[220px]
            bg-neutral-900 border border-neutral-700
            rounded-lg shadow-xl overflow-hidden
          "
        >
          {/* Open in new tab */}
          <a
            href={safeUrl}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            onClick={() => setDropdownOpen(false)}
            className="
              flex items-center gap-2 px-3 py-2
              text-[12px] text-neutral-300 hover:bg-neutral-800
              hover:text-white transition-colors cursor-pointer
            "
          >
            <ExternalLink size={12} strokeWidth={2} className="text-neutral-500" />
            Open in new tab
          </a>

          {/* Divider */}
          <div className="border-t border-neutral-800 my-0.5" />

          {/* Add to workspace submenu */}
          <div className="px-3 py-1.5">
            <p className="text-[10px] font-semibold text-neutral-600 uppercase tracking-wider mb-1">
              Add to workspace…
            </p>

            {loadingWorkspaces && (
              <p className="text-[11px] text-neutral-500 py-1 animate-pulse">
                Loading…
              </p>
            )}

            {!loadingWorkspaces && workspaces.length === 0 && (
              <p className="text-[11px] text-neutral-500 py-1">
                No workspaces yet.
              </p>
            )}

            {!loadingWorkspaces &&
              workspaces.map((ws) => (
                <button
                  key={ws.id}
                  role="menuitem"
                  onClick={() => handleMoveToWorkspace(ws.id)}
                  disabled={tab.workspaceId === ws.id}
                  className="
                    w-full flex items-center gap-2 px-1 py-1.5
                    text-[12px] text-left rounded
                    text-neutral-300 hover:bg-neutral-800 hover:text-white
                    transition-colors disabled:opacity-40 disabled:cursor-default
                  "
                >
                  {/* Workspace colour dot */}
                  <span
                    className="h-2 w-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: ws.color ?? "#3B82F6" }}
                    aria-hidden
                  />
                  <span className="truncate">
                    {ws.name}
                  </span>
                  {tab.workspaceId === ws.id && (
                    <span className="ml-auto text-[10px] text-neutral-600">
                      current
                    </span>
                  )}
                </button>
              ))}
          </div>

          {/* Add to workspace CTA if empty */}
          {!loadingWorkspaces && workspaces.length === 0 && (
            <>
              <div className="border-t border-neutral-800 my-0.5" />
              <button
                role="menuitem"
                onClick={() => setDropdownOpen(false)}
                className="
                  w-full flex items-center gap-2 px-3 py-2
                  text-[12px] text-blue-400 hover:bg-neutral-800
                  hover:text-blue-300 transition-colors
                "
              >
                <FolderPlus size={12} strokeWidth={2} />
                Create a workspace
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default TabItem;
