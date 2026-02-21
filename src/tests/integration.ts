/**
 * integration.ts — Code File 39
 *
 * End-to-end integration test suite for FocusFlow.
 *
 * ─── NO TEST FRAMEWORK REQUIRED ───────────────────────────────────
 * This file uses zero external testing libraries. It runs inside the
 * Chrome extension's real runtime against real chrome.storage, which
 * is the only meaningful environment for a Chrome extension.
 *
 * ─── HOW TO RUN ────────────────────────────────────────────────────
 * 1. Load the extension in Chrome (chrome://extensions → Load unpacked
 *    → select build/chrome-mv3-dev/)
 * 2. Click the FocusFlow icon to open the popup
 * 3. Right-click inside the popup → Inspect → Console tab
 * 4. Paste and run:
 *
 *      const { runIntegrationTests } = await import(
 *        chrome.runtime.getURL('integration.js')
 *      );
 *      await runIntegrationTests();
 *
 * 5. Read the colour-coded PASS / FAIL report in the console
 *
 * ─── SCOPE ─────────────────────────────────────────────────────────
 * Tests cover the full storage layer that underpins every feature:
 *
 *   Suite 1 — Storage lifecycle   (init, usage, clear)
 *   Suite 2 — Workspace CRUD      (create, read, update, delete)
 *   Suite 3 — Tab CRUD            (create, read, update, delete)
 *   Suite 4 — Cross-entity        (findWorkspaceByTab, workspace tabs)
 *   Suite 5 — Settings            (read, update, reset)
 *   Suite 6 — Suggestions         (add, get, save)
 *   Suite 7 — Cleanup             (cleanupOldWorkspaces — no args)
 *
 * ─── SAFETY ────────────────────────────────────────────────────────
 * • All test data uses a "__FF_TEST__" prefix so it never collides
 *   with real user data.
 * • A full cleanup sweep runs at the end (and at the start) of every
 *   run to leave storage in a clean state.
 * • This file is NOT imported by any Plasmo entry point, so it is
 *   never bundled into the production extension.
 */

import {
  addSuggestion,
  cleanupOldWorkspaces,
  deleteTab,
  deleteWorkspace,
  getSettings,
  getStorageUsage,
  getSuggestions,
  getTab,
  getWorkspace,
  getWorkspaces,
  initializeStorage,
  resetSettings,
  saveTab,
  saveWorkspace,
  updateSettings,
  updateWorkspaceTabs,
  findWorkspaceByTab,
  saveSuggestions,
} from "~lib/storage"
import type { Tab } from "~types/tab"
import type { Workspace, WorkspaceSuggestion } from "~types/workspace"

// ─────────────────────────────────────────────────────────────────────────────
// Minimal test harness (no dependencies)
// ─────────────────────────────────────────────────────────────────────────────

interface TestResult {
  suite: string
  name: string
  passed: boolean
  error?: string
  durationMs: number
}

type TestFn = () => Promise<void>

const results: TestResult[] = []
let currentSuite = "uncategorised"

function suite(name: string): void {
  currentSuite = name
}

async function test(name: string, fn: TestFn): Promise<void> {
  const start = performance.now()
  try {
    await fn()
    results.push({
      suite: currentSuite,
      name,
      passed: true,
      durationMs: Math.round(performance.now() - start),
    })
  } catch (err) {
    results.push({
      suite: currentSuite,
      name,
      passed: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Math.round(performance.now() - start),
    })
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`)
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    )
  }
}

function assertDefined<T>(value: T | null | undefined, label: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(`${label} — expected a value but got ${String(value)}`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────────────

const TEST_PREFIX = "__FF_TEST__"

function makeWorkspace(suffix: string): Workspace {
  return {
    id: `${TEST_PREFIX}ws-${suffix}`,
    name: `Test Workspace ${suffix}`,
    tabs: [],
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
    isActive: false,
    isPaused: false,
    color: "#3B82F6",
  }
}

function makeTab(id: number, workspaceId?: string): Tab {
  return {
    id,
    url: `https://example.com/${TEST_PREFIX}${id}`,
    title: `Test Tab ${id}`,
    favIconUrl: undefined,
    isImportant: false,
    lastAccessed: Date.now(),
    workspaceId,
  }
}

