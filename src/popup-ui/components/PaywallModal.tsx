import React, { useState, useEffect, useCallback } from "react";
import {
  X,
  Crown,
  Cloud,
  Cpu,
  Zap,
  Users,
  Check,
  Lock,
} from "lucide-react";

import { initiatePaddleCheckout } from "../../lib/supabase";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type Plan = "monthly" | "yearly";

interface PaywallModalProps {
  /** The name of the locked feature that triggered this modal, e.g. "Cloud Sync" */
  featureName?: string;
  /** Called when the user closes the modal without upgrading */
  onClose: () => void;
}

// ─────────────────────────────────────────────
// Premium benefits list
// Each item maps to a Lucide icon + label + short description
// ─────────────────────────────────────────────
const BENEFITS = [
  {
    icon: Cloud,
    label: "Cloud Sync",
    description: "Encrypted backup across all your devices",
  },
  {
    icon: Zap,
    label: "AI Auto-Grouping",
    description: "Smart workspace suggestions powered by ML",
  },
  {
    icon: Cpu,
    label: "Unlimited Workspaces",
    description: "No cap — save as many as you need",
  },
  {
    icon: Users,
    label: "Shared Workspaces",
    description: "Collaborate with teammates in real time",
  },
] as const;

// ─────────────────────────────────────────────
// Pricing constants
// ─────────────────────────────────────────────
const PRICING = {
  monthly: {
    label: "Monthly",
    price: "$4.99",
    period: "/ month",
    saving: null,
  },
  yearly: {
    label: "Yearly",
    price: "$49",
    period: "/ year",
    saving: "Save 17%",
  },
} as const;

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────
const PaywallModal: React.FC<PaywallModalProps> = ({ featureName, onClose }) => {
  const [selectedPlan, setSelectedPlan] = useState<Plan>("yearly");
  const [checkoutState, setCheckoutState] = useState<
    "idle" | "loading" | "error"
  >("idle");

  // ── Close on Escape key ────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // ── Paddle checkout ────────────────────────
  /**
   * Calls initiatePaddleCheckout() with the selected plan.
   * Paddle opens its own overlay on top of the extension popup.
   * On success the webhook updates isPremium in Supabase;
   * the popup will reflect this on next open.
   */
  const handleUpgrade = useCallback(async () => {
    setCheckoutState("loading");
    try {
      await initiatePaddleCheckout(selectedPlan);
      // Paddle takes over from here — no further action needed in this component
      setCheckoutState("idle");
    } catch {
      setCheckoutState("error");
      // Auto-reset error after 3 seconds so user can retry
      setTimeout(() => setCheckoutState("error"), 3000);
    }
  }, [selectedPlan]);

  // ─────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────
  return (
    /* ── Full-screen backdrop ── */
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Upgrade to FocusFlow Premium"
      className="
        absolute inset-0 z-50 flex items-end
        bg-black/70 backdrop-blur-sm
      "
      onClick={(e) => {
        // Clicking the backdrop closes the modal
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* ── Modal panel (slides up from bottom) ── */}
      <div
        className="
          w-full bg-neutral-950 border-t border-neutral-800
          rounded-t-2xl flex flex-col overflow-hidden
          animate-[slideUp_200ms_ease-out]
        "
        style={{ maxHeight: "92%" }}
      >

        {/* ── Header ────────────────────────── */}
        <div className="flex items-start justify-between px-4 pt-4 pb-3">
          <div className="flex flex-col gap-0.5">
            {/* Crown + title */}
            <div className="flex items-center gap-2">
              <span className="
                w-7 h-7 rounded-lg flex items-center justify-center
                bg-amber-500/15 border border-amber-500/25
              ">
                <Crown size={14} className="text-amber-400" strokeWidth={2} />
              </span>
              <h2 className="text-[15px] font-bold text-neutral-100 leading-tight">
                FocusFlow Premium
              </h2>
            </div>

            {/* Context: which feature triggered this */}
            {featureName ? (
              <p className="text-[11px] text-neutral-500 ml-9">
                <Lock size={9} className="inline mb-0.5 mr-0.5" strokeWidth={2} />
                <span className="text-blue-400 font-medium">{featureName}</span>
                {" "}requires a Premium plan
              </p>
            ) : (
              <p className="text-[11px] text-neutral-500 ml-9">
                Unlock everything FocusFlow has to offer
              </p>
            )}
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            title="Close"
            aria-label="Close upgrade modal"
            className="
              p-1.5 rounded-md text-neutral-600
              hover:text-neutral-300 hover:bg-neutral-800
              transition-colors flex-shrink-0
            "
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>

        {/* ── Divider ───────────────────────── */}
        <div className="border-t border-neutral-800/60 mx-4" />

        {/* ── Benefits list ─────────────────── */}
        <div className="px-4 py-3 flex flex-col gap-2.5">
          {BENEFITS.map(({ icon: Icon, label, description }) => (
            <div key={label} className="flex items-center gap-3">
              {/* Icon bubble */}
              <span className="
                w-7 h-7 rounded-lg flex items-center justify-center
                bg-blue-500/10 border border-blue-500/20 flex-shrink-0
              ">
                <Icon size={13} className="text-blue-400" strokeWidth={2} />
              </span>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-neutral-200 leading-tight">
                  {label}
                </p>
                <p className="text-[10px] text-neutral-500 leading-tight">
                  {description}
                </p>
              </div>

              {/* Check */}
              <Check
                size={12}
                className="text-emerald-400 flex-shrink-0"
                strokeWidth={2.5}
              />
            </div>
          ))}
        </div>

        {/* ── Divider ───────────────────────── */}
        <div className="border-t border-neutral-800/60 mx-4" />

        {/* ── Plan toggle ───────────────────── */}
        <div className="px-4 py-3 flex flex-col gap-2">
          <p className="text-[10px] font-semibold text-neutral-600 uppercase tracking-wider">
            Choose a plan
          </p>

          <div className="flex gap-2">
            {(["monthly", "yearly"] as Plan[]).map((plan) => {
              const p = PRICING[plan];
              const isSelected = selectedPlan === plan;
              return (
                <button
                  key={plan}
                  onClick={() => setSelectedPlan(plan)}
                  aria-pressed={isSelected}
                  className={`
                    flex-1 relative flex flex-col items-start px-3 py-2.5
                    rounded-xl border transition-all duration-150
                    ${isSelected
                      ? "border-blue-500/60 bg-blue-500/10"
                      : "border-neutral-800 bg-neutral-900 hover:border-neutral-700"
                    }
                  `}
                >
                  {/* Yearly "best value" badge */}
                  {plan === "yearly" && (
                    <span className="
                      absolute -top-2 right-2
                      text-[9px] font-bold text-white
                      bg-blue-600 px-1.5 py-0.5 rounded-full
                    ">
                      Best Value
                    </span>
                  )}

                  <span className={`
                    text-[11px] font-semibold leading-tight
                    ${isSelected ? "text-blue-300" : "text-neutral-400"}
                  `}>
                    {p.label}
                  </span>

                  <span className="text-[16px] font-bold text-neutral-100 leading-tight mt-0.5">
                    {p.price}
                    <span className="text-[11px] font-normal text-neutral-500">
                      {p.period}
                    </span>
                  </span>

                  {p.saving && (
                    <span className="text-[10px] text-emerald-400 font-medium mt-0.5">
                      {p.saving}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── CTA + error ───────────────────── */}
        <div className="px-4 pb-4 flex flex-col gap-2">
          {/* Error message */}
          {checkoutState === "error" && (
            <p className="text-[11px] text-rose-400 text-center">
              Couldn't open checkout. Please try again.
            </p>
          )}

          {/* Primary upgrade button */}
          <button
            onClick={handleUpgrade}
            disabled={checkoutState === "loading"}
            className="
              w-full flex items-center justify-center gap-2
              py-3 rounded-xl font-semibold text-[13px] text-white
              bg-gradient-to-r from-blue-600 to-blue-500
              hover:from-blue-500 hover:to-blue-400
              transition-all disabled:opacity-50 disabled:cursor-not-allowed
              shadow-lg shadow-blue-900/30
            "
          >
            {checkoutState === "loading" ? (
              <>
                <span
                  className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                  aria-hidden
                />
                Opening checkout…
              </>
            ) : (
              <>
                <Crown size={14} strokeWidth={2} />
                Upgrade to Premium —{" "}
                {selectedPlan === "monthly" ? "$4.99/mo" : "$49/yr"}
              </>
            )}
          </button>

          {/* Dismiss link */}
          <button
            onClick={onClose}
            className="
              text-[11px] text-neutral-600 hover:text-neutral-400
              transition-colors text-center w-full
            "
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaywallModal;
