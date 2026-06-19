import { describe, it, expect } from "vitest";
import { createInitialHistory, historyReducer } from "./history";
import { Asset } from "./types";

function videoAsset(id: string): Asset {
  return {
    id,
    path: `/src/${id}.mp4`,
    previewPath: null,
    name: id,
    kind: "video",
    duration: 5,
    width: 1920,
    height: 1080,
    fps: 30,
    videoCodec: "h264",
    audioCodec: null,
    hasAudio: false,
    previewable: true,
    thumbnailUrl: null,
  };
}

describe("history", () => {
  it("undoes and redoes a document change", () => {
    let h = createInitialHistory();
    h = historyReducer(h, { type: "addAsset", asset: videoAsset("v") });
    expect(h.present.assets).toHaveLength(1);
    h = historyReducer(h, { type: "undo" });
    expect(h.present.assets).toHaveLength(0);
    h = historyReducer(h, { type: "redo" });
    expect(h.present.assets).toHaveLength(1);
  });

  it("does not create an undo step for selection or zoom", () => {
    let h = createInitialHistory();
    h = historyReducer(h, { type: "addAsset", asset: videoAsset("v") });
    const past = h.past.length;
    h = historyReducer(h, { type: "select", id: "x" });
    h = historyReducer(h, { type: "setPxPerSec", value: 80 });
    expect(h.past.length).toBe(past);
  });

  it("coalesces a continuous drag into a single undo step", () => {
    let h = createInitialHistory();
    const a = videoAsset("v");
    h = historyReducer(h, { type: "addAsset", asset: a });
    const track = h.present.tracks.find((t) => t.kind === "video")!;
    h = historyReducer(h, { type: "dropAsset", asset: a, trackId: track.id, start: 0 });
    const id = h.present.clips[0].id;

    h = historyReducer(h, { type: "moveClip", id, trackId: track.id, start: 1 });
    const afterFirstMove = h.past.length;
    h = historyReducer(h, { type: "moveClip", id, trackId: track.id, start: 2 });
    h = historyReducer(h, { type: "moveClip", id, trackId: track.id, start: 3 });
    // Repeated moves of the same clip collapse into the first move's step.
    expect(h.past.length).toBe(afterFirstMove);
    // One undo returns to the pre-drag position.
    h = historyReducer(h, { type: "undo" });
    expect(h.present.clips[0].start).toBe(0);
  });

  it("starts a fresh history when a project is loaded", () => {
    let h = createInitialHistory();
    h = historyReducer(h, { type: "addAsset", asset: videoAsset("v") });
    h = historyReducer(h, { type: "loadState", state: createInitialHistory().present });
    expect(h.past).toHaveLength(0);
    expect(h.future).toHaveLength(0);
  });
});
