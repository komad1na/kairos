import { describe, it, expect } from "vitest";
import {
  activeClipAt,
  effectiveGain,
  placeClip,
  snapTime,
  sourceTimeAt,
  timelineDuration,
  topVideoClipAt,
} from "./timeline";
import {
  Clip,
  DEFAULT_CLIP_EFFECTS,
  DEFAULT_CLIP_TRANSITIONS,
  DEFAULT_CLIP_TRANSFORM,
  Track,
  TimelineState,
} from "./types";

function clip(partial: Partial<Clip> & Pick<Clip, "id" | "trackId" | "start">): Clip {
  return {
    assetId: "a",
    in: 0,
    out: 5,
    volume: 1,
    muted: false,
    transform: { ...DEFAULT_CLIP_TRANSFORM },
    effects: { ...DEFAULT_CLIP_EFFECTS },
    transitions: { ...DEFAULT_CLIP_TRANSITIONS },
    linkId: null,
    ...partial,
  };
}

function track(partial: Partial<Track> & Pick<Track, "id" | "kind">): Track {
  return { name: "T", volume: 1, muted: false, ...partial };
}

describe("activeClipAt", () => {
  it("returns the clip covering t and null in a gap", () => {
    const clips = [clip({ id: "c1", trackId: "v1", start: 0, in: 0, out: 5 })];
    expect(activeClipAt(clips, "v1", 2)?.id).toBe("c1");
    expect(activeClipAt(clips, "v1", 5)).toBeNull(); // end is exclusive
    expect(activeClipAt(clips, "v1", 8)).toBeNull();
  });
});

describe("topVideoClipAt", () => {
  it("the topmost (first) video track with content wins", () => {
    const state: TimelineState = {
      settings: { width: 1920, height: 1080, fps: 30 },
      assets: [],
      tracks: [track({ id: "v1", kind: "video" }), track({ id: "v2", kind: "video" })],
      clips: [
        clip({ id: "low", trackId: "v2", start: 0, in: 0, out: 5 }),
        clip({ id: "top", trackId: "v1", start: 0, in: 0, out: 5 }),
      ],
      links: [],
      selectedClipId: null,
      pxPerSec: 80,
    };
    expect(topVideoClipAt(state, 2)?.id).toBe("top");
  });
});

describe("sourceTimeAt", () => {
  it("maps timeline time to source time using in-point and start", () => {
    const c = clip({ id: "c", trackId: "v1", start: 10, in: 3, out: 8 });
    expect(sourceTimeAt(c, 12)).toBe(5); // 3 + (12 - 10)
  });
});

describe("effectiveGain", () => {
  const c = clip({ id: "c", trackId: "a1", start: 0, volume: 1.5 });
  it("multiplies clip and track volume, clamped to 2", () => {
    expect(effectiveGain(c, track({ id: "a1", kind: "audio", volume: 1 }))).toBeCloseTo(1.5);
    expect(effectiveGain(c, track({ id: "a1", kind: "audio", volume: 2 }))).toBe(2);
  });
  it("is 0 when the clip or the track is muted", () => {
    expect(effectiveGain({ ...c, muted: true }, track({ id: "a1", kind: "audio" }))).toBe(0);
    expect(effectiveGain(c, track({ id: "a1", kind: "audio", muted: true }))).toBe(0);
  });
});

describe("timelineDuration", () => {
  it("is the farthest clip end across tracks", () => {
    const clips = [
      clip({ id: "c1", trackId: "v1", start: 0, in: 0, out: 4 }),
      clip({ id: "c2", trackId: "a1", start: 10, in: 0, out: 5 }),
    ];
    expect(timelineDuration(clips)).toBe(15);
  });
});

describe("placeClip", () => {
  it("keeps a free start and pushes past collisions", () => {
    const clips = [clip({ id: "c1", trackId: "v1", start: 0, in: 0, out: 5 })];
    expect(placeClip(clips, "v1", 6, 2)).toBe(6); // free
    expect(placeClip(clips, "v1", 2, 2)).toBe(5); // overlaps c1 → after it
    expect(placeClip(clips, "v1", 2, 2, "c1")).toBe(2); // ignore self
  });
});

describe("snapTime", () => {
  const anchors = [0, 5, 10];
  it("snaps to the nearest anchor within threshold", () => {
    expect(snapTime(5.05, anchors, 0.2, false)).toBe(5);
    expect(snapTime(7, anchors, 0.2, false)).toBe(7); // nothing close
    expect(snapTime(5.05, anchors, 0.2, true)).toBe(5.05); // disabled
  });
});
