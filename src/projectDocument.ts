import type { ExportProject } from "./api";
import type { ExportOptions } from "./exportSettings";
import { clipsOnTrack } from "./timeline";
import {
  Clip,
  DEFAULT_CLIP_EFFECTS,
  DEFAULT_CLIP_TRANSITIONS,
  DEFAULT_CLIP_TRANSFORM,
  TimelineState,
} from "./types";

const PROJECT_VERSION = 1;

export function serializeProject(state: TimelineState): string {
  const doc = {
    version: PROJECT_VERSION,
    state: {
      ...state,
      selectedClipId: null,
      assets: state.assets.map((a) => ({ ...a, thumbnailUrl: null })),
    },
  };
  return JSON.stringify(doc, null, 2);
}

export function projectContentSignature(state: TimelineState): string {
  return JSON.stringify({
    version: PROJECT_VERSION,
    state: {
      ...state,
      selectedClipId: null,
      pxPerSec: 0,
      assets: state.assets.map((asset) => ({
        ...asset,
        previewPath: null,
        thumbnailUrl: null,
      })),
    },
  });
}

/** Flattens the timeline model into the render-ready export payload. */
export function buildExportProject(
  state: TimelineState,
  output: string,
  opts: ExportOptions,
): ExportProject {
  const payload = (c: Clip) => {
    const asset = state.assets.find((a) => a.id === c.assetId);
    return {
      path: asset?.path ?? "",
      start: c.start,
      in: c.in,
      out: c.out,
      volume: c.volume,
      muted: c.muted,
      transform: { ...DEFAULT_CLIP_TRANSFORM, ...(c.transform ?? {}) },
      effects: { ...DEFAULT_CLIP_EFFECTS, ...(c.effects ?? {}) },
      transitions: { ...DEFAULT_CLIP_TRANSITIONS, ...(c.transitions ?? {}) },
    };
  };

  const videoDisplay = state.tracks.filter((tr) => tr.kind === "video");
  const videoTracks = [...videoDisplay]
    .reverse()
    .map((tr) => ({ clips: clipsOnTrack(state.clips, tr.id).map(payload) }))
    .filter((tr) => tr.clips.length > 0);

  const audioTracks = state.tracks
    .filter((tr) => tr.kind === "audio")
    .map((tr) => ({
      volume: tr.volume,
      muted: tr.muted,
      clips: clipsOnTrack(state.clips, tr.id).map(payload),
    }))
    .filter((tr) => tr.clips.length > 0);

  return {
    output,
    width: opts.width,
    height: opts.height,
    fps: state.settings.fps,
    encoder: opts.encoder,
    rateControl: opts.rateControl,
    crf: opts.crf,
    videoBitrateKbps: opts.videoBitrateKbps,
    audioBitrateKbps: opts.audioBitrateKbps,
    preset: opts.preset,
    videoTracks,
    audioTracks,
  };
}
