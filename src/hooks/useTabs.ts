/**
 * useTabs.ts — Code File 37
 *
 * Convenience hook for reading and mutating tabs stored via the
 * Chrome storage layer (src/lib/storage.ts).
 *
 * There is no separate Zustand tab store — this hook owns its own
 * local React state and synchronises with chrome.storage on demand.
 *
 * Optionally pass a `workspaceId` to get only the tabs that belong
 * to that workspace. Omit it (or pass undefined) to get all tabs.
 *
 * Usage — all tabs:
 *   const { tabs, loadState, save, remove } = useTabs()
 *
 * Usage — scoped to one workspace:
 *   const { tabs, loadState, save, remove } = useTabs(workspace.id)
 */

import { useCallback, useEffect, useState } from "react"

import { DEBUG } from "~lib/constants"
import {
  addTab,
  deleteTab,
  findWorkspaceByTab,
  getAllTabs,
  getTab,
  removeTab,
  saveTab,
} from "~lib/storage"
import type { Tab } from "~types/tab"

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

export type TabLoadState = "idle" | "loading" | "loaded" | "error"

export interface UseTabsReturn {
  /** Tabs in storage, optionally pre-filtered by workspaceId */
  tabs: Tab[]
  /** Current fetch state */
  loadState: TabLoadState
  /** Error message when loadState === "error" */
  error: string | null
  /**
   * Fetch (or re-fetch) tabs from storage.
   * Called automatically on mount — call manually to refresh.
   */
  reload: () => Promise<void>
  /**
   * Look up a single tab by its Chrome tab ID.
   * Returns null if not found in storage.
   */
  getById: (tabId: number) => Promise<Tab | null>
  /**
   * Persist a brand-new tab to storage and add it to local state.
   * The Tab object must already have all required fields populated.
   */
  add: (tab: Tab) => Promise<void>
  /**
   * Update an existing tab in storage and reflect changes locally.
   * Accepts a full Tab or a partial update merged with the stored record.
   */
  save: (tab: Tab) => Promise<void>
  /**
   * Remove a tab from its workspace (disassociates it) but keeps the
   * tab record in storage.
   */
  remove: (tabId: number) => Promise<void>
  /**
   * Permanently delete a tab record from storage.
   */
  destroy: (tabId: number) => Promise<void>
  /**
   * Find which workspace a tab belongs to.
   * Returns the workspace ID string or null if unassigned.
   */
  findWorkspace: (tabId: number) => Promise<string | null>
  /**
   * Toggle the isImportant (starred) flag on a tab.
   * Convenience wrapper around save().
   */
  toggleImportant: (tabId: number) => Promise<void>
}

// ------------------------------------------------------------------
// Hook
// ------------------------------------------------------------------

/**
 * useTabs
 *
 * @param workspaceId - Optional. When provided, returned `tabs` are
 *   filtered to only those whose `workspaceId` field matches.
 */
export function useTabs(workspaceId?: string): UseTabsReturn {
  const [allTabs, setAllTabs] = useState<Tab[]>([])
  const [loadState, setLoadState] = useState<TabLoadState>("idle")
  const [error, setError] = useState<string | null>(null)

  // ------------------------------------------------------------------
  // Load
  // ------------------------------------------------------------------

  const reload = useCallback(async () => {
    setLoadState("loading")
    setError(null)

    try {
      const fetched = await getAllTabs()

      if (DEBUG) {
        console.log(
          `[useTabs] loaded ${fetched.length} tabs`,
          workspaceId ? `(filtered to workspace: ${workspaceId})` : "(all)"
        )
      }

      setAllTabs(fetched)
      setLoadState("loaded")
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load tabs"
      console.error("[useTabs] reload error:", err)
      setError(message)
      setLoadState("error")
    }
  }, [workspaceId])

  // Auto-load on mount
  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally empty — reload only once on mount

  // ------------------------------------------------------------------
  // Derived state — apply workspaceId filter if provided
  // ------------------------------------------------------------------

  const tabs: Tab[] = workspaceId
    ? allTabs.filter((t) => t.workspaceId === workspaceId)
    : allTabs

  // ------------------------------------------------------------------
  // Mutations
  // ------------------------------------------------------------------

  const getById = useCallback(async (tabId: number): Promise<Tab | null> => {
    try {
      return await getTab(tabId)
    } catch (err) {
      console.error("[useTabs] getById error:", err)
      return null
    }
  }, [])

  const add = useCallback(async (tab: Tab): Promise<void> => {
    try {
      await addTab(tab)
      setAllTabs((prev) => {
        // Guard against duplicates
        const exists = prev.some((t) => t.id === tab.id)
        return exists ? prev : [...prev, tab]
      })

      if (DEBUG) {
        console.log("[useTabs] added tab:", tab.id, tab.title)
      }
    } catch (err) {
      console.error("[useTabs] add error:", err)
      throw err
    }
  }, [])

  const save = useCallback(async (tab: Tab): Promise<void> => {
    try {
      await saveTab(tab)
      setAllTabs((prev) =>
        prev.map((t) => (t.id === tab.id ? { ...t, ...tab } : t))
      )

      if (DEBUG) {
        console.log("[useTabs] saved tab:", tab.id, tab.title)
      }
    } catch (err) {
      console.error("[useTabs] save error:", err)
      throw err
    }
  }, [])

  const remove = useCallback(async (tabId: number): Promise<void> => {
    try {
      await removeTab(tabId)
      // removeTab disassociates from workspace — reflect that locally
      setAllTabs((prev) =>
        prev.map((t) =>
          t.id === tabId ? { ...t, workspaceId: undefined } : t
        )
      )

      if (DEBUG) {
        console.log("[useTabs] removed tab from workspace:", tabId)
      }
    } catch (err) {
      console.error("[useTabs] remove error:", err)
      throw err
    }
  }, [])

  const destroy = useCallback(async (tabId: number): Promise<void> => {
    try {
      await deleteTab(tabId)
      setAllTabs((prev) => prev.filter((t) => t.id !== tabId))

      if (DEBUG) {
        console.log("[useTabs] destroyed tab:", tabId)
      }
    } catch (err) {
      console.error("[useTabs] destroy error:", err)
      throw err
    }
  }, [])

  const findWorkspace = useCallback(
    async (tabId: number): Promise<string | null> => {
      try {
        return await findWorkspaceByTab(tabId)
      } catch (err) {
        console.error("[useTabs] findWorkspace error:", err)
        return null
      }
    },
    []
  )

  const toggleImportant = useCallback(
    async (tabId: number): Promise<void> => {
      const tab = allTabs.find((t) => t.id === tabId)
      if (!tab) {
        console.warn("[useTabs] toggleImportant: tab not found in state:", tabId)
        return
      }

      const updated: Tab = {
        ...tab,
        isImportant: !tab.isImportant,
        lastAccessed: Date.now(),
      }

      await save(updated)

      if (DEBUG) {
        console.log(
          "[useTabs] toggled important:",
          tabId,
          "→",
          updated.isImportant
        )
      }
    },
    [allTabs, save]
  )

  // ------------------------------------------------------------------
  // Return
  // ------------------------------------------------------------------

  return {
    tabs,
    loadState,
    error,
    reload,
    getById,
    add,
    save,
    remove,
    destroy,
    findWorkspace,
    toggleImportant,
  }
}
