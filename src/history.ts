/**
 * Undo/redo wrapper around {@link timelineReducer}. It keeps the same
 * `present` document shape so the rest of the app reads `history.present`
 * unchanged, while past/future stacks power Ctrl+Z / Ctrl+Shift+Z.
 *
 * Two behaviours keep the history useful instead of noisy:
 *  - Non-document actions (selection, zoom, async preview-cache paths) update
 *    `present` without creating an undo step or clearing the redo stack.
 *  - Continuous gestures (a timeline drag, a slider sweep) coalesce into one
 *    step: repeats of the same action+target replace the present in place.
 */
import { Action, createInitialState, timelineReducer } from "./timelineReducer";
import { TimelineState } from "./types";

export type HistoryAction = Action | { type: "undo" } | { type: "redo" };

export interface History {
  past: TimelineState[];
  present: TimelineState;
  future: TimelineState[];
  /** Coalescing key of the last committed step, or null. */
  lastTag: string | null;
}

const HISTORY_LIMIT = 100;

export function createInitialHistory(): History {
  return { past: [], present: createInitialState(), future: [], lastTag: null };
}

/** Actions that change `present` but should never become their own undo step. */
function isDocumentAction(action: Action): boolean {
  switch (action.type) {
    case "select":
    case "setPxPerSec":
    case "setAssetPreviewPath":
    case "setAssetThumbnail":
    case "clearAssetPreviewPaths":
      return false;
    default:
      return true;
  }
}

/** Coalescing key for continuous gestures, or null for discrete one-shot edits. */
function coalesceTag(action: Action): string | null {
  switch (action.type) {
    case "moveClip":
    case "trimClip":
    case "setClipVolume":
    case "setClipTransform":
    case "setClipEffects":
    case "setClipTransitions":
      return `${action.type}:${action.id}`;
    case "setTrackVolume":
      return `${action.type}:${action.id}`;
    default:
      return null;
  }
}

export function historyReducer(history: History, action: HistoryAction): History {
  if (action.type === "undo") {
    if (history.past.length === 0) return history;
    const present = history.past[history.past.length - 1];
    return {
      past: history.past.slice(0, -1),
      present,
      future: [history.present, ...history.future],
      lastTag: null,
    };
  }
  if (action.type === "redo") {
    if (history.future.length === 0) return history;
    const present = history.future[0];
    return {
      past: [...history.past, history.present],
      present,
      future: history.future.slice(1),
      lastTag: null,
    };
  }

  const present = timelineReducer(history.present, action);
  if (present === history.present) return history;

  // Loading/replacing the whole document starts a fresh history.
  if (action.type === "loadState") {
    return { past: [], present, future: [], lastTag: null };
  }

  // Selection/zoom/async cache updates: move forward without an undo step and
  // without wiping redo, and end any open coalescing window.
  if (!isDocumentAction(action)) {
    return { ...history, present, lastTag: null };
  }

  const tag = coalesceTag(action);
  if (tag !== null && tag === history.lastTag && history.past.length > 0) {
    // Continuation of the same gesture: replace the present, keep the step.
    return { ...history, present, future: [], lastTag: tag };
  }

  const past = [...history.past, history.present].slice(-HISTORY_LIMIT);
  return { past, present, future: [], lastTag: tag };
}
