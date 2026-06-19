/**
 * Pure reducer for the editor document (constitution: pure logic is tested
 * logic — see `timelineReducer.test.ts`). All mutations of tracks/clips/links
 * go through here so the model stays consistent and the single source of truth.
 */
import {
  Asset,
  Clip,
  ClipEffects,
  ClipTransitions,
  ClipTransitionStyle,
  ClipTransform,
  CLIP_TRANSITION_STYLES,
  DEFAULT_CLIP_EFFECTS,
  DEFAULT_CLIP_TRANSITIONS,
  DEFAULT_CLIP_TRANSFORM,
  Link,
  ProjectSettings,
  Track,
  TimelineState,
  TrackKind,
  clipEnd,
  clipLength,
} from "./types";
import { clamp, placeClip, placePair } from "./timeline";

const MIN_CLIP_LEN = 0.1;
const MIN_PX_PER_SEC = 10;
const DEFAULT_PX_PER_SEC = 50;
const MAX_PX_PER_SEC = 300;
const MIN_CLIP_SCALE = 0.05;
const MAX_CLIP_SCALE = 20;
const MIN_ROTATION = -360;
const MAX_ROTATION = 360;
const MIN_EFFECT_MULTIPLIER = 0;
const MAX_EFFECT_MULTIPLIER = 2;
const MIN_EFFECT_AMOUNT = 0;
const MAX_EFFECT_AMOUNT = 1;
const MAX_BLUR = 40;
const MIN_HUE = -180;
const MAX_HUE = 180;
const MAX_TRANSITION_SECONDS = 30;

const uid = (): string => crypto.randomUUID();

export function createInitialState(): TimelineState {
  return {
    settings: { width: 1920, height: 1080, fps: 30 },
    assets: [],
    tracks: [
      { id: uid(), kind: "video", name: "V1", volume: 1, muted: false },
      { id: uid(), kind: "audio", name: "A1", volume: 1, muted: false },
    ],
    clips: [],
    links: [],
    selectedClipId: null,
    pxPerSec: DEFAULT_PX_PER_SEC,
  };
}

export type Action =
  | { type: "addAsset"; asset: Asset }
  | { type: "deleteAsset"; assetId: string }
  | { type: "setAssetPreviewPath"; assetId: string; previewPath: string | null }
  | { type: "setAssetThumbnail"; assetId: string; thumbnailUrl: string }
  | { type: "clearAssetPreviewPaths" }
  | { type: "dropAsset"; asset: Asset; trackId: string; start: number }
  | { type: "moveClip"; id: string; trackId: string; start: number }
  | { type: "trimClip"; id: string; edge: "in" | "out"; value: number }
  | { type: "splitClip"; id: string; time: number }
  | { type: "deleteClip"; id: string }
  | { type: "addTrack"; kind: TrackKind }
  | { type: "removeTrack"; id: string }
  | { type: "setClipVolume"; id: string; volume: number }
  | { type: "setClipMuted"; id: string; muted: boolean }
  | { type: "setClipTransform"; id: string; transform: Partial<ClipTransform> }
  | { type: "resetClipTransform"; id: string }
  | { type: "setClipEffects"; id: string; effects: Partial<ClipEffects> }
  | { type: "resetClipEffects"; id: string }
  | { type: "setClipTransitions"; id: string; transitions: Partial<ClipTransitions> }
  | { type: "resetClipTransitions"; id: string }
  | { type: "setTrackVolume"; id: string; volume: number }
  | { type: "setTrackMuted"; id: string; muted: boolean }
  | { type: "unlink"; linkId: string }
  | { type: "linkClips"; firstId: string; secondId: string }
  | { type: "select"; id: string | null }
  | { type: "setPxPerSec"; value: number }
  | { type: "setProjectSettings"; settings: ProjectSettings }
  | { type: "loadState"; state: TimelineState };

const trackById = (s: TimelineState, id: string): Track | undefined =>
  s.tracks.find((t) => t.id === id);
const clipById = (s: TimelineState, id: string): Clip | undefined =>
  s.clips.find((c) => c.id === id);
