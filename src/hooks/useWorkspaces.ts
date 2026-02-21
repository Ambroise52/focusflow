/**
 * useWorkspaces.ts — Code File 36
 *
 * Convenience hook that wraps useWorkspaceStore and auto-loads
 * workspaces on mount. Components get everything they need in one
 * line without writing their own useEffect.
 *
 * Usage:
 *   const { workspaces, loadState, create, update, remove, pause, resume } = useWorkspaces();
 */

import { useEffect } from "react"

import { DEBUG } from "~lib/constants"
import { useWorkspaceStore } from "../store"
import type { Workspace } from "~types/workspace"

// Re-export the store's LoadState type so callers don't need to dig into the store
export type WorkspaceLoadState = "idle" | "loading" | "loaded" | "error"

export interface UseWorkspacesReturn {
  /** All persisted workspaces, sorted by most recently used */
  workspaces: Workspace[]
  /** Current fetch state — useful for showing spinners or error UI */
  loadState: WorkspaceLoadState
  /** Create a new workspace (name required; returns the created Workspace) */
  create: (name: string, color?: string) => Promise<Workspace>
  /** Persist changes to an existing workspace (partial update supported) */
  update: (id: string, changes: Partial<Workspace>) => Promise<void>
  /** Permanently delete a workspace and all its tabs */
  remove: (id: string) => Promise<void>
  /** Hibernate a workspace — closes tabs and marks it as paused */
  pause: (id: string) => Promise<void>
  /** Restore a paused workspace — re-opens its tabs */
  resume: (id: string) => Promise<void>
}

/**
 * useWorkspaces
 *
 * Wraps the global workspace Zustand store. Automatically triggers
 * `load()` on the first render so any component using this hook gets
 * fresh data without needing its own useEffect.
 *
 * Subsequent renders are cheap — Zustand selectors prevent unnecessary
 * re-renders when unrelated store slices change.
 */
export function useWorkspaces(): UseWorkspacesReturn {
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const loadState = useWorkspaceStore((s) => s.loadState) as WorkspaceLoadState
  const load = useWorkspaceStore((s) => s.load)
  const create = useWorkspaceStore((s) => s.create)
  const update = useWorkspaceStore((s) => s.update)
  const remove = useWorkspaceStore((s) => s.remove)
  const pause = useWorkspaceStore((s) => s.pause)
  const resume = useWorkspaceStore((s) => s.resume)

  // Auto-load on mount. Zustand store guards against duplicate fetches
  // (checks loadState === "idle" internally), so this is safe to call
  // even if multiple components mount at the same time.
  useEffect(() => {
    if (DEBUG) {
      console.log("[useWorkspaces] mount — triggering load, current state:", loadState)
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally empty — we only want to load once on mount

  return {
    workspaces,
    loadState,
    create,
    update,
    remove,
    pause,
    resume,
  }
}
