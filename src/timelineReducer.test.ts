import { describe, it, expect } from "vitest";
import { createInitialState, timelineReducer } from "./timelineReducer";
import { Asset, TimelineState } from "./types";

function asset(partial: Partial<Asset> & Pick<Asset, "id" | "kind">): Asset {
  return {
    path: `/src/${partial.id}.mp4`,
    name: `${partial.id}`,
    duration: 5,
    width: 1920,
    height: 1080,
    fps: 30,
    videoCodec: "h264",
    audioCodec: "aac",
    hasAudio: true,
    previewable: true,
    thumbnailUrl: null,
    ...partial,
  };
}

function withAsset(a: Asset): TimelineState {
  return timelineReducer({ ...createInitialState() }, { type: "addAsset", asset: a });
}

describe("initial state", () => {
  it("starts with one video and one audio track", () => {
    const s = createInitialState();
    expect(s.tracks.filter((t) => t.kind === "video")).toHaveLength(1);
    expect(s.tracks.filter((t) => t.kind === "audio")).toHaveLength(1);
  });
});

describe("dropAsset", () => {
  it("creates a linked video+audio pair for a both-kind source (FR-031)", () => {
    const a = asset({ id: "v", kind: "both" });
    let s = withAsset(a);
    const videoTrack = s.tracks.find((t) => t.kind === "video")!;
    s = timelineReducer(s, { type: "dropAsset", asset: a, trackId: videoTrack.id, start: 0 });
    expect(s.clips).toHaveLength(2);
    expect(s.links).toHaveLength(1);
    const [c1, c2] = s.clips;
    expect(c1.linkId).toBe(c2.linkId);
  });

  it("rejects an audio asset dropped on a video track (FR-013)", () => {
    const a = asset({ id: "m", kind: "audio" });
    let s = withAsset(a);
    const videoTrack = s.tracks.find((t) => t.kind === "video")!;
    s = timelineReducer(s, { type: "dropAsset", asset: a, trackId: videoTrack.id, start: 0 });
    expect(s.clips).toHaveLength(0);
  });
});

describe("linked move & trim move together (FR-032)", () => {
  function pair() {
    const a = asset({ id: "v", kind: "both" });
    let s = withAsset(a);
    const videoTrack = s.tracks.find((t) => t.kind === "video")!;
    s = timelineReducer(s, { type: "dropAsset", asset: a, trackId: videoTrack.id, start: 0 });
    return s;
  }
  it("moving one moves the partner by the same delta", () => {
    let s = pair();
    const v = s.clips[0];
    s = timelineReducer(s, { type: "moveClip", id: v.id, trackId: v.trackId, start: 3 });
    expect(s.clips[0].start).toBe(3);
    expect(s.clips[1].start).toBe(3);
  });
  it("unlink lets them move independently", () => {
    let s = pair();
    const linkId = s.clips[0].linkId!;
    s = timelineReducer(s, { type: "unlink", linkId });
    expect(s.links).toHaveLength(0);
    const v = s.clips[0];
    s = timelineReducer(s, { type: "moveClip", id: v.id, trackId: v.trackId, start: 2 });
    expect(s.clips[0].start).toBe(2);
    expect(s.clips[1].start).toBe(0); // partner unaffected
  });
  it("can manually link an unlinked video/audio pair again", () => {
    let s = pair();
    const [video, audio] = s.clips;
    s = timelineReducer(s, { type: "unlink", linkId: video.linkId! });
    s = timelineReducer(s, { type: "linkClips", firstId: video.id, secondId: audio.id });

    expect(s.links).toHaveLength(1);
    expect(s.clips[0].linkId).toBe(s.clips[1].linkId);

    s = timelineReducer(s, { type: "moveClip", id: video.id, trackId: video.trackId, start: 2 });
    expect(s.clips[0].start).toBe(2);
    expect(s.clips[1].start).toBe(2);
  });
});

describe("deleteClip removes a linked partner too", () => {
  it("deleting one clip of a pair removes both and the link", () => {
    const a = asset({ id: "v", kind: "both" });
    let s = withAsset(a);
    const videoTrack = s.tracks.find((t) => t.kind === "video")!;
    s = timelineReducer(s, { type: "dropAsset", asset: a, trackId: videoTrack.id, start: 0 });
    s = timelineReducer(s, { type: "deleteClip", id: s.clips[0].id });
    expect(s.clips).toHaveLength(0);
    expect(s.links).toHaveLength(0);
  });
});

describe("deleteAsset removes media from the project", () => {
  it("removes the asset, its timeline clips, and linked pairs", () => {
    const a = asset({ id: "v", kind: "both" });
    let s = withAsset(a);
    const videoTrack = s.tracks.find((t) => t.kind === "video")!;
    s = timelineReducer(s, { type: "dropAsset", asset: a, trackId: videoTrack.id, start: 0 });
    expect(s.assets).toHaveLength(1);
    expect(s.clips).toHaveLength(2);
    expect(s.links).toHaveLength(1);

    s = timelineReducer(s, { type: "deleteAsset", assetId: a.id });

    expect(s.assets).toHaveLength(0);
    expect(s.clips).toHaveLength(0);
    expect(s.links).toHaveLength(0);
    expect(s.selectedClipId).toBeNull();
  });
});