const firstOfKind = (s: TimelineState, kind: TrackKind): Track | undefined =>
  s.tracks.find((t) => t.kind === kind);
const assetById = (s: TimelineState, id: string): Asset | undefined =>
  s.assets.find((a) => a.id === id);

/** The partner clip of a linked clip, or null. */
function partnerOf(s: TimelineState, clip: Clip): Clip | null {
  if (!clip.linkId) return null;
  const link = s.links.find((l) => l.id === clip.linkId);
  if (!link) return null;
  const otherId = link.clipIds.find((id) => id !== clip.id);
  return otherId ? clipById(s, otherId) ?? null : null;
}

function newClip(assetId: string, trackId: string, start: number, length: number): Clip {
  return {
    id: uid(),
    assetId,
    trackId,
    start,
    in: 0,
    out: length,
    volume: 1,
    muted: false,
    transform: { ...DEFAULT_CLIP_TRANSFORM },
    effects: { ...DEFAULT_CLIP_EFFECTS },
    transitions: { ...DEFAULT_CLIP_TRANSITIONS },
    linkId: null,
  };
}

export function timelineReducer(state: TimelineState, action: Action): TimelineState {
  switch (action.type) {
    case "addAsset":
      return { ...state, assets: [...state.assets, action.asset] };

    case "deleteAsset":
      return deleteAsset(state, action.assetId);

    case "setAssetPreviewPath":
      return {
        ...state,
        assets: state.assets.map((a) =>
          a.id === action.assetId ? { ...a, previewPath: action.previewPath } : a,
        ),
      };

    case "setAssetThumbnail":
      return {
        ...state,
        assets: state.assets.map((a) =>
          a.id === action.assetId ? { ...a, thumbnailUrl: action.thumbnailUrl } : a,
        ),
      };

    case "clearAssetPreviewPaths":
      return {
        ...state,
        assets: state.assets.map((a) => ({ ...a, previewPath: null })),
      };

    case "dropAsset":
      return dropAsset(state, action.asset, action.trackId, action.start);

    case "moveClip":
      return moveClip(state, action.id, action.trackId, action.start);

    case "trimClip":
      return trimClip(state, action.id, action.edge, action.value);

    case "splitClip":
      return splitClip(state, action.id, action.time);

    case "deleteClip":
      return deleteClips(state, [action.id]);

    case "addTrack":
      return addTrack(state, action.kind);

    case "removeTrack":
      return removeTrack(state, action.id);

    case "setClipVolume":
      return {
        ...state,
        clips: state.clips.map((c) =>
          c.id === action.id ? { ...c, volume: clamp(action.volume, 0, 2) } : c,
        ),
      };

    case "setClipMuted":
      return {
        ...state,
        clips: state.clips.map((c) =>
          c.id === action.id ? { ...c, muted: action.muted } : c,
        ),
      };

    case "setClipTransform":
      return {
        ...state,
        clips: state.clips.map((c) =>
          c.id === action.id ? { ...c, transform: clipTransform(c, action.transform) } : c,
        ),
      };

    case "resetClipTransform":
      return {
        ...state,
        clips: state.clips.map((c) =>
          c.id === action.id ? { ...c, transform: { ...DEFAULT_CLIP_TRANSFORM } } : c,
        ),
      };

    case "setClipEffects":
      return {
        ...state,
        clips: state.clips.map((c) =>
          c.id === action.id ? { ...c, effects: clipEffects(c, action.effects) } : c,
        ),
      };

    case "resetClipEffects":
      return {
        ...state,
        clips: state.clips.map((c) =>
          c.id === action.id ? { ...c, effects: { ...DEFAULT_CLIP_EFFECTS } } : c,
        ),
      };

    case "setClipTransitions":
      {
        const target = clipById(state, action.id);
        const linkedIds = target?.linkId
          ? state.links.find((link) => link.id === target.linkId)?.clipIds ?? [action.id]
          : [action.id];
        return {
          ...state,
          clips: state.clips.map((c) =>
            linkedIds.includes(c.id)
              ? { ...c, transitions: clipTransitions(c, action.transitions) }
              : c,
          ),
        };
      }

    case "resetClipTransitions":
      {
        const target = clipById(state, action.id);
        const linkedIds = target?.linkId
          ? state.links.find((link) => link.id === target.linkId)?.clipIds ?? [action.id]
          : [action.id];
        return {
          ...state,
          clips: state.clips.map((c) =>
            linkedIds.includes(c.id)
              ? { ...c, transitions: { ...DEFAULT_CLIP_TRANSITIONS } }
              : c,
          ),
        };
      }

    case "setTrackVolume":
      return {
        ...state,
        tracks: state.tracks.map((t) =>
          t.id === action.id ? { ...t, volume: clamp(action.volume, 0, 2) } : t,
        ),
      };

    case "setTrackMuted":
      return {
        ...state,
        tracks: state.tracks.map((t) =>
          t.id === action.id ? { ...t, muted: action.muted } : t,
        ),
      };

    case "unlink":
      return {
        ...state,
        links: state.links.filter((l) => l.id !== action.linkId),
        clips: state.clips.map((c) =>
          c.linkId === action.linkId ? { ...c, linkId: null } : c,
        ),
      };

    case "linkClips":
      return linkClips(state, action.firstId, action.secondId);

    case "select":
      return { ...state, selectedClipId: action.id };

    case "setPxPerSec":
      return { ...state, pxPerSec: clamp(action.value, MIN_PX_PER_SEC, MAX_PX_PER_SEC) };

    case "setProjectSettings":
      return { ...state, settings: action.settings };

    case "loadState":
      return normalizeState(action.state);
  }
}

