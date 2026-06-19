/**
 * Shared data shapes for the editor. This is the single source of truth from
 * which BOTH the realtime preview and the export render are derived
 * (constitution: non-destructive, single-source-of-truth timeline).
 *
 * Times are in seconds. Volume is a linear factor: 1.0 = 100%, range 0.0–2.0.
 */

export type TrackKind = "video" | "audio";
export type MediaKind = "video" | "audio" | "both";

/** Media file metadata — mirrors the Rust `VideoInfo` struct. */
export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
  fps: number;
  videoCodec: string | null;
  audioCodec: string | null;
  hasVideo: boolean;
  hasAudio: boolean;
}

/** An imported source file in the media library. Reused by many clips; never modified. */
export interface Asset {
  id: string;
  /** Absolute source path on disk (read-only). */
  path: string;
  /** Editor-friendly local media generated for realtime preview, or null. */
  previewPath?: string | null;
  /** File name shown in the library. */
  name: string;
  kind: MediaKind;
  duration: number;
  width: number;
  height: number;
  fps: number;
  videoCodec: string | null;
  audioCodec: string | null;
  hasAudio: boolean;
  /** Whether the webview can decode this for preview (else: warn, don't fail). */
  previewable: boolean;
  /** Cached thumbnail object URL (video/both), or null. */
  thumbnailUrl: string | null;
}

/** A horizontal lane holding clips of a single kind. */
export interface Track {
  id: string;
  kind: TrackKind;
  /** e.g. "V1", "A2". */
  name: string;
  /** Track volume 0.0–2.0 (audio tracks; ignored for video). */
  volume: number;
  muted: boolean;
}

/** Visual transform for a clip inside the project canvas. x/y are project pixels. */
export interface ClipTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export const DEFAULT_CLIP_TRANSFORM: ClipTransform = {
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
};

/** Lightweight visual effects for video clips. Multipliers use 1 as neutral. */
export interface ClipEffects {
  opacity: number;
  blur: number;
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  grayscale: number;
  sepia: number;
  invert: number;
}

export const DEFAULT_CLIP_EFFECTS: ClipEffects = {
  opacity: 1,
  blur: 0,
  brightness: 1,
  contrast: 1,
  saturation: 1,
  hue: 0,
  grayscale: 0,
  sepia: 0,
  invert: 0,
};

export type ClipTransitionStyle =
  | "fade"
  | "dipBlack"
  | "dipWhite"
  | "slideLeft"
  | "slideRight"
  | "slideUp"
  | "slideDown";

export const CLIP_TRANSITION_STYLES: ClipTransitionStyle[] = [
  "fade",
  "dipBlack",
  "dipWhite",
  "slideLeft",
  "slideRight",
  "slideUp",
  "slideDown",
];

/** Basic per-clip transitions. Durations are seconds from clip edges. */
export interface ClipTransitions {
  fadeIn: number;
  fadeOut: number;
  inStyle: ClipTransitionStyle;
  outStyle: ClipTransitionStyle;
}

export const DEFAULT_CLIP_TRANSITIONS: ClipTransitions = {
  fadeIn: 0,
  fadeOut: 0,
  inStyle: "fade",
  outStyle: "fade",
};

/** An instance of an Asset placed on a Track. Non-destructive. */
export interface Clip {
  id: string;
  assetId: string;
  trackId: string;
  /** Timeline position of the clip's left edge (s). */
  start: number;
  /** Source in-point (s). */
  in: number;
  /** Source out-point (s). */
  out: number;
  /** Clip volume 0.0–2.0. */
  volume: number;
  muted: boolean;
  /** Visual transform for video clips; ignored by audio-only render paths. */
  transform: ClipTransform;
  /** Lightweight visual effects for video clips; ignored by audio-only render paths. */
  effects: ClipEffects;
  /** Basic per-clip transitions used by preview and export. */
  transitions: ClipTransitions;
  /** Link group id, or null when independent. */
  linkId: string | null;
}

/** Associates a video clip with an audio clip from the same both-kind source. */
export interface Link {
  id: string;
  clipIds: [string, string];
}

/** Project-wide settings: the canvas every clip is composited into. */
export interface ProjectSettings {
  width: number;
  height: number;
  fps: number;
}

/** The whole editor document for the session. */
export interface TimelineState {
  /** Output/preview canvas the clips are displayed and rendered into. */
  settings: ProjectSettings;
  assets: Asset[];
  /** Visual top-to-bottom order. Invariant: video tracks precede audio tracks. */
  tracks: Track[];
  clips: Clip[];
  links: Link[];
  selectedClipId: string | null;
  /** Timeline zoom (pixels per second). */
  pxPerSec: number;
}

/** Runtime transport state driving the preview (not part of the document). */
export interface PlaybackState {
  playhead: number;
  playing: boolean;
}

/** Length of the clip on the timeline (after trimming). */
export const clipLength = (c: Clip): number => Math.max(0, c.out - c.in);

/** Timeline position of the clip's right edge. */
export const clipEnd = (c: Clip): number => c.start + clipLength(c);
