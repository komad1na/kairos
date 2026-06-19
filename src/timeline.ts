/**
 * Pure, dependency-free timeline logic (no React, no Tauri). This is where the
 * shared model is interpreted; it is unit-tested in `timeline.test.ts`
 * (constitution: pure logic is tested logic).
 */
import { Clip, Track, TimelineState, clipLength, clipEnd } from "./types";

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/** Clips on a track, sorted by start time. */
export function clipsOnTrack(clips: Clip[], trackId: string): Clip[] {
  return clips
    .filter((c) => c.trackId === trackId)
    .sort((a, b) => a.start - b.start);
}

/** The clip on `trackId` covering time `t`, or null (a gap). */
export function activeClipAt(clips: Clip[], trackId: string, t: number): Clip | null {
  for (const c of clips) {
    if (c.trackId !== trackId) continue;
    if (t >= c.start && t < clipEnd(c)) return c;
  }
  return null;
}

/**
 * The video clip that should be visible at time `t`. The topmost video track
 * (first video track in display order) with an active clip wins; lower video
 * tracks are occluded (no blending) — constitution / FR-024a.
 */
export function topVideoClipAt(state: TimelineState, t: number): Clip | null {
  for (const track of state.tracks) {
    if (track.kind !== "video") continue;
    const c = activeClipAt(state.clips, track.id, t);
    if (c) return c;
  }
  return null;
}

/** Source-file time corresponding to timeline time `t` within `clip`. */
export function sourceTimeAt(clip: Clip, t: number): number {
  return clip.in + (t - clip.start);
}

/** Audible gain for a clip: clip×track volume, 0 if either is muted, clamped 0–2. */
export function effectiveGain(clip: Clip, track: Track): number {
  if (clip.muted || track.muted) return 0;
  return clamp(clip.volume * track.volume, 0, 2);
}

/** Total timeline length = the farthest clip's right edge across all tracks. */
export function timelineDuration(clips: Clip[]): number {
  return clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0);
}

/**
 * Find a start time ≥ `desiredStart` on `trackId` where a clip of `length`
 * does not overlap any existing clip (FR-015). Pushes right past collisions.
 */
export function placeClip(
  clips: Clip[],
  trackId: string,
  desiredStart: number,
  length: number,
  ignoreId?: string,
): number {
  let start = Math.max(0, desiredStart);
  const others = clipsOnTrack(clips, trackId).filter((c) => c.id !== ignoreId);
  let moved = true;
  let guard = 0;
  while (moved && guard++ < 1000) {
    moved = false;
    for (const c of others) {
      if (start < clipEnd(c) && start + length > c.start) {
        start = clipEnd(c);
        moved = true;
      }
    }
  }
  return start;
}

/** Snap `candidate` to the nearest anchor within `threshold`; off when disabled (FR-015a). */
export function snapTime(
  candidate: number,
  anchors: number[],
  threshold: number,
  disabled: boolean,
): number {
  if (disabled) return candidate;
  let best = candidate;
  let bestD = threshold;
  for (const a of anchors) {
    const d = Math.abs(a - candidate);
    if (d <= bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}

/** Snap anchors: timeline start, playhead, and every other clip's edges. */
export function snapAnchors(
  state: TimelineState,
  playhead: number,
  excludeId?: string,
): number[] {
  const anchors = [0, playhead];
  for (const c of state.clips) {
    if (c.id === excludeId) continue;
    anchors.push(c.start, clipEnd(c));
  }
  return anchors;
}

/** Formats seconds as mm:ss.cs (centiseconds) for display. */
export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(m)}:${pad(s)}.${pad(cs)}`;
}

/** Color palette for clip blocks (visual distinction / fallback). */
const PALETTE = ["#4f8cff", "#ff7a59", "#2ec4b6", "#e84393", "#f6c453", "#9b6bff"];

export function colorForIndex(i: number): string {
  return PALETTE[i % PALETTE.length];
}

export { clipLength, clipEnd };
