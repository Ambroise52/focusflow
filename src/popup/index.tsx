import React, { useState, useEffect, useCallback } from "react";
import { Layout, BookOpen } from "lucide-react";

import Header          from "./components/Header";
import ActiveSession   from "./components/ActiveSession";
import WorkspaceLibrary from "./components/WorkspaceLibrary";
import PaywallModal    from "./components/PaywallModal";

import { getSettings }   from "../lib/storage";
import { isPremiumUser } from "../lib/supabase";

import "../../styles/globals.css"; // Tailwind base styles

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

/** The two navigable views inside the popup. */
type ActiveView = "session" | "library";

/**
 * Shape used when the PaywallModal is requested.
 * featureName is shown as context inside the modal
 * (e.g. "Cloud Sync", "AI Auto-Grouping").
 */
interface PaywallRequest {
  featureName: string;
}

// ─────────────────────────────────────────────
// Nav tab configuration
// Centralised so adding a future third tab
// only requires adding an entry here.
// ─────────────────────────────────────────────
const NAV_TABS: {
  id: ActiveView;
  label: string;
  Icon: React.FC<{ size: number; strokeWidth: number }>;
}[] = [
  { id: "session", label: "Active",     Icon: Layout   },
  { id: "library", label: "Workspaces", Icon: BookOpen },
];

// ─────────────────────────────────────────────
// Root popup component
// ─────────────────────────────────────────────
const IndexPopup: React.FC = () => {
  // ── State ──────────────────────────────────
  const [activeView, setActiveView] = useState<ActiveView>("session");
  const [isPremium, setIsPremium]   = useState<boolean>(false);

  /**
   * When set, PaywallModal renders as a full-screen overlay.
   * Reset to null when the user closes the modal.
   */
  const [paywallRequest, setPaywallRequest] = useState<PaywallRequest | null>(null);

  // ── Load premium status on mount ──────────
  useEffect(() => {
    /**
     * Check premium status from two sources and take the most generous result:
     * 1. Local settings cache (fast, works offline)
     * 2. Supabase live check (authoritative, requires network)
     *
     * We load the local cache first so the UI is never blocked, then
     * overwrite with the live result once it arrives.
     */
    const loadPremiumStatus = async () => {
      try {
        // Fast path: local settings cache
        const settings = await getSettings();
        setIsPremium(settings.isPremium ?? false);

        // Authoritative path: Supabase check
        const liveStatus = await isPremiumUser();
        setIsPremium(liveStatus);
      } catch {
        // Network unavailable — fall back to cached value already set above
      }
    };

    loadPremiumStatus();
  }, []);

  // ── Paywall gate ───────────────────────────
  /**
   * Called by any child component that guards a premium feature.
   * If the user is premium the callback is executed immediately.
   * If not, the PaywallModal is shown instead.
   *
   * @param featureName - Human-readable name shown inside the modal
   * @param onUnlocked  - Callback to run if/when the user is premium
   */
  const handlePremiumGate = useCallback(
    (featureName: string, onUnlocked?: () => void) => {
      if (isPremium) {
        onUnlocked?.();
      } else {
        setPaywallRequest({ featureName });
      }
    },
    [isPremium]
  );

  /** Dismiss the paywall modal. */
  const handleClosePaywall = useCallback(() => {
    setPaywallRequest(null);
  }, []);

  // ─────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────
  return (
    /*
     * Popup dimensions: 400 × 580px — standard for Chrome extensions.
     * `relative` is required so PaywallModal's `absolute inset-0`
     * is scoped to this container, not the browser viewport.
     */
    <div
      className="
        relative flex flex-col
        w-[400px] h-[580px]
        bg-neutral-950 text-neutral-100
        overflow-hidden select-none
      "
    >
      {/* ── Header ──────────────────────────── */}
      <Header
        isPremium={isPremium}
        onUpgradeClick={() => setPaywallRequest({ featureName: "Premium" })}
      />

      {/* ── Main view area ──────────────────── */}
      <main className="flex-1 min-h-0 overflow-hidden relative">
        {/*
         * Both views are always mounted but only one is visible.
         * This keeps WorkspaceLibrary's loaded state alive when
         * the user switches back and forth — avoiding a re-fetch
         * every time they tab between views.
         */}
        <div
          className={`absolute inset-0 ${activeView === "session" ? "block" : "hidden"}`}
          aria-hidden={activeView !== "session"}
        >
          <ActiveSession />
        </div>

        <div
          className={`absolute inset-0 ${activeView === "library" ? "block" : "hidden"}`}
          aria-hidden={activeView !== "library"}
        >
          <WorkspaceLibrary />
        </div>
      </main>

      {/* ── Bottom navigation bar ───────────── */}
      <nav
        className="
          flex items-center border-t border-neutral-800/60
          bg-neutral-950 flex-shrink-0
        "
        aria-label="Main navigation"
      >
        {NAV_TABS.map(({ id, label, Icon }) => {
          const isActive = activeView === id;
          return (
            <button
              key={id}
              onClick={() => setActiveView(id)}
              aria-current={isActive ? "page" : undefined}
              aria-label={`Switch to ${label} view`}
              className={`
                flex-1 flex flex-col items-center justify-center
                gap-0.5 py-2.5 transition-colors
                ${isActive
                  ? "text-blue-400"
                  : "text-neutral-600 hover:text-neutral-400"
                }
              `}
            >
              <Icon size={15} strokeWidth={isActive ? 2.5 : 1.8} />
              <span
                className={`
                  text-[10px] font-medium
                  ${isActive ? "text-blue-400" : "text-neutral-600"}
                `}
              >
                {label}
              </span>

              {/* Active indicator dot */}
              {isActive && (
                <span
                  className="w-1 h-1 rounded-full bg-blue-400 mt-0.5"
                  aria-hidden
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* ── Paywall modal overlay ────────────── */}
      {paywallRequest && (
        <PaywallModal
          featureName={paywallRequest.featureName}
          onClose={handleClosePaywall}
        />
      )}
    </div>
  );
};

export default IndexPopup;
