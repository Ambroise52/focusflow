/**
 * FocusFlow — Store Barrel Export
 * ─────────────────────────────────────────────
 * File: src/store/index.ts
 *
 * Single import point for all Zustand stores.
 * Components import from here instead of individual store files:
 *
 *   import { useWorkspaceStore, useSettingsStore } from "../../store";
 *
 * Adding a new store only requires adding one export line here.
 */

export { useWorkspaceStore } from "./workspaceStore";
export { useSettingsStore  } from "./settingsStore";
