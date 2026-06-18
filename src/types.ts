/** Video file metadata — mirrors the Rust `VideoInfo` struct. */
export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  has_audio: boolean;
}

/** A single clip on the timeline. Single track; clips are laid end to end. */
export interface Clip {
  /** Unique id (for React keys and selection). */
  id: string;
  /** Path to the source file. */
  path: string;
  /** File name — shown on the block. */
  name: string;
  /** Full source duration in seconds. */
  sourceDuration: number;
  /** Trim start (in-point) in seconds within the source. */
  in: number;
  /** Trim end (out-point) in seconds within the source. */
  out: number;
  /** Block color (for visual distinction). */
  color: string;
}

/** Length of the clip on the timeline (after trimming). */
export const clipLength = (c: Clip): number => Math.max(0, c.out - c.in);
