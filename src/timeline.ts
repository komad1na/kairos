import { Clip, clipLength } from "./types";

/** Total timeline duration (sum of all clips after trimming). */
export function totalDuration(clips: Clip[]): number {
  return clips.reduce((sum, c) => sum + clipLength(c), 0);
}

/** Where on the timeline (in seconds) the clip at the given index starts. */
export function clipStartOnTimeline(clips: Clip[], index: number): number {
  let acc = 0;
  for (let i = 0; i < index; i++) acc += clipLength(clips[i]);
  return acc;
}

export interface ResolvedPosition {
  clip: Clip;
  clipIndex: number;
  /** Time within the source file (seconds) matching the playhead. */
  sourceTime: number;
}

/**
 * Maps a playhead position on the timeline to a concrete clip and the time
 * within its source file. Returns null if the timeline is empty.
 */
export function resolveTime(clips: Clip[], t: number): ResolvedPosition | null {
  if (clips.length === 0) return null;
  let acc = 0;
  for (let i = 0; i < clips.length; i++) {
    const len = clipLength(clips[i]);
    if (t < acc + len || i === clips.length - 1) {
      const within = Math.min(Math.max(0, t - acc), len);
      return {
        clip: clips[i],
        clipIndex: i,
        sourceTime: clips[i].in + within,
      };
    }
    acc += len;
  }
  return null;
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

/** Color palette for clip blocks. */
const PALETTE = [
  "#4f8cff",
  "#ff7a59",
  "#2ec4b6",
  "#e84393",
  "#f6c453",
  "#9b6bff",
];

export function colorForIndex(i: number): string {
  return PALETTE[i % PALETTE.length];
}