export function normalizeState(state: TimelineState): TimelineState {
  return {
    ...state,
    pxPerSec: clamp(state.pxPerSec ?? DEFAULT_PX_PER_SEC, MIN_PX_PER_SEC, MAX_PX_PER_SEC),
    clips: state.clips.map((c) => ({
      ...c,
      transform: clipTransform(c),
      effects: clipEffects(c),
      transitions: clipTransitions(c),
    })),
  };
}

function clipTransform(clip: Clip, patch: Partial<ClipTransform> = {}): ClipTransform {
  const current = clip.transform ?? DEFAULT_CLIP_TRANSFORM;
  return sanitizeTransform({ ...DEFAULT_CLIP_TRANSFORM, ...current, ...patch });
}

function sanitizeTransform(transform: ClipTransform): ClipTransform {
  return {
    x: finiteOr(transform.x, 0),
    y: finiteOr(transform.y, 0),
    scale: clamp(finiteOr(transform.scale, 1), MIN_CLIP_SCALE, MAX_CLIP_SCALE),
    rotation: clamp(finiteOr(transform.rotation, 0), MIN_ROTATION, MAX_ROTATION),
  };
}

function clipEffects(clip: Clip, patch: Partial<ClipEffects> = {}): ClipEffects {
  const current = clip.effects ?? DEFAULT_CLIP_EFFECTS;
  return sanitizeEffects({ ...DEFAULT_CLIP_EFFECTS, ...current, ...patch });
}

function sanitizeEffects(effects: ClipEffects): ClipEffects {
  return {
    opacity: clamp(finiteOr(effects.opacity, 1), 0, 1),
    blur: clamp(finiteOr(effects.blur, 0), 0, MAX_BLUR),
    brightness: clamp(finiteOr(effects.brightness, 1), MIN_EFFECT_MULTIPLIER, MAX_EFFECT_MULTIPLIER),
    contrast: clamp(finiteOr(effects.contrast, 1), MIN_EFFECT_MULTIPLIER, MAX_EFFECT_MULTIPLIER),
    saturation: clamp(finiteOr(effects.saturation, 1), MIN_EFFECT_MULTIPLIER, MAX_EFFECT_MULTIPLIER),
    hue: clamp(finiteOr(effects.hue, 0), MIN_HUE, MAX_HUE),
    grayscale: clamp(finiteOr(effects.grayscale, 0), MIN_EFFECT_AMOUNT, MAX_EFFECT_AMOUNT),
    sepia: clamp(finiteOr(effects.sepia, 0), MIN_EFFECT_AMOUNT, MAX_EFFECT_AMOUNT),
    invert: clamp(finiteOr(effects.invert, 0), MIN_EFFECT_AMOUNT, MAX_EFFECT_AMOUNT),
  };
}

