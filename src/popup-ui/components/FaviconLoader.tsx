import React, { useState, useCallback } from "react";

// ─────────────────────────────────────────────
// Utility: Build a Google S2 favicon URL
// ─────────────────────────────────────────────
export const getFaviconUrl = (url: string, size: 16 | 32 | 64 = 32): string => {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
  } catch {
    return "";
  }
};

// ─────────────────────────────────────────────
// Utility: Extract the first letter of a domain
// ─────────────────────────────────────────────
export const getDomainInitial = (url: string): string => {
  try {
    const hostname = new URL(url).hostname;
    // Strip "www." so "www.github.com" → "g"
    const cleaned = hostname.replace(/^www\./, "");
    return cleaned.charAt(0).toUpperCase();
  } catch {
    return "?";
  }
};

// ─────────────────────────────────────────────
// Deterministic pastel colour from a domain
// Keeps the fallback avatar visually consistent
// ─────────────────────────────────────────────
const PASTEL_PALETTE = [
  "bg-violet-700",
  "bg-blue-700",
  "bg-emerald-700",
  "bg-amber-700",
  "bg-rose-700",
  "bg-cyan-700",
  "bg-fuchsia-700",
  "bg-lime-700",
] as const;

const getDomainColour = (url: string): string => {
  try {
    const hostname = new URL(url).hostname;
    let hash = 0;
    for (let i = 0; i < hostname.length; i++) {
      hash = hostname.charCodeAt(i) + ((hash << 5) - hash);
    }
    return PASTEL_PALETTE[Math.abs(hash) % PASTEL_PALETTE.length];
  } catch {
    return PASTEL_PALETTE[0];
  }
};

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────
interface FaviconLoaderProps {
  /** The full URL of the tab whose favicon we want to show. */
  url: string;
  /**
   * Optional direct favicon URL already provided by the Chrome tabs API
   * (`tab.favIconUrl`). If valid, we try this first before falling back
   * to the Google S2 service.
   */
  favIconUrl?: string;
  /** Pixel size rendered on screen. Defaults to 16. */
  displaySize?: number;
  /** Google S2 resolution to request. Defaults to 32. */
  fetchSize?: 16 | 32 | 64;
  className?: string;
}

// ─────────────────────────────────────────────
// Load states
// ─────────────────────────────────────────────
type LoadState = "idle" | "loading" | "loaded" | "error";

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────
const FaviconLoader: React.FC<FaviconLoaderProps> = ({
  url,
  favIconUrl,
  displaySize = 16,
  fetchSize = 32,
  className = "",
}) => {
  // Decide the initial source to try
  const initialSrc = useCallback((): string => {
    // Prefer the browser-provided favicon if it looks real
    if (
      favIconUrl &&
      favIconUrl.startsWith("http") &&
      !favIconUrl.includes("_/favicon")
    ) {
      return favIconUrl;
    }
    return getFaviconUrl(url, fetchSize);
  }, [url, favIconUrl, fetchSize]);

  const [src, setSrc] = useState<string>(initialSrc);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [triedGoogle, setTriedGoogle] = useState<boolean>(false);

  // ── Handlers ──────────────────────────────
  const handleLoad = () => setLoadState("loaded");

  const handleError = () => {
    // First failure: if we were using the browser's favicon, try Google S2
    if (!triedGoogle) {
      const googleSrc = getFaviconUrl(url, fetchSize);
      if (googleSrc && googleSrc !== src) {
        setTriedGoogle(true);
        setSrc(googleSrc);
        return;
      }
    }
    // Final failure: show letter avatar
    setLoadState("error");
  };

  // ── Fallback avatar ────────────────────────
  if (loadState === "error") {
    const initial = getDomainInitial(url);
    const colour = getDomainColour(url);

    return (
      <span
        role="img"
        aria-label={`Favicon for ${url}`}
        className={`
          inline-flex items-center justify-center
          rounded-sm select-none font-semibold
          text-white ${colour} ${className}
        `}
        style={{
          width: displaySize,
          height: displaySize,
          fontSize: Math.max(8, displaySize * 0.55),
          flexShrink: 0,
        }}
      >
        {initial}
      </span>
    );
  }

  // ── Image (loading + loaded) ───────────────
  return (
    <span
      className={`inline-flex items-center justify-center ${className}`}
      style={{ width: displaySize, height: displaySize, flexShrink: 0 }}
    >
      {/* Skeleton shimmer shown while loading */}
      {loadState === "loading" && (
        <span
          className="absolute rounded-sm bg-neutral-700 animate-pulse"
          style={{ width: displaySize, height: displaySize }}
          aria-hidden
        />
      )}

      <img
        src={src}
        alt=""
        width={displaySize}
        height={displaySize}
        onLoad={handleLoad}
        onError={handleError}
        className={`
          rounded-sm object-contain transition-opacity duration-150
          ${loadState === "loaded" ? "opacity-100" : "opacity-0"}
        `}
        style={{ imageRendering: "auto" }}
        // Block potentially malicious favicon URLs that differ from the tab's origin
        referrerPolicy="no-referrer"
      />
    </span>
  );
};

export default FaviconLoader;
