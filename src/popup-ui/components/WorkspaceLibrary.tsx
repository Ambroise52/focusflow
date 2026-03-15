import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  FolderPlus,
  RefreshCw,
  Layers,
  BookOpen,
  X,
  Check,
} from "lucide-react";

import WorkspaceCard from "./WorkspaceCard";
import { getWorkspaces, saveWorkspace } from "../../lib/storage";
import { generateId } from "../../lib/utils";

import type { Workspace } from "../../types/workspace";

// ─────────────────────────────────────────────
// Colour palette for new workspace picker
// ─────────────────────────────────────────────
const COLOUR_OPTIONS: { hex: string; label: string }[] = [
  { hex: "#3B82F6", label: "Blue"   },
  { hex: "#8B5CF6", label: "Violet" },
  { hex: "#10B981", label: "Green"  },
  { hex: "#F59E0B", label: "Amber"  },
  { hex: "#EF4444", label: "Red"    },
  { hex: "#EC4899", label: "Pink"   },
  { hex: "#06B6D4", label: "Cyan"   },
  { hex: "#F97316", label: "Orange" },
];

// ─────────────────────────────────────────────
// Sub-component: skeleton card placeholder
// ─────────────────────────────────────────────
const SkeletonCard: React.FC = () => (
  <div className="flex rounded-xl overflow-hidden border border-neutral-800 animate-pulse">
    {/* Colour strip */}
    <span className="w-1 bg-neutral-700 flex-shrink-0" />
    <div className="flex-1 px-3 py-3 space-y-2">
      <div className="h-3 bg-neutral-800 rounded w-1/2" />
      <div className="h-2 bg-neutral-800 rounded w-1/3" />
      <div className="flex gap-2 pt-1">
        <div className="h-6 bg-neutral-800 rounded w-14" />
        <div className="h-6 bg-neutral-800 rounded w-14" />
      </div>
    </div>
  </div>
);