function clipTransitions(
  clip: Clip,
  patch: Partial<ClipTransitions> = {},
): ClipTransitions {
  const current = clip.transitions ?? DEFAULT_CLIP_TRANSITIONS;
  return sanitizeTransitions({ ...DEFAULT_CLIP_TRANSITIONS, ...current, ...patch });
}

function sanitizeTransitions(transitions: ClipTransitions): ClipTransitions {
  return {
    fadeIn: clamp(finiteOr(transitions.fadeIn, 0), 0, MAX_TRANSITION_SECONDS),
    fadeOut: clamp(finiteOr(transitions.fadeOut, 0), 0, MAX_TRANSITION_SECONDS),
    inStyle: sanitizeTransitionStyle(transitions.inStyle),
    outStyle: sanitizeTransitionStyle(transitions.outStyle),
  };
}

function sanitizeTransitionStyle(style: unknown): ClipTransitionStyle {
  return CLIP_TRANSITION_STYLES.includes(style as ClipTransitionStyle)
    ? (style as ClipTransitionStyle)
    : DEFAULT_CLIP_TRANSITIONS.inStyle;
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function linkClips(state: TimelineState, firstId: string, secondId: string): TimelineState {
  if (firstId === secondId) return state;
  const first = clipById(state, firstId);
  const second = clipById(state, secondId);
  if (!first || !second) return state;
  if (first.linkId || second.linkId) return state;

  const firstKind = trackById(state, first.trackId)?.kind;
  const secondKind = trackById(state, second.trackId)?.kind;
  if (!firstKind || !secondKind || firstKind === secondKind) return state;

  const linkId = uid();
  const clipIds: [string, string] =
    firstKind === "video" ? [first.id, second.id] : [second.id, first.id];

  return {
    ...state,
    links: [...state.links, { id: linkId, clipIds }],
    clips: state.clips.map((clip) =>
      clip.id === first.id || clip.id === second.id ? { ...clip, linkId } : clip,
    ),
  };
}

/**
 * Create clip(s) from an asset dropped onto a track. Audio-only → one audio
 * clip; video-only → one video clip; both → a linked video+audio pair on
 * separate tracks (FR-031/034). Incompatible single-kind drops are rejected.
 */
function dropAsset(
  state: TimelineState,
  asset: Asset,
  trackId: string,
  start: number,
): TimelineState {
  const target = trackById(state, trackId);
  if (!target) return state;
  const length = asset.duration;

  // Single-kind sources must land on a matching track (FR-013).
  if (asset.kind === "audio" || asset.kind === "video") {
    const wantKind: TrackKind = asset.kind;
    if (target.kind !== wantKind) return state; // reject incompatible drop
    const at = placeClip(state.clips, trackId, start, length);
    const clip = newClip(asset.id, trackId, at, length);
    return { ...state, clips: [...state.clips, clip], selectedClipId: clip.id };
  }

  // Both: build a linked pair on a video track + an audio track.
  let s = state;
  const videoTrack = target.kind === "video" ? target : firstOfKind(s, "video");
  let audioTrack = target.kind === "audio" ? target : firstOfKind(s, "audio");
  if (!videoTrack) return state;
  if (!audioTrack) {
    // Ensure an audio track exists so the audio is not dropped (FR-034).
    s = addTrack(s, "audio");
    audioTrack = s.tracks.find((t) => t.kind === "audio")!;
  }

  // Find a single start where BOTH the video and audio clip fit, so a linked
  // pair never lands on top of an existing clip on either lane (FR-015).
  const at = placePair(
    s.clips,
    videoTrack.id,
    audioTrack.id,
    Math.max(0, start),
    length,
    length,
  );
  const linkId = uid();
  const vClip: Clip = { ...newClip(asset.id, videoTrack.id, at, length), linkId };
  const aClip: Clip = { ...newClip(asset.id, audioTrack.id, at, length), linkId };
  const link: Link = { id: linkId, clipIds: [vClip.id, aClip.id] };
  return {
    ...s,
    clips: [...s.clips, vClip, aClip],
    links: [...s.links, link],
    selectedClipId: vClip.id,
  };
}

/** Move a clip (and its linked partner, kept time-aligned — FR-032). */
function moveClip(
  state: TimelineState,
  id: string,
  trackId: string,
  start: number,
): TimelineState {
  const clip = clipById(state, id);
  if (!clip) return state;
  const clipKind = trackById(state, clip.trackId)?.kind;
  const requested = trackById(state, trackId);
  // Only move across tracks of the same kind (FR-013); else keep the track.
  const finalTrackId =
    requested && requested.kind === clipKind ? trackId : clip.trackId;
  const partner = partnerOf(state, clip);

  // A linked pair stays time-aligned, so it must land where BOTH lanes are free;
  // otherwise the partner could be pushed on top of another clip (FR-032/FR-015).
  const newStart = partner
    ? placePair(
        state.clips,
        finalTrackId,
        partner.trackId,
        Math.max(0, start),
        clipLength(clip),
        clipLength(partner),
        clip.id,
        partner.id,
      )
    : placeClip(state.clips, finalTrackId, start, clipLength(clip), clip.id);
  const delta = newStart - clip.start;
  return {
    ...state,
    clips: state.clips.map((c) => {
      if (c.id === clip.id) return { ...c, trackId: finalTrackId, start: newStart };
      if (partner && c.id === partner.id) return { ...c, start: c.start + delta };
      return c;
    }),
  };
}

/** Trim a clip edge (and its linked partner — FR-032), respecting source bounds. */
function trimClip(
  state: TimelineState,
  id: string,
  edge: "in" | "out",
  value: number,
): TimelineState {
  const clip = clipById(state, id);
  if (!clip) return state;
  const asset = assetById(state, clip.assetId);
  const sourceDuration = asset ? asset.duration : clip.out;
  const partner = partnerOf(state, clip);

  let nextIn = clip.in;
  let nextOut = clip.out;
  let nextStart = clip.start;
  if (edge === "in") {
    nextIn = clamp(value, 0, clip.out - MIN_CLIP_LEN);
    nextStart = clip.start + (nextIn - clip.in); // keep right edge fixed
  } else {
    nextOut = clamp(value, clip.in + MIN_CLIP_LEN, sourceDuration);
  }
  const dIn = nextIn - clip.in;
  const dOut = nextOut - clip.out;
  const dStart = nextStart - clip.start;

  return {
    ...state,
    clips: state.clips.map((c) => {
      if (c.id === clip.id) return { ...c, in: nextIn, out: nextOut, start: nextStart };
      if (partner && c.id === partner.id) {
        return { ...c, in: c.in + dIn, out: c.out + dOut, start: c.start + dStart };
      }
      return c;
    }),
  };
}

/**
 * Cut a clip in two at timeline time `time` (the razor tool). The left half keeps
 * the original id (and any in-edge transition); the right half is new (and keeps
 * the out-edge transition). A linked pair is cut on both lanes and each side is
 * re-linked so the halves still move together (FR-032).
 */
function splitClip(state: TimelineState, id: string, time: number): TimelineState {
  const clip = clipById(state, id);
  if (!clip) return state;
  const partner = partnerOf(state, clip);
  const group = partner ? [clip, partner] : [clip];

  // Both sides of every clip in the group must stay at least MIN_CLIP_LEN long.
  for (const c of group) {
    if (time <= c.start + MIN_CLIP_LEN || time >= clipEnd(c) - MIN_CLIP_LEN) {
      return state;
    }
  }

  const groupIds = new Set(group.map((c) => c.id));
  const leftHalves: Clip[] = [];
  const rightHalves: Clip[] = [];

  const clips = state.clips.flatMap((c) => {
    if (!groupIds.has(c.id)) return [c];
    const splitSource = c.in + (time - c.start);
    const left: Clip = {
      ...c,
      out: splitSource,
      transitions: { ...c.transitions, fadeOut: 0, outStyle: DEFAULT_CLIP_TRANSITIONS.outStyle },
      linkId: null,
    };
    const right: Clip = {
      ...c,
      id: uid(),
      start: time,
      in: splitSource,
      transitions: { ...c.transitions, fadeIn: 0, inStyle: DEFAULT_CLIP_TRANSITIONS.inStyle },
      linkId: null,
    };
    leftHalves.push(left);
    rightHalves.push(right);
    return [left, right];
  });

  let links = state.links;
  if (partner && clip.linkId) {
    links = links.filter((l) => l.id !== clip.linkId);
    const relink = (halves: Clip[]): Link | null => {
      const v = halves.find((c) => trackById(state, c.trackId)?.kind === "video");
      const a = halves.find((c) => trackById(state, c.trackId)?.kind === "audio");
      if (!v || !a) return null;
      const linkId = uid();
      v.linkId = linkId;
      a.linkId = linkId;
      return { id: linkId, clipIds: [v.id, a.id] };
    };
    const left = relink(leftHalves);
    const right = relink(rightHalves);
    links = [...links, ...(left ? [left] : []), ...(right ? [right] : [])];
  }

  return { ...state, clips, links, selectedClipId: clip.id };
}

/** Delete the given clips plus any linked partners and their links. */
function deleteClips(state: TimelineState, ids: string[]): TimelineState {
  const toDelete = new Set<string>(ids);
  for (const id of ids) {
    const clip = clipById(state, id);
    const partner = clip ? partnerOf(state, clip) : null;
    if (partner) toDelete.add(partner.id);
  }
  const removedLinkIds = new Set(
    state.clips.filter((c) => toDelete.has(c.id) && c.linkId).map((c) => c.linkId!),
  );
  return {
    ...state,
    clips: state.clips.filter((c) => !toDelete.has(c.id)),
    links: state.links.filter((l) => !removedLinkIds.has(l.id)),
    selectedClipId:
      state.selectedClipId && toDelete.has(state.selectedClipId)
        ? null
        : state.selectedClipId,
  };
}

/** Remove a media-library asset from the project and delete every clip that uses it. */
function deleteAsset(state: TimelineState, assetId: string): TimelineState {
  const clipIds = state.clips.filter((c) => c.assetId === assetId).map((c) => c.id);
  const afterClips = deleteClips(state, clipIds);
  return {
    ...afterClips,
    assets: afterClips.assets.filter((a) => a.id !== assetId),
  };
}

/** Add a track. Video tracks are kept above audio tracks in display order. */
function addTrack(state: TimelineState, kind: TrackKind): TimelineState {
  const count = state.tracks.filter((t) => t.kind === kind).length + 1;
  const track: Track = {
    id: uid(),
    kind,
    name: `${kind === "video" ? "V" : "A"}${count}`,
    volume: 1,
    muted: false,
  };
  if (kind === "audio") {
    return { ...state, tracks: [...state.tracks, track] };
  }
  // Insert the new video track at the end of the video group (just above audio).
  const firstAudio = state.tracks.findIndex((t) => t.kind === "audio");
  const at = firstAudio === -1 ? state.tracks.length : firstAudio;
  const tracks = [...state.tracks.slice(0, at), track, ...state.tracks.slice(at)];
  return { ...state, tracks };
}

/** Remove a track and the clips it contains (plus linked partners). */
function removeTrack(state: TimelineState, id: string): TimelineState {
  const clipIds = state.clips.filter((c) => c.trackId === id).map((c) => c.id);
  const afterClips = deleteClips(state, clipIds);
  return { ...afterClips, tracks: afterClips.tracks.filter((t) => t.id !== id) };
}