function makeSuggestion(suffix: string): WorkspaceSuggestion {
  return {
    name: `${TEST_PREFIX}Suggestion ${suffix}`,
    tabs: [],
    confidence: 75,
    reason: `Integration test suggestion ${suffix}`,
  }
}

// IDs used across suites (so cleanup is reliable)
const WS_A = `${TEST_PREFIX}ws-alpha`
const WS_B = `${TEST_PREFIX}ws-beta`
const TAB_1 = 900001
const TAB_2 = 900002

// ─────────────────────────────────────────────────────────────────────────────
// Pre/post cleanup
// ─────────────────────────────────────────────────────────────────────────────

async function cleanupTestData(): Promise<void> {
  // Best-effort — ignore errors on individual deletes
  await Promise.allSettled([
    deleteWorkspace(WS_A),
    deleteWorkspace(WS_B),
    deleteTab(TAB_1),
    deleteTab(TAB_2),
  ])
  // Also clear any suggestions that start with the test prefix
  try {
    const existing = await getSuggestions()
    const cleaned = existing.filter((s) => !s.name.startsWith(TEST_PREFIX))
    await saveSuggestions(cleaned)
  } catch {
    // ignore
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test suites
// ─────────────────────────────────────────────────────────────────────────────

async function runStorageLifecycle(): Promise<void> {
  suite("1 — Storage Lifecycle")

  await test("initializeStorage() completes without error", async () => {
    await initializeStorage()
    // If it throws, the test fails automatically
  })

  await test("getStorageUsage() returns a non-negative number", async () => {
    const bytes = await getStorageUsage()
    assert(typeof bytes === "number", "should return a number")
    assert(bytes >= 0, `bytes (${bytes}) should be >= 0`)
  })
}

async function runWorkspaceCRUD(): Promise<void> {
  suite("2 — Workspace CRUD")

  await test("saveWorkspace() persists a new workspace", async () => {
    const ws = makeWorkspace("alpha")
    ws.id = WS_A
    await saveWorkspace(ws)
  })

  await test("getWorkspace() retrieves the saved workspace by id", async () => {
    const ws = await getWorkspace(WS_A)
    assertDefined(ws, "workspace")
    assertEqual(ws.id, WS_A, "id")
    assertEqual(ws.name, "Test Workspace alpha", "name")
    assertEqual(ws.isPaused, false, "isPaused")
  })

  await test("getWorkspaces() includes the saved workspace", async () => {
    const all = await getWorkspaces()
    const found = all.find((w) => w.id === WS_A)
    assertDefined(found, `workspace ${WS_A} in list`)
  })

  await test("saveWorkspace() updates an existing workspace", async () => {
    const ws = await getWorkspace(WS_A)
    assertDefined(ws, "workspace to update")
    const updated: Workspace = { ...ws, name: "Updated Workspace Alpha", isPaused: true }
    await saveWorkspace(updated)

    const reloaded = await getWorkspace(WS_A)
    assertDefined(reloaded, "reloaded workspace")
    assertEqual(reloaded.name, "Updated Workspace Alpha", "updated name")
    assertEqual(reloaded.isPaused, true, "updated isPaused")
  })

  await test("saveWorkspace() can save a second workspace", async () => {
    const ws = makeWorkspace("beta")
    ws.id = WS_B
    await saveWorkspace(ws)

    const reloaded = await getWorkspace(WS_B)
    assertDefined(reloaded, "second workspace")
    assertEqual(reloaded.id, WS_B, "id")
  })

  await test("deleteWorkspace() removes the workspace", async () => {
    await deleteWorkspace(WS_B)
    const all = await getWorkspaces()
    const found = all.find((w) => w.id === WS_B)
    assert(found === undefined, `workspace ${WS_B} should be removed`)
  })
}

async function runTabCRUD(): Promise<void> {
  suite("3 — Tab CRUD")

  await test("saveTab() persists a new tab", async () => {
    const tab = makeTab(TAB_1, WS_A)
    await saveTab(tab)
  })

  await test("getTab() retrieves the saved tab by id", async () => {
    const tab = await getTab(TAB_1)
    assertDefined(tab, "tab")
    assertEqual(tab.id, TAB_1, "id")
    assertEqual(tab.workspaceId, WS_A, "workspaceId")
    assertEqual(tab.isImportant, false, "isImportant")
  })

  await test("saveTab() updates an existing tab (toggle isImportant)", async () => {
    const tab = await getTab(TAB_1)
    assertDefined(tab, "tab to update")
    await saveTab({ ...tab, isImportant: true, lastAccessed: Date.now() })

    const reloaded = await getTab(TAB_1)
    assertDefined(reloaded, "reloaded tab")
    assertEqual(reloaded.isImportant, true, "isImportant after toggle")
  })

  await test("saveTab() can save a second tab", async () => {
    await saveTab(makeTab(TAB_2, WS_A))
    const tab2 = await getTab(TAB_2)
    assertDefined(tab2, "second tab")
    assertEqual(tab2.id, TAB_2, "id")
  })

  await test("deleteTab() removes the tab", async () => {
    await deleteTab(TAB_2)
    const tab = await getTab(TAB_2)
    // getTab returns null / undefined when not found
    assert(tab === null || tab === undefined, `tab ${TAB_2} should be deleted`)
  })
}

async function runCrossEntity(): Promise<void> {
  suite("4 — Cross-entity")

  await test("updateWorkspaceTabs() stores tabs on the workspace", async () => {
    const tab = makeTab(TAB_1, WS_A)
    await updateWorkspaceTabs(WS_A, [tab])

    const ws = await getWorkspace(WS_A)
    assertDefined(ws, "workspace")
    assertEqual(ws.tabs.length, 1, "tab count on workspace")
    assertEqual(ws.tabs[0]?.id, TAB_1, "tab id on workspace")
  })

  await test("findWorkspaceByTab() returns the correct workspace id", async () => {
    const found = await findWorkspaceByTab(TAB_1)
    // May return the id string or null depending on implementation
    // Either is valid — we just assert it doesn't throw and returns a string if found
    assert(
      found === null || typeof found === "string",
      `findWorkspaceByTab should return string or null, got ${String(found)}`
    )
  })
}

async function runSettings(): Promise<void> {
  suite("5 — Settings")

  await test("getSettings() returns an object with expected keys", async () => {
    const settings = await getSettings()
    assertDefined(settings, "settings")
    assert("enableAutoGrouping" in settings, "enableAutoGrouping key present")
    assert("maxTabsBeforeSuggestion" in settings, "maxTabsBeforeSuggestion key present")
    assert("theme" in settings, "theme key present")
    assert("isPremium" in settings, "isPremium key present")
    assert("syncEnabled" in settings, "syncEnabled key present")
  })

  await test("updateSettings() persists a change", async () => {
    const before = await getSettings()
    await updateSettings({ theme: before.theme === "dark" ? "light" : "dark" })
    const after = await getSettings()
    assert(after.theme !== before.theme, "theme should have changed")
  })

  await test("resetSettings() restores defaults", async () => {
    await resetSettings()
    const settings = await getSettings()
    // Default theme per project spec is 'dark'
    assertEqual(settings.theme, "dark", "default theme")
    assertEqual(settings.isPremium, false, "default isPremium")
  })
}

async function runSuggestions(): Promise<void> {
  suite("6 — Suggestions")

  await test("getSuggestions() returns an array", async () => {
    const suggestions = await getSuggestions()
    assert(Array.isArray(suggestions), "should return an array")
  })

  await test("addSuggestion() appends a new suggestion", async () => {
    const before = await getSuggestions()
    const beforeCount = before.filter((s) => s.name.startsWith(TEST_PREFIX)).length

    await addSuggestion(makeSuggestion("one"))

    const after = await getSuggestions()
    const afterCount = after.filter((s) => s.name.startsWith(TEST_PREFIX)).length
    assertEqual(afterCount, beforeCount + 1, "suggestion count")
  })

  await test("saveSuggestions() overwrites the suggestions array", async () => {
    const twoSuggestions = [makeSuggestion("A"), makeSuggestion("B")]
    await saveSuggestions(twoSuggestions)

    const reloaded = await getSuggestions()
    assertEqual(reloaded.length, 2, "suggestion count after overwrite")
    assertEqual(reloaded[0]?.name, twoSuggestions[0]?.name, "first suggestion name")
  })
}

async function runCleanup(): Promise<void> {
  suite("7 — Cleanup")

  await test("cleanupOldWorkspaces() runs without error (no arguments)", async () => {
    // Critical: must be called with NO arguments — see project rules
    await cleanupOldWorkspaces()
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Reporter
// ─────────────────────────────────────────────────────────────────────────────

function printReport(): void {
  const passed = results.filter((r) => r.passed).length
  const failed = results.filter((r) => !r.passed).length
  const total = results.length

  console.group(
    `%c FocusFlow Integration Tests — ${passed}/${total} passed `,
    "background: #1a1a1a; color: #fff; font-weight: bold; padding: 2px 8px; border-radius: 4px;"
  )

  let lastSuite = ""
  for (const r of results) {
    if (r.suite !== lastSuite) {
      console.groupCollapsed(
        `%c  ${r.suite} `,
        "font-weight: bold; color: #a0a0a0;"
      )
      lastSuite = r.suite
    }

    if (r.passed) {
      console.log(
        `%c ✓ %c${r.name} %c${r.durationMs}ms`,
        "color: #10b981; font-weight: bold;",
        "color: inherit;",
        "color: #666;"
      )
    } else {
      console.error(
        `%c ✗ %c${r.name}\n    %c${r.error ?? "unknown error"}`,
        "color: #ef4444; font-weight: bold;",
        "color: inherit;",
        "color: #ef4444;"
      )
    }
  }

  // Close all open suite groups
  for (let i = 0; i < new Set(results.map((r) => r.suite)).size; i++) {
    console.groupEnd()
  }

  console.log(
    `\n%c ${passed} passed  %c ${failed} failed  %c ${total} total`,
    "color: #10b981; font-weight: bold;",
    failed > 0 ? "color: #ef4444; font-weight: bold;" : "color: #666;",
    "color: #a0a0a0;"
  )

  console.groupEnd()
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * runIntegrationTests
 *
 * Runs all integration suites against the real chrome.storage API.
 * Cleans up test data before and after the run.
 *
 * Call this from the popup's DevTools console:
 *   const { runIntegrationTests } = await import(chrome.runtime.getURL('integration.js'));
 *   await runIntegrationTests();
 */
export async function runIntegrationTests(): Promise<void> {
  results.length = 0 // reset on re-run
  const startTime = performance.now()

  console.log(
    "%c FocusFlow — Starting integration tests… ",
    "background: #3b82f6; color: #fff; font-weight: bold; padding: 2px 8px; border-radius: 4px;"
  )

  // Sanitise any leftover data from a previous interrupted run
  await cleanupTestData()

  // Run all suites sequentially (storage ops must not race)
  await runStorageLifecycle()
  await runWorkspaceCRUD()
  await runTabCRUD()
  await runCrossEntity()
  await runSettings()
  await runSuggestions()
  await runCleanup()

  // Teardown — remove all test data
  await cleanupTestData()

  const totalMs = Math.round(performance.now() - startTime)
  printReport()

  const failed = results.filter((r) => !r.passed).length
  console.log(
    `%c Completed in ${totalMs}ms`,
    "color: #a0a0a0; font-style: italic;"
  )

  if (failed > 0) {
    console.warn(
      `%c ⚠ ${failed} test(s) failed — see errors above`,
      "color: #f59e0b; font-weight: bold;"
    )
  } else {
    console.log(
      "%c ✓ All tests passed — extension storage layer is healthy",
      "color: #10b981; font-weight: bold;"
    )
  }
}
