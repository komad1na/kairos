import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { VideoInfo } from "./types";

/** Reads metadata of the selected video via Rust/ffprobe. */
export function probeVideo(path: string): Promise<VideoInfo> {
  return invoke<VideoInfo>("probe_video", { path });
}

/**
 * Requests a single frame at the given time and returns it as an `ImageBitmap`
 * ready to draw on a canvas. Rust returns raw JPEG bytes (ArrayBuffer).
 */
export async function getFrame(
  path: string,
  time: number,
  maxWidth: number,
): Promise<ImageBitmap> {
  const buf = await invoke<ArrayBuffer>("get_frame", {
    path,
    time,
    maxWidth,
  });
  const blob = new Blob([buf], { type: "image/jpeg" });
  return createImageBitmap(blob);
}

/** Renders the clips into an output file. */
export function exportTimeline(
  clips: { path: string; start: number; end: number }[],
  output: string,
): Promise<void> {
  return invoke("export_timeline", { clips, output });
}

const VIDEO_EXTENSIONS = ["mp4", "mov", "mkv", "webm", "avi", "m4v"];

/** Opens a dialog to pick a video file. Returns the path or null. */
export async function pickVideoFile(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Video", extensions: VIDEO_EXTENSIONS }],
  });
  return typeof selected === "string" ? selected : null;
}

/** Opens a dialog to save the output file. Returns the path or null. */
export async function pickExportPath(): Promise<string | null> {
  const selected = await save({
    defaultPath: "export.mp4",
    filters: [{ name: "Video", extensions: ["mp4"] }],
  });
  return selected ?? null;
}