// ─────────────────────────────────────────────
// Sub-component: empty state
// ─────────────────────────────────────────────
const EmptyState: React.FC<{ onCreateClick: () => void }> = ({ onCreateClick }) => (
  <div className="flex flex-col items-center justify-center py-12 px-6 text-center gap-4">
    {/* Illustration */}
    <div className="w-16 h-16 rounded-2xl bg-neutral-800/60 flex items-center justify-center">
      <BookOpen size={28} className="text-neutral-600" strokeWidth={1.5} />
    </div>

    <div className="space-y-1">
      <p className="text-[13px] font-semibold text-neutral-300">No workspaces yet</p>
      <p className="text-[11px] text-neutral-600 leading-relaxed">
        Group your open tabs into named workspaces<br />
        to stay focused and free up memory.
      </p>
    </div>

    <button
      onClick={onCreateClick}
      className="
        flex items-center gap-1.5 px-4 py-2 rounded-lg
        text-[12px] font-semibold text-white
        bg-blue-600 hover:bg-blue-500 transition-colors
      "
    >
      <FolderPlus size={13} strokeWidth={2.5} />
      Create Your First Workspace
    </button>
  </div>
);

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────
const WorkspaceLibrary: React.FC = () => {
  // ── State ──────────────────────────────────
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");

  // New workspace creation form
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName]   = useState("");
  const [newColor, setNewColor] = useState(COLOUR_OPTIONS[0].hex);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(false);

  const nameInputRef = useRef<HTMLInputElement>(null);

  // ── Load workspaces ────────────────────────
  const loadWorkspaces = useCallback(async () => {
    setLoadState("loading");
    try {
      const all = await getWorkspaces();
      // Sort: active first, then by most recently used
      const sorted = [...all].sort((a, b) => {
        if (a.isActive && !b.isActive) return -1;
        if (!a.isActive && b.isActive) return  1;
        return (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0);
      });
      setWorkspaces(sorted);
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, []);

  // ── Mount ──────────────────────────────────
  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  // Focus name input when form opens
  useEffect(() => {
    if (showForm) nameInputRef.current?.focus();
  }, [showForm]);

  // ── Handlers ───────────────────────────────

  /** Open the creation form and reset all its fields. */
  const handleOpenForm = () => {
    setNewName("");
    setNewColor(COLOUR_OPTIONS[0].hex);
    setCreateError(false);
    setShowForm(true);
  };

  /** Close the creation form without saving. */
  const handleCancelForm = () => {
    setShowForm(false);
    setNewName("");
    setCreateError(false);
  };

  /**
   * Save a brand-new empty Workspace to storage.
   * The workspace starts with no tabs — the user populates it
   * by moving tabs from TabItem's "Add to workspace…" dropdown.
   */
  const handleCreateWorkspace = async () => {
    const name = newName.trim();
    if (!name) return;

    const newWorkspace: Workspace = {
      id:         generateId(),
      name,
      tabs:       [],
      createdAt:  Date.now(),
      lastUsedAt: Date.now(),
      isActive:   false,
      isPaused:   false,
      color:      newColor,
    };

    setCreating(true);
    setCreateError(false);
    try {
      await saveWorkspace(newWorkspace);
      // Prepend to list so the new card appears at the top immediately
      setWorkspaces((prev) => [newWorkspace, ...prev]);
      setShowForm(false);
      setNewName("");
    } catch {
      setCreateError(true);
    } finally {
      setCreating(false);
    }
  };

  /**
   * Called by WorkspaceCard after any mutation (rename, pause, resume).
   * Re-fetches the full list so sort order and badges stay accurate.
   */
  const handleWorkspaceUpdate = useCallback(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  /**
   * Called by WorkspaceCard after a workspace is deleted.
   * Removes the card from local state immediately for snappy UX
   * without waiting for a full storage re-fetch.
   */
  const handleWorkspaceDelete = useCallback((id: string) => {
    setWorkspaces((prev) => prev.filter((w) => w.id !== id));
  }, []);

  // ─────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────
  return (
    <section className="flex flex-col h-full" aria-label="Workspace Library">

      {/* ── Top bar ───────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-800/60">

        {/* Left: workspace count */}
        <span className="flex items-center gap-1.5 text-[11px] text-neutral-500">
          <Layers size={11} strokeWidth={2} aria-hidden />
          {loadState === "ready"
            ? `${workspaces.length} workspace${workspaces.length !== 1 ? "s" : ""}`
            : "Loading…"}
        </span>

        {/* Right: New + Refresh */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleOpenForm}
            disabled={showForm}
            title="Create a new workspace"
            aria-label="Create a new workspace"
            className="
              flex items-center gap-1 px-2 py-1 rounded-md
              text-[11px] font-medium text-neutral-300
              bg-blue-600/20 border border-blue-600/30
              hover:bg-blue-600/30 transition-colors
              disabled:opacity-40 disabled:cursor-not-allowed
            "
          >
            <FolderPlus size={11} strokeWidth={2.5} />
            New
          </button>

          <button
            onClick={loadWorkspaces}
            title="Refresh workspace list"
            aria-label="Refresh workspace list"
            className="
              p-1.5 rounded-md text-neutral-600
              hover:text-neutral-300 hover:bg-neutral-800 transition-colors
            "
          >
            <RefreshCw size={11} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* ── New workspace inline form ────────── */}
      {showForm && (
        <div
          className="
            px-3 py-3 border-b border-neutral-800/60
            bg-neutral-900/80 flex flex-col gap-2.5
          "
          aria-label="Create new workspace"
        >
          {/* Name input */}
          <input
            ref={nameInputRef}
            value={newName}
            onChange={(e) => { setNewName(e.target.value); setCreateError(false); }}
            onKeyDown={(e) => {
              if (e.key === "Enter")  handleCreateWorkspace();
              if (e.key === "Escape") handleCancelForm();
            }}
            placeholder="Workspace name…"
            maxLength={60}
            aria-label="New workspace name"
            className={`
              w-full bg-neutral-800 rounded-md px-2.5 py-1.5
              text-[12px] text-neutral-100 placeholder-neutral-600
              outline-none transition-colors border
              ${createError
                ? "border-rose-500/60 focus:ring-1 focus:ring-rose-500/30"
                : "border-neutral-700 focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/30"
              }
            `}
          />

          {/* Colour picker row */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-neutral-600 flex-shrink-0">Colour</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {COLOUR_OPTIONS.map((opt) => (
                <button
                  key={opt.hex}
                  onClick={() => setNewColor(opt.hex)}
                  title={opt.label}
                  aria-label={`${opt.label} colour`}
                  aria-pressed={newColor === opt.hex}
                  className={`
                    w-4 h-4 rounded-full transition-all flex-shrink-0
                    ${newColor === opt.hex
                      ? "ring-2 ring-offset-1 ring-offset-neutral-900 ring-white scale-110"
                      : "opacity-60 hover:opacity-100 hover:scale-105"
                    }
                  `}
                  style={{ backgroundColor: opt.hex }}
                />
              ))}
            </div>
          </div>

          {/* Error message */}
          {createError && (
            <p className="text-[11px] text-rose-400">
              Couldn't save workspace. Please try again.
            </p>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={handleCancelForm}
              className="
                px-3 py-1.5 rounded-md text-[11px] font-medium
                text-neutral-500 hover:text-neutral-300
                hover:bg-neutral-800 transition-colors
              "
            >
              <span className="flex items-center gap-1">
                <X size={11} strokeWidth={2} />
                Cancel
              </span>
            </button>

            <button
              onClick={handleCreateWorkspace}
              disabled={!newName.trim() || creating}
              className="
                flex items-center gap-1.5 px-3 py-1.5 rounded-md
                text-[11px] font-semibold text-white
                bg-blue-600 hover:bg-blue-500 transition-colors
                disabled:opacity-40 disabled:cursor-not-allowed
              "
            >
              {creating ? (
                <span
                  className="animate-spin w-3 h-3 border border-white/30 border-t-white rounded-full"
                  aria-hidden
                />
              ) : (
                <Check size={11} strokeWidth={2.5} />
              )}
              {creating ? "Saving…" : "Create"}
            </button>
          </div>
        </div>
      )}

      {/* ── Workspace list ────────────────────── */}
      <div
        className="flex-1 overflow-y-auto overscroll-contain px-2 py-2 flex flex-col gap-2"
        role="list"
        aria-label="Saved workspaces"
      >
        {/* Loading skeletons */}
        {loadState === "loading" && (
          <div aria-busy="true" aria-label="Loading workspaces" className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {/* Error state */}
        {loadState === "error" && (
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-center px-4">
            <p className="text-[12px] text-neutral-500">
              Couldn't load workspaces. Storage may be unavailable.
            </p>
            <button
              onClick={loadWorkspaces}
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
        {loadState === "ready" && workspaces.length === 0 && (
          <EmptyState onCreateClick={handleOpenForm} />
        )}

        {/* Workspace cards */}
        {loadState === "ready" &&
          workspaces.map((workspace) => (
            <div key={workspace.id} role="listitem">
              <WorkspaceCard
                workspace={workspace}
                onUpdate={handleWorkspaceUpdate}
                onDelete={handleWorkspaceDelete}
              />
            </div>
          ))}
      </div>
    </section>
  );
};

export default WorkspaceLibrary;
