import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Play,
  Pause,
  Trash2,
  Pencil,
  Check,
  X,
  Layers,
  Clock,
  AlertTriangle,
} from "lucide-react";

import FaviconLoader from "./FaviconLoader";
import { formatRelativeTime } from "../../lib/utils";
import { saveWorkspace, deleteWorkspace } from "../../lib/storage";
import { pauseWorkspace, resumeWorkspace } from "../../background/tabManager";

import type { Workspace } from "../../types/workspace";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type ActionState = "idle" | "loading" | "error";

interface WorkspaceCardProps {
  workspace: Workspace;
  /** Called after any mutation so the parent can re-fetch. */
  onUpdate: () => void;
  /** Called after the workspace is fully deleted. */
  onDelete: (id: string) => void;
}

// ─────────────────────────────────────────────
// Sub-component: action button
// ─────────────────────────────────────────────
interface ActionButtonProps {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  danger?: boolean;
  children: React.ReactNode;
}

const ActionButton: React.FC<ActionButtonProps> = ({
  onClick,
  disabled = false,
  title,
  danger = false,
  children,
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    aria-label={title}
    className={`
      flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium
      transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed
      ${
        danger
          ? "text-rose-400 hover:bg-rose-500/15 hover:text-rose-300"
          : "text-neutral-400 hover:bg-neutral-700/60 hover:text-neutral-200"
      }
    `}
  >
    {children}
  </button>
);

// ─────────────────────────────────────────────
// Sub-component: favicon stack preview
// ─────────────────────────────────────────────
const MAX_PREVIEWS = 5;

const FaviconStack: React.FC<{ workspace: Workspace }> = ({ workspace }) => {
  const previews = workspace.tabs.slice(0, MAX_PREVIEWS);
  const overflow = workspace.tabs.length - MAX_PREVIEWS;

  if (previews.length === 0) return null;

  return (
    <div className="flex items-center" aria-label="Tab previews">
      {previews.map((tab, idx) => (
        <span
          key={tab.id}
          className="rounded-sm ring-1 ring-neutral-900"
          style={{ marginLeft: idx === 0 ? 0 : -4, zIndex: previews.length - idx }}
        >
          <FaviconLoader
            url={tab.url}
            favIconUrl={tab.favIconUrl}
            displaySize={14}
            fetchSize={16}
          />
        </span>
      ))}
      {overflow > 0 && (
        <span className="ml-1 text-[10px] text-neutral-500">
          +{overflow}
        </span>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────
const WorkspaceCard: React.FC<WorkspaceCardProps> = ({
  workspace,
  onUpdate,
  onDelete,
}) => {
  // ── Inline name editing ───────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(workspace.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) nameInputRef.current?.focus();
  }, [isEditing]);

  const handleEditStart = () => {
    setDraftName(workspace.name);
    setIsEditing(true);
  };

  const handleEditCommit = useCallback(async () => {
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === workspace.name) {
      setIsEditing(false);
      return;
    }
    try {
      await saveWorkspace({ ...workspace, name: trimmed });
      onUpdate();
    } catch {
      // silently restore — parent will re-render with unchanged data
    } finally {
      setIsEditing(false);
    }
  }, [draftName, workspace, onUpdate]);

  const handleEditCancel = () => {
    setDraftName(workspace.name);
    setIsEditing(false);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleEditCommit();
    if (e.key === "Escape") handleEditCancel();
  };

  // ── Resume ────────────────────────────────
  const [resumeState, setResumeState] = useState<ActionState>("idle");

  const handleResume = async () => {
    setResumeState("loading");
    try {
      await resumeWorkspace(workspace.id);
      onUpdate();
      setResumeState("idle");
    } catch {
      setResumeState("error");
      setTimeout(() => setResumeState("idle"), 2000);
    }
  };

  // ── Pause ─────────────────────────────────
  const [pauseState, setPauseState] = useState<ActionState>("idle");

  const handlePause = async () => {
    setPauseState("loading");
    try {
      await pauseWorkspace(workspace.id);
      onUpdate();
      setPauseState("idle");
    } catch {
      setPauseState("error");
      setTimeout(() => setPauseState("idle"), 2000);
    }
  };

  // ── Delete (with confirmation) ────────────
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleteState, setDeleteState] = useState<ActionState>("idle");

  const handleDeleteRequest = () => setShowConfirm(true);
  const handleDeleteCancel = () => setShowConfirm(false);

  const handleDeleteConfirm = async () => {
    setDeleteState("loading");
    setShowConfirm(false);
    try {
      await deleteWorkspace(workspace.id, false);
      onDelete(workspace.id);
    } catch {
      setDeleteState("error");
      setTimeout(() => setDeleteState("idle"), 2000);
    }
  };

  // ── Derived display values ─────────────────
  const tabCount = workspace.tabs.length;
  const tabLabel = tabCount === 1 ? "1 tab" : `${tabCount} tabs`;
  const lastUsed = workspace.lastUsedAt
    ? formatRelativeTime(workspace.lastUsedAt)
    : "Never used";
  const accentColor = workspace.color ?? "#3B82F6";
  const isBusy =
    resumeState === "loading" ||
    pauseState === "loading" ||
    deleteState === "loading";

  // ─────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────
  return (
    <article
      aria-label={`Workspace: ${workspace.name}`}
      className={`
        relative flex rounded-xl overflow-hidden
        bg-neutral-900 border transition-all duration-150
        ${showConfirm
          ? "border-rose-500/50"
          : "border-neutral-800 hover:border-neutral-700"
        }
        ${deleteState === "loading" ? "opacity-50 pointer-events-none" : ""}
      `}
    >
      {/* ── Coloured left border ──────────── */}
      <span
        className="w-1 flex-shrink-0"
        style={{ backgroundColor: accentColor }}
        aria-hidden
      />

      {/* ── Card body ─────────────────────── */}
      <div className="flex-1 min-w-0 px-3 py-3 flex flex-col gap-2">

        {/* Row 1: Name + badges + edit button */}
        <div className="flex items-start gap-2">
          {isEditing ? (
            /* Inline edit field */
            <div className="flex-1 flex items-center gap-1 min-w-0">
              <input
                ref={nameInputRef}
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={handleEditKeyDown}
                onBlur={handleEditCommit}
                maxLength={60}
                aria-label="Workspace name"
                className="
                  flex-1 min-w-0 bg-neutral-800 border border-blue-500/60
                  rounded-md px-2 py-0.5 text-[13px] font-semibold
                  text-neutral-100 outline-none
                  focus:ring-1 focus:ring-blue-500
                "
              />
              <button
                onMouseDown={(e) => { e.preventDefault(); handleEditCommit(); }}
                title="Save name"
                aria-label="Save name"
                className="p-0.5 text-emerald-400 hover:text-emerald-300 flex-shrink-0"
              >
                <Check size={13} strokeWidth={2.5} />
              </button>
              <button
                onMouseDown={(e) => { e.preventDefault(); handleEditCancel(); }}
                title="Cancel edit"
                aria-label="Cancel edit"
                className="p-0.5 text-neutral-500 hover:text-neutral-300 flex-shrink-0"
              >
                <X size={13} strokeWidth={2.5} />
              </button>
            </div>
          ) : (
            /* Display name */
            <div className="flex-1 flex items-center gap-2 min-w-0">
              {/* Optional emoji icon */}
              {workspace.icon && (
                <span className="text-base leading-none flex-shrink-0" aria-hidden>
                  {workspace.icon}
                </span>
              )}

              <h3
                className="
                  text-[13px] font-semibold text-neutral-100
                  truncate leading-tight
                "
                title={workspace.name}
              >
                {workspace.name}
              </h3>

              {/* Active / Paused badge */}
              {workspace.isActive && !workspace.isPaused && (
                <span className="
                  flex-shrink-0 flex items-center gap-1
                  text-[9px] font-bold uppercase tracking-wider
                  text-emerald-400 bg-emerald-400/10
                  px-1.5 py-0.5 rounded-full
                ">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden />
                  Live
                </span>
              )}
              {workspace.isPaused && (
                <span className="
                  flex-shrink-0 text-[9px] font-bold uppercase tracking-wider
                  text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-full
                ">
                  Paused
                </span>
              )}
            </div>
          )}

          {/* Edit pencil — only when not editing */}
          {!isEditing && (
            <button
              onClick={handleEditStart}
              title="Rename workspace"
              aria-label="Rename workspace"
              disabled={isBusy}
              className="
                flex-shrink-0 p-1 rounded
                text-neutral-700 hover:text-neutral-400
                transition-colors disabled:opacity-30
              "
            >
              <Pencil size={11} strokeWidth={2} />
            </button>
          )}
        </div>

        {/* Row 2: Meta (tab count + last used) + favicon stack */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 text-[11px] text-neutral-500">
            <span className="flex items-center gap-1">
              <Layers size={11} strokeWidth={2} aria-hidden />
              {tabLabel}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={11} strokeWidth={2} aria-hidden />
              {lastUsed}
            </span>
          </div>

          <FaviconStack workspace={workspace} />
        </div>

        {/* Row 3: Delete confirmation OR action buttons */}
        {showConfirm ? (
          <div className="
            flex items-center gap-2 mt-0.5
            bg-rose-500/10 border border-rose-500/20
            rounded-lg px-2.5 py-2
          ">
            <AlertTriangle size={12} className="text-rose-400 flex-shrink-0" strokeWidth={2} />
            <p className="flex-1 text-[11px] text-rose-300 leading-tight">
              Delete <strong>{workspace.name}</strong>? This can't be undone.
            </p>
            <button
              onClick={handleDeleteConfirm}
              className="
                flex-shrink-0 px-2 py-1 rounded-md
                text-[11px] font-semibold text-white
                bg-rose-600 hover:bg-rose-500 transition-colors
              "
              aria-label="Confirm delete"
            >
              Delete
            </button>
            <button
              onClick={handleDeleteCancel}
              className="
                flex-shrink-0 px-2 py-1 rounded-md
                text-[11px] text-neutral-400
                hover:bg-neutral-800 hover:text-neutral-200 transition-colors
              "
              aria-label="Cancel delete"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-0.5 -ml-2">
            {/* Resume */}
            <ActionButton
              onClick={handleResume}
              disabled={isBusy || (workspace.isActive && !workspace.isPaused)}
              title={
                workspace.isActive && !workspace.isPaused
                  ? "Already active"
                  : "Resume — open all tabs in a new window"
              }
            >
              {resumeState === "loading" ? (
                <span className="animate-spin inline-block w-3 h-3 border border-neutral-500 border-t-neutral-300 rounded-full" aria-hidden />
              ) : (
                <Play size={11} strokeWidth={2.5} aria-hidden />
              )}
              {resumeState === "error" ? "Failed" : "Resume"}
            </ActionButton>

            {/* Pause */}
            <ActionButton
              onClick={handlePause}
              disabled={isBusy || workspace.isPaused || !workspace.isActive}
              title={
                workspace.isPaused
                  ? "Already paused"
                  : !workspace.isActive
                  ? "Not currently active"
                  : "Pause — hibernate tabs to free RAM"
              }
            >
              {pauseState === "loading" ? (
                <span className="animate-spin inline-block w-3 h-3 border border-neutral-500 border-t-neutral-300 rounded-full" aria-hidden />
              ) : (
                <Pause size={11} strokeWidth={2.5} aria-hidden />
              )}
              {pauseState === "error" ? "Failed" : "Pause"}
            </ActionButton>

            {/* Spacer pushes delete to the right */}
            <span className="flex-1" />

            {/* Delete */}
            <ActionButton
              onClick={handleDeleteRequest}
              disabled={isBusy}
              title="Delete workspace"
              danger
            >
              {deleteState === "loading" ? (
                <span className="animate-spin inline-block w-3 h-3 border border-rose-700 border-t-rose-400 rounded-full" aria-hidden />
              ) : (
                <Trash2 size={11} strokeWidth={2} aria-hidden />
              )}
              {deleteState === "error" ? "Failed" : "Delete"}
            </ActionButton>
          </div>
        )}
      </div>
    </article>
  );
};

export default WorkspaceCard;
