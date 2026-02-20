/**
 * FocusFlow — Workspace Zustand Store
 * ─────────────────────────────────────────────
 * File: src/store/workspaceStore.ts
 *
 * Single source of truth for all workspace data in the popup.
 * Components read from this store instead of hitting chrome.storage
 * directly — mutations are reflected everywhere instantly.
 *
 * Architecture:
 *  - State:   workspaces[], loadState, error
 *  - Actions: load, create, update, remove, pause, resume
 *  - All async actions handle their own loading/error states
 */

import { create } from "zustand";

import { getWorkspaces, saveWorkspace, deleteWorkspace } from "../lib/storage";
import { pauseWorkspace, resumeWorkspace } from "../background/tabManager";

import type { Workspace } from "../types/workspace";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type LoadState = "idle" | "loading" | "ready" | "error";

interface WorkspaceStore {
  // ── State ────────────────────────────────
  workspaces: Workspace[];
  loadState:  LoadState;
  /** Last error message, or null if no error */
  error:      string | null;

  // ── Actions ──────────────────────────────

  /**
   * Load all workspaces from chrome.storage into the store.
   * Sorted: active workspaces first, then by most recently used.
   * Safe to call multiple times — debounced at the storage layer.
   */
  load: () => Promise<void>;

  /**
   * Persist a new workspace to storage and prepend it to the store.
   * The caller constructs the full Workspace object (including ID,
   * timestamps, color, etc.) before calling this action.
   *
   * @param workspace - The fully constructed Workspace to save
   */
  create: (workspace: Workspace) => Promise<void>;

  /**
   * Persist an updated workspace to storage and replace the matching
   * entry in the store by ID. Used for inline renaming and color changes.
   *
   * @param updated - The workspace with modified fields
   */
  update: (updated: Workspace) => Promise<void>;

  /**
   * Delete a workspace from storage and remove it from the store.
   * Passes `true` for soft-delete (30-day recovery window).
   *
   * @param id - UUID of the workspace to delete
   */
  remove: (id: string) => Promise<void>;

  /**
   * Hibernate all tabs in a workspace to free RAM.
   * Delegates to tabManager.pauseWorkspace() in the background worker,
   * then refreshes the store to reflect the isPaused: true state.
   *
   * @param id - UUID of the workspace to pause
   */
  pause: (id: string) => Promise<void>;

  /**
   * Reopen all tabs in a workspace in a new Chrome window.
   * Delegates to tabManager.resumeWorkspace() in the background worker,
   * then refreshes the store to reflect the isActive: true state.
   *
   * @param id - UUID of the workspace to resume
   */
  resume: (id: string) => Promise<void>;

  /** Clear any error message from the store. */
  clearError: () => void;
}

// ─────────────────────────────────────────────
// Helper: sort workspaces
// Active first, then by most recently used.
// ─────────────────────────────────────────────
const sortWorkspaces = (list: Workspace[]): Workspace[] =>
  [...list].sort((a, b) => {
    if (a.isActive && !b.isActive) return -1;
    if (!a.isActive && b.isActive) return  1;
    return (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0);
  });

// ─────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────
export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  // ── Initial state ─────────────────────────
  workspaces: [],
  loadState:  "idle",
  error:      null,

  // ── load ──────────────────────────────────
  load: async () => {
    // Prevent duplicate concurrent loads
    if (get().loadState === "loading") return;

    set({ loadState: "loading", error: null });
    try {
      const raw    = await getWorkspaces();
      const sorted = sortWorkspaces(raw);
      set({ workspaces: sorted, loadState: "ready" });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load workspaces";
      set({ loadState: "error", error: message });
    }
  },

  // ── create ────────────────────────────────
  create: async (workspace: Workspace) => {
    try {
      await saveWorkspace(workspace);
      // Prepend to list and re-sort so it appears at the correct position
      set((state) => ({
        workspaces: sortWorkspaces([workspace, ...state.workspaces]),
      }));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create workspace";
      set({ error: message });
      throw err; // Re-throw so the calling component can show inline feedback
    }
  },

  // ── update ────────────────────────────────
  update: async (updated: Workspace) => {
    try {
      await saveWorkspace(updated);
      set((state) => ({
        workspaces: sortWorkspaces(
          state.workspaces.map((w) => (w.id === updated.id ? updated : w))
        ),
      }));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update workspace";
      set({ error: message });
      throw err;
    }
  },

  // ── remove ────────────────────────────────
  remove: async (id: string) => {
    try {
      // Optimistic update — remove from UI immediately for snappy feel
      set((state) => ({
        workspaces: state.workspaces.filter((w) => w.id !== id),
      }));
      // soft-delete = true → 30-day recovery window in storage
      await deleteWorkspace(id, true);
    } catch (err) {
      // Rollback: reload from storage so the deleted item reappears
      await get().load();
      const message =
        err instanceof Error ? err.message : "Failed to delete workspace";
      set({ error: message });
      throw err;
    }
  },

  // ── pause ─────────────────────────────────
  pause: async (id: string) => {
    try {
      // Optimistic update — show isPaused immediately in the UI
      set((state) => ({
        workspaces: state.workspaces.map((w) =>
          w.id === id ? { ...w, isPaused: true, isActive: false } : w
        ),
      }));
      await pauseWorkspace(id);
    } catch (err) {
      // Rollback to accurate state from storage
      await get().load();
      const message =
        err instanceof Error ? err.message : "Failed to pause workspace";
      set({ error: message });
      throw err;
    }
  },

  // ── resume ────────────────────────────────
  resume: async (id: string) => {
    try {
      // Optimistic update — show isActive immediately in the UI
      set((state) => ({
        workspaces: state.workspaces.map((w) =>
          w.id === id ? { ...w, isActive: true, isPaused: false } : w
        ),
      }));
      await resumeWorkspace(id);
    } catch (err) {
      // Rollback to accurate state from storage
      await get().load();
      const message =
        err instanceof Error ? err.message : "Failed to resume workspace";
      set({ error: message });
      throw err;
    }
  },

  // ── clearError ────────────────────────────
  clearError: () => set({ error: null }),
}));
