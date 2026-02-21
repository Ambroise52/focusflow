/**
 * useStorage.ts — Code File 38
 *
 * Convenience hook that wraps the diagnostic, lifecycle, and
 * suggestion-related functions from src/lib/storage.ts.
 *
 * Responsibilities:
 *  - Expose live chrome.storage usage stats (bytes used)
 *  - React to external storage changes via onStorageChange()
 *  - Surface initializeStorage() and clearAllStorage() actions
 *  - Provide read/write access to WorkspaceSuggestions
 *
 * What this hook does NOT do:
 *  - Manage workspaces  → use useWorkspaces()
 *  - Manage tabs        → use useTabs()
 *  - Manage settings    → use useSettingsStore() from the store barrel
 *
 * Usage:
 *   const {
 *     bytesUsed, loadState, initialize, clear,
 *     suggestions, addSuggestion, saveSuggestions,
 *   } = useStorage()
 */

import { useCallback, useEffect, useState } from "react"

import { DEBUG } from "~lib/constants"
import {
  addSuggestion as addSuggestionToStorage,
  clearAllStorage,
  getSuggestions,
  getStorageUsage,
  initializeStorage,
  onStorageChange,
  saveSuggestions as saveSuggestionsToStorage,
  saveWorkspaceSuggestion,
} from "~lib/storage"
import type { WorkspaceSuggestion } from "~types/workspace"

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

export type StorageLoadState = "idle" | "loading" | "ready" | "error"

/** Shape of the chrome.storage usage report */
export interface StorageUsage {
  /** Bytes currently in use by this extension */
  bytesUsed: number
  /** Human-readable string, e.g. "1.23 MB" */
  formatted: string
}

