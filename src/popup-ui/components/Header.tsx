/**
 * FocusFlow Popup Header
 *
 * Top bar rendered in every popup view. Displays:
 *   - Animated FocusFlow logo mark (SVG)
 *   - "FocusFlow" wordmark
 *   - Live tab count badge
 *   - Crown icon for premium users
 *   - Settings gear button
 *
 * @module popup/components/Header
 */

import { useState, useEffect } from "react";
import { getSettings } from "../../lib/storage";
import type { UserSettings } from "../../types/settings";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface HeaderProps {
  /** Called when the user clicks the settings (⚙) button. */
  onSettingsClick: () => void;
  /** Current active tab count — shown in the badge next to the logo. */
  tabCount?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Sticky header component for the FocusFlow popup.
 * Reads premium status directly from storage on mount.
 */
export default function Header({ onSettingsClick, tabCount = 0 }: HeaderProps) {
  const [isPremium, setIsPremium] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load premium status from storage once on mount
  useEffect(() => {
    let cancelled = false;

    getSettings()
      .then((settings: UserSettings) => {
        if (!cancelled) {
          setIsPremium(settings.isPremium);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <header style={styles.header}>
      {/* Left — logo + wordmark + badge */}
      <div style={styles.left}>
        {/* SVG Logo mark */}
        <LogoMark />

        {/* Wordmark */}
        <span style={styles.wordmark}>FocusFlow</span>

        {/* Live tab count badge */}
        {tabCount > 0 && (
          <span
            style={styles.badge}
            title={`${tabCount} tab${tabCount !== 1 ? "s" : ""} open`}
          >
            {tabCount}
          </span>
        )}
      </div>

      {/* Right — premium crown + settings */}
      <div style={styles.right}>
        {/* Premium crown — only shown for paid users */}
        {loaded && isPremium && (
          <span style={styles.crownWrapper} title="FocusFlow Premium">
            <CrownIcon />
          </span>
        )}

        {/* Settings button */}
        <button
          style={styles.settingsButton}
          onClick={onSettingsClick}
          title="Settings"
          aria-label="Open settings"
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor =
              "#2A2A2A";
            (e.currentTarget as HTMLButtonElement).style.color = "#FFFFFF";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor =
              "transparent";
            (e.currentTarget as HTMLButtonElement).style.color = "#A0A0A0";
          }}
        >
          <GearIcon />
        </button>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Sub-components — inline SVG icons (no external dep needed)
// ---------------------------------------------------------------------------

/**
 * FocusFlow logo mark — a stylised "F" made of stacked horizontal
 * bars with a blue accent dot, echoing tabs organised into focused groups.
 */
function LogoMark() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 26 26"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={styles.logoSvg}
    >
      {/* Outer rounded square */}
      <rect width="26" height="26" rx="7" fill="#1A1A1A" />
      {/* Top bar — full width */}
      <rect x="6" y="7" width="14" height="3" rx="1.5" fill="#FFFFFF" />
      {/* Middle bar — 3/4 width */}
      <rect x="6" y="12" width="10" height="3" rx="1.5" fill="#FFFFFF" />
      {/* Bottom bar — half width, dimmed */}
      <rect x="6" y="17" width="7" height="2.5" rx="1.25" fill="#555555" />
      {/* Accent dot — blue, bottom-right corner */}
      <circle cx="20" cy="19" r="2.5" fill="#3B82F6" />
    </svg>
  );
}

/**
 * Settings gear icon — outline style, 18×18 viewport.
 */
function GearIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

/**
 * Premium crown icon — filled gold, shown only for Premium subscribers.
 */
function CrownIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="#F59E0B"
      aria-hidden="true"
    >
      <path d="M2 19l2-9 4.5 4L12 5l3.5 9L20 10l2 9H2z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Styles — inline, no Tailwind dependency in this component
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    height: "52px",
    padding: "0 14px",
    backgroundColor: "#0A0A0A",
    borderBottom: "1px solid #1E1E1E",
    boxSizing: "border-box",
    flexShrink: 0,
    boxShadow: "0 1px 0 0 rgba(255,255,255,0.04)",
  },

  left: {
    display: "flex",
    alignItems: "center",
    gap: "9px",
  },

  logoSvg: {
    flexShrink: 0,
    filter: "drop-shadow(0 0 6px rgba(59,130,246,0.25))",
  },

  wordmark: {
    fontFamily:
      "'SF Pro Display', 'Segoe UI', system-ui, sans-serif",
    fontSize: "15px",
    fontWeight: 700,
    letterSpacing: "-0.3px",
    color: "#FFFFFF",
    lineHeight: 1,
    userSelect: "none",
  },

  badge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "20px",
    height: "18px",
    padding: "0 5px",
    borderRadius: "9px",
    backgroundColor: "#1E3A5F",
    color: "#60A5FA",
    fontSize: "11px",
    fontWeight: 600,
    fontFamily: "monospace",
    lineHeight: 1,
    letterSpacing: "0.3px",
    userSelect: "none",
  },

  right: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },

  crownWrapper: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "26px",
    height: "26px",
    borderRadius: "6px",
    backgroundColor: "#1C1700",
    border: "1px solid #3D2E00",
    cursor: "default",
    flexShrink: 0,
  },

  settingsButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "32px",
    height: "32px",
    borderRadius: "8px",
    border: "none",
    backgroundColor: "transparent",
    color: "#A0A0A0",
    cursor: "pointer",
    transition: "background-color 0.15s ease, color 0.15s ease",
    flexShrink: 0,
    padding: 0,
  },
};
