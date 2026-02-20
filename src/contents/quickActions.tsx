/**
 * FocusFlow — Quick Actions Content Script
 * ─────────────────────────────────────────────
 * File: src/contents/quickActions.tsx
 *
 * Runs injected into every browser tab via Plasmo's content script
 * auto-detection. Does NOT render any UI into the page.
 *
 * Responsibilities:
 *  1. Listen for Cmd/Ctrl+Shift+K → open the extension popup
 *  2. On load, message the background worker to build the
 *     "Add to workspace…" context menu from saved workspaces
 *  3. Listen for context menu rebuild requests from background
 *
 * Security note:
 *  - Never reads chrome.storage directly (only background worker does)
 *  - Sanitizes the current tab URL before sending to background
 *  - No external network requests
 */

import { sanitizeUrl } from "../lib/utils";
import type { Workspace } from "../types/workspace";

// ─────────────────────────────────────────────
// Plasmo content script config
// Tells Plasmo which URLs to inject this script into.
// "all_urls" is used here but the manifest only grants
// "activeTab" + "tabs" permissions — no host_permissions
// are requested, keeping the security footprint minimal.
// ─────────────────────────────────────────────
export const config = {
  matches: ["<all_urls>"],
  run_at: "document_idle",
};

// ─────────────────────────────────────────────
// Types for background message passing
// ─────────────────────────────────────────────

interface GetWorkspacesResponse {
  success: boolean;
  data: Workspace[];
}

interface MoveTabResponse {
  success: boolean;
  error?: string;
}

// ─────────────────────────────────────────────
// 1. KEYBOARD SHORTCUT — Cmd/Ctrl + Shift + K
//    Opens the extension popup programmatically.
//    chrome.action.openPopup() is only available
//    from background/service worker context, so we
//    send a message and let the background handle it.
// ─────────────────────────────────────────────

/**
 * Handles keydown events on the page.
 * Detects Cmd/Ctrl+Shift+K and asks the background
 * worker to open the extension popup.
 */
const handleKeydown = (e: KeyboardEvent): void => {
  const isMac     = navigator.platform.toUpperCase().includes("MAC");
  const modKey    = isMac ? e.metaKey : e.ctrlKey;
  const isTarget  = modKey && e.shiftKey && e.key.toUpperCase() === "K";

  if (!isTarget) return;

  // Prevent the page from handling this shortcut (e.g. browser bookmark shortcut)
  e.preventDefault();
  e.stopPropagation();

  chrome.runtime.sendMessage({ action: "OPEN_POPUP" }).catch(() => {
    // Background may be sleeping — silently ignore.
    // The service worker will wake on next user interaction.
  });
};

document.addEventListener("keydown", handleKeydown, { capture: true });

// ─────────────────────────────────────────────
// 2. CONTEXT MENU — "Add to workspace…"
//    Context menus can only be created/updated
//    from the background service worker, so this
//    content script asks the background to rebuild
//    the menu whenever the page loads, ensuring
//    workspace names stay up to date.
// ─────────────────────────────────────────────

/**
 * Ask the background worker to rebuild the context menu
 * with the latest list of saved workspaces.
 * Called once when the content script initialises.
 */
const requestContextMenuRebuild = async (): Promise<void> => {
  try {
    const response = await chrome.runtime.sendMessage<
      { action: string },
      GetWorkspacesResponse
    >({ action: "GET_WORKSPACES" });

    if (!response?.success || !Array.isArray(response.data)) return;

    const workspaces = response.data;

    // Ask the background to build the context menu with this workspace list
    await chrome.runtime.sendMessage({
      action:     "REBUILD_CONTEXT_MENU",
      workspaces: workspaces.map((ws) => ({ id: ws.id, name: ws.name })),
    });
  } catch {
    // Background may be sleeping on extension startup — not critical
  }
};

// Run on content script initialisation
requestContextMenuRebuild();

// ─────────────────────────────────────────────
// 3. INCOMING MESSAGE LISTENER
//    The background worker sends messages back to
//    this content script in two cases:
//    a) "CONTEXT_MENU_CLICKED" — user selected a
//       workspace from the right-click menu
//    b) "REFRESH_CONTEXT_MENU" — background wants
//       the script to re-trigger a rebuild after a
//       workspace is created/deleted/renamed
// ─────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (
    message: { action: string; workspaceId?: string },
    _sender,
    sendResponse
  ) => {
    // ── a) User clicked "Add to [workspace]" in context menu ──
    if (message.action === "CONTEXT_MENU_CLICKED" && message.workspaceId) {
      handleAddCurrentTabToWorkspace(message.workspaceId)
        .then(() => sendResponse({ success: true }))
        .catch(() => sendResponse({ success: false }));

      // Return true to keep the message channel open for the async response
      return true;
    }

    // ── b) Background requests a context menu refresh ──
    if (message.action === "REFRESH_CONTEXT_MENU") {
      requestContextMenuRebuild()
        .then(() => sendResponse({ success: true }))
        .catch(() => sendResponse({ success: false }));

      return true;
    }
  }
);

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Moves the current tab into the specified workspace.
 * Sanitizes the URL first to strip sensitive query params,
 * then asks the background worker to perform the storage write.
 *
 * @param workspaceId - UUID of the target workspace
 */
const handleAddCurrentTabToWorkspace = async (
  workspaceId: string
): Promise<void> => {
  const safeUrl = sanitizeUrl(window.location.href);
  const title   = document.title || safeUrl;

  const response = await chrome.runtime.sendMessage<
    {
      action:      string;
      workspaceId: string;
      url:         string;
      title:       string;
    },
    MoveTabResponse
  >({
    action:      "ADD_CURRENT_TAB_TO_WORKSPACE",
    workspaceId,
    url:         safeUrl,
    title,
  });

  if (!response?.success) {
    console.warn(
      "[FocusFlow] Failed to add tab to workspace:",
      response?.error ?? "Unknown error"
    );
  }
};