export interface UseStorageReturn {
  /** Current load / init state */
  loadState: StorageLoadState
  /** Error message if loadState === "error" */
  error: string | null
  /** Live chrome.storage usage stats; null until first read completes */
  usage: StorageUsage | null
  /**
   * Manually refresh the storage usage figure.
   * Also called automatically on mount and after any clear/init.
   */
  refreshUsage: () => Promise<void>
  /**
   * Run initializeStorage() — creates default keys if they don't exist.
   * Safe to call multiple times (storage.ts guards against re-init).
   */
  initialize: () => Promise<void>
  /**
   * Permanently wipe ALL extension storage (local + sync).
   * Only exposed for dev/debug/account-deletion flows.
   * Refreshes usage stats after completion.
   */
  clear: () => Promise<void>
  /** Current workspace suggestions from storage */
  suggestions: WorkspaceSuggestion[]
  /** Add a single suggestion and persist to storage */
  addSuggestion: (suggestion: WorkspaceSuggestion) => Promise<void>
  /** Overwrite the entire suggestions array in storage */
  saveSuggestions: (suggestions: WorkspaceSuggestion[]) => Promise<void>
  /**
   * Persist a suggestion that is associated with a specific workspace.
   * Wrapper around saveWorkspaceSuggestion() from storage.ts.
   */
  saveWorkspaceSuggestion: (
    workspaceId: string,
    suggestion: WorkspaceSuggestion
  ) => Promise<void>
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

/** Convert raw bytes to a readable "X.XX KB / MB / GB" string */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

// ------------------------------------------------------------------
// Hook
// ------------------------------------------------------------------

export function useStorage(): UseStorageReturn {
  const [loadState, setLoadState] = useState<StorageLoadState>("idle")
  const [error, setError] = useState<string | null>(null)
  const [usage, setUsage] = useState<StorageUsage | null>(null)
  const [suggestions, setSuggestions] = useState<WorkspaceSuggestion[]>([])

  // ------------------------------------------------------------------
  // Usage refresh
  // ------------------------------------------------------------------

  const refreshUsage = useCallback(async () => {
    try {
      const bytesUsed = await getStorageUsage()
      setUsage({ bytesUsed, formatted: formatBytes(bytesUsed) })

      if (DEBUG) {
        console.log("[useStorage] usage refreshed:", formatBytes(bytesUsed))
      }
    } catch (err) {
      console.error("[useStorage] refreshUsage error:", err)
      // Non-fatal — don't flip loadState to error just for usage
    }
  }, [])

  // ------------------------------------------------------------------
  // Suggestions load
  // ------------------------------------------------------------------

  const loadSuggestions = useCallback(async () => {
    try {
      const stored = await getSuggestions()
      setSuggestions(stored)

      if (DEBUG) {
        console.log("[useStorage] loaded", stored.length, "suggestions")
      }
    } catch (err) {
      console.error("[useStorage] loadSuggestions error:", err)
    }
  }, [])

  // ------------------------------------------------------------------
  // Mount: load usage + suggestions, subscribe to storage changes
  // ------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      setLoadState("loading")
      setError(null)

      try {
        await Promise.all([refreshUsage(), loadSuggestions()])
        if (!cancelled) setLoadState("ready")
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : "Storage init failed"
          console.error("[useStorage] mount error:", err)
          setError(message)
          setLoadState("error")
        }
      }
    }

    void init()

    // Subscribe to external storage changes (e.g. background service worker
    // writing new suggestions or workspace data while popup is open)
    const unsubscribe = onStorageChange((_changes) => {
      if (DEBUG) {
        console.log("[useStorage] external storage change detected — refreshing")
      }
      void refreshUsage()
      void loadSuggestions()
    })

    return () => {
      cancelled = true
      // onStorageChange returns a cleanup function if implemented as a
      // chrome.storage.onChanged listener; call it if present.
      if (typeof unsubscribe === "function") {
        unsubscribe()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally empty — subscribe once on mount

  // ------------------------------------------------------------------
  // Lifecycle actions
  // ------------------------------------------------------------------

  const initialize = useCallback(async () => {
    try {
      if (DEBUG) console.log("[useStorage] calling initializeStorage()")
      await initializeStorage()
      await refreshUsage()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "initializeStorage failed"
      console.error("[useStorage] initialize error:", err)
      setError(message)
      throw err
    }
  }, [refreshUsage])

  const clear = useCallback(async () => {
    try {
      if (DEBUG) console.log("[useStorage] calling clearAllStorage()")
      await clearAllStorage()
      setSuggestions([])
      await refreshUsage()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "clearAllStorage failed"
      console.error("[useStorage] clear error:", err)
      setError(message)
      throw err
    }
  }, [refreshUsage])

  // ------------------------------------------------------------------
  // Suggestion mutations
  // ------------------------------------------------------------------

  const addSuggestionAction = useCallback(
    async (suggestion: WorkspaceSuggestion) => {
      try {
        await addSuggestionToStorage(suggestion)
        setSuggestions((prev) => [...prev, suggestion])

        if (DEBUG) {
          console.log("[useStorage] suggestion added:", suggestion.name)
        }
      } catch (err) {
        console.error("[useStorage] addSuggestion error:", err)
        throw err
      }
    },
    []
  )

  const saveSuggestionsAction = useCallback(
    async (next: WorkspaceSuggestion[]) => {
      try {
        await saveSuggestionsToStorage(next)
        setSuggestions(next)

        if (DEBUG) {
          console.log("[useStorage] saved", next.length, "suggestions")
        }
      } catch (err) {
        console.error("[useStorage] saveSuggestions error:", err)
        throw err
      }
    },
    []
  )

  const saveWorkspaceSuggestionAction = useCallback(
    async (workspaceId: string, suggestion: WorkspaceSuggestion) => {
      try {
        await saveWorkspaceSuggestion(workspaceId, suggestion)

        if (DEBUG) {
          console.log(
            "[useStorage] workspace suggestion saved for:",
            workspaceId
          )
        }
      } catch (err) {
        console.error("[useStorage] saveWorkspaceSuggestion error:", err)
        throw err
      }
    },
    []
  )

  // ------------------------------------------------------------------
  // Return
  // ------------------------------------------------------------------

  return {
    loadState,
    error,
    usage,
    refreshUsage,
    initialize,
    clear,
    suggestions,
    addSuggestion: addSuggestionAction,
    saveSuggestions: saveSuggestionsAction,
    saveWorkspaceSuggestion: saveWorkspaceSuggestionAction,
  }
}