describe("tracks", () => {
  it("adds tracks and keeps video above audio", () => {
    let s = createInitialState();
    s = timelineReducer(s, { type: "addTrack", kind: "video" });
    const firstAudioIdx = s.tracks.findIndex((t) => t.kind === "audio");
    const lastVideoIdx = s.tracks.map((t) => t.kind).lastIndexOf("video");
    expect(lastVideoIdx).toBeLessThan(firstAudioIdx);
  });

  it("removing a track removes its clips", () => {
    const a = asset({ id: "m", kind: "audio" });
    let s = withAsset(a);
    const audioTrack = s.tracks.find((t) => t.kind === "audio")!;
    s = timelineReducer(s, { type: "dropAsset", asset: a, trackId: audioTrack.id, start: 0 });
    expect(s.clips).toHaveLength(1);
    s = timelineReducer(s, { type: "removeTrack", id: audioTrack.id });
    expect(s.clips).toHaveLength(0);
    expect(s.tracks.find((t) => t.id === audioTrack.id)).toBeUndefined();
  });
});

describe("volume clamping", () => {
  it("clamps clip volume to 0..2", () => {
    const a = asset({ id: "m", kind: "audio" });
    let s = withAsset(a);
    const audioTrack = s.tracks.find((t) => t.kind === "audio")!;
    s = timelineReducer(s, { type: "dropAsset", asset: a, trackId: audioTrack.id, start: 0 });
    const id = s.clips[0].id;
    s = timelineReducer(s, { type: "setClipVolume", id, volume: 5 });
    expect(s.clips[0].volume).toBe(2);
    s = timelineReducer(s, { type: "setClipVolume", id, volume: -1 });
    expect(s.clips[0].volume).toBe(0);
  });
});

describe("clip transform", () => {
  it("updates, clamps, and resets video transforms", () => {
    const a = asset({ id: "v", kind: "video" });
    let s = withAsset(a);
    const videoTrack = s.tracks.find((t) => t.kind === "video")!;
    s = timelineReducer(s, { type: "dropAsset", asset: a, trackId: videoTrack.id, start: 0 });
    const id = s.clips[0].id;

    s = timelineReducer(s, {
      type: "setClipTransform",
      id,
      transform: { x: 120, y: -80, scale: 50, rotation: 720 },
    });
    expect(s.clips[0].transform).toEqual({ x: 120, y: -80, scale: 20, rotation: 360 });

    s = timelineReducer(s, { type: "resetClipTransform", id });
    expect(s.clips[0].transform).toEqual({ x: 0, y: 0, scale: 1, rotation: 0 });
  });
});

describe("clip effects", () => {
  it("updates, clamps, and resets lightweight video effects", () => {
    const a = asset({ id: "v", kind: "video" });
    let s = withAsset(a);
    const videoTrack = s.tracks.find((t) => t.kind === "video")!;
    s = timelineReducer(s, { type: "dropAsset", asset: a, trackId: videoTrack.id, start: 0 });
    const id = s.clips[0].id;

    s = timelineReducer(s, {
      type: "setClipEffects",
      id,
      effects: {
        opacity: 2,
        blur: 200,
        brightness: -1,
        contrast: 3,
        saturation: 3,
        hue: 400,
        grayscale: 2,
        sepia: 2,
        invert: 2,
      },
    });
    expect(s.clips[0].effects).toEqual({
      opacity: 1,
      blur: 40,
      brightness: 0,
      contrast: 2,
      saturation: 2,
      hue: 180,
      grayscale: 1,
      sepia: 1,
      invert: 1,
    });

    s = timelineReducer(s, { type: "resetClipEffects", id });
    expect(s.clips[0].effects).toEqual({
      opacity: 1,
      blur: 0,
      brightness: 1,
      contrast: 1,
      saturation: 1,
      hue: 0,
      grayscale: 0,
      sepia: 0,
      invert: 0,
    });
  });
});

describe("clip transitions", () => {
  it("updates, clamps, and resets basic clip fades", () => {
    const a = asset({ id: "v", kind: "video" });
    let s = withAsset(a);
    const videoTrack = s.tracks.find((t) => t.kind === "video")!;
    s = timelineReducer(s, { type: "dropAsset", asset: a, trackId: videoTrack.id, start: 0 });
    const id = s.clips[0].id;

    s = timelineReducer(s, {
      type: "setClipTransitions",
      id,
      transitions: { fadeIn: -1, fadeOut: 99, inStyle: "dipBlack", outStyle: "slideLeft" },
    });
    expect(s.clips[0].transitions).toEqual({
      fadeIn: 0,
      fadeOut: 30,
      inStyle: "dipBlack",
      outStyle: "slideLeft",
    });

    s = timelineReducer(s, { type: "resetClipTransitions", id });
    expect(s.clips[0].transitions).toEqual({
      fadeIn: 0,
      fadeOut: 0,
      inStyle: "fade",
      outStyle: "fade",
    });
  });
});
