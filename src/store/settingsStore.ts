/**
 * FocusFlow — Settings Zustand Store
 * ─────────────────────────────────────────────
 * File: src/store/settingsStore.ts
 *
 * Single source of truth for all user settings in the popup.
 * Components read isPremium, theme, and other preferences from here
 * instead of calling getSettings() individually.
 *
 * Architecture:
 *  - State:   settings (full UserSettings object), loadState, error
 *  - Actions: load, update, checkPremium, clearError
 */

import { create } from "zustand";

import { getSettings, updateSettings } from "../lib/storage";
import { isPremiumUser }               from "../lib/supabase";

import type { UserSettings } from "../types";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type LoadState = "idle" | "loading" | "ready" | "error";

interface SettingsStore {
  // ── State ────────────────────────────────
  settings:  UserSettings | null;
  loadState: LoadState;
  error:     string | null;

  // ── Derived convenience getters ──────────
  /** True when settings are loaded AND isPremium flag is set. */
  isPremium: boolean;

  // ── Actions ──────────────────────────────

  /**
   * Load settings from chrome.storage.sync into the store.
   * Safe to call multiple times — skips if already loading.
   */
  load: () => Promise<void>;

  /**
   * Persist a partial settings update to chrome.storage.sync
   * and merge it into the store immediately.
   *
   * @param patch - Partial UserSettings fields to update
   */
  update: (patch: Partial<UserSettings>) => Promise<void>;

  /**
   * Check the live premium status from Supabase and sync the result
   * back into local settings so it persists across popup opens.
   *
   * Designed for two-phase loading:
   *  1. load()         → fast, reads local cache
   *  2. checkPremium() → authoritative, hits Supabase
   */
  checkPremium: () => Promise<void>;

  /** Clear any error message from the store. */
  clearError: () => void;
}

// ─────────────────────────────────────────────
// Default settings (fallback before load completes)
// ─────────────────────────────────────────────
const DEFAULT_SETTINGS: UserSettings = {
  enableAutoGrouping:       true,
  maxTabsBeforeSuggestion:  5,
  theme:                    "dark",
  isPremium:                false,
  syncEnabled:              false,
};

// ─────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────
export const useSettingsStore = create<SettingsStore>((set, get) => ({
  // ── Initial state ─────────────────────────
  settings:  null,
  loadState: "idle",
  error:     null,
  isPremium: false,

  // ── load ──────────────────────────────────
  load: async () => {
    if (get().loadState === "loading") return;

    set({ loadState: "loading", error: null });
    try {
      const settings = await getSettings();
      set({
        settings,
        loadState: "ready",
        isPremium: settings.isPremium ?? false,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load settings";
      set({ loadState: "error", error: message });
    }
  },

  // ── update ────────────────────────────────
  update: async (patch: Partial<UserSettings>) => {
    try {
      const result = await updateSettings(patch);
      if (!result.success) {
        set({ error: result.error ?? "Failed to update settings" });
        return;
      }
      // Merge the patch into the current settings in the store
      set((state) => ({
        settings: state.settings
          ? { ...state.settings, ...patch }
          : { ...DEFAULT_SETTINGS, ...patch },
        // Keep isPremium in sync if the patch touches it
        isPremium:
          patch.isPremium !== undefined
            ? patch.isPremium
            : (state.settings?.isPremium ?? false),
      }));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update settings";
      set({ error: message });
      throw err;
    }
  },

  // ── checkPremium ──────────────────────────
  checkPremium: async () => {
    try {
      const live = await isPremiumUser();

      // Sync the live result back to local storage so it persists
      await updateSettings({ isPremium: live });

      set((state) => ({
        isPremium: live,
        settings: state.settings
          ? { ...state.settings, isPremium: live }
          : { ...DEFAULT_SETTINGS, isPremium: live },
      }));
    } catch {
      // Network unavailable — keep whatever is cached locally
      // No error state set — this is a background verification, not critical
    }
  },

  // ── clearError ────────────────────────────
  clearError: () => set({ error: null }),
}));
