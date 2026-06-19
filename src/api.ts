import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { VideoInfo } from "./types";

/** Reads metadata of the selected media file via Rust/ffprobe. */
export function probeVideo(path: string): Promise<VideoInfo> {
  return invoke<VideoInfo>("probe_video", { path });
}

/**
 * URL the webview can stream a local source file from. Linux WebKitGTK media
 * playback does not accept Tauri custom protocols as native media sources, so
 * preview uses a direct file URL. ffmpeg is never in the preview path.
 */
export function mediaUrl(path: string): string {
  return fileUrl(path);
}

const mediaBlobUrls = new Map<string, string>();
const pendingMediaBlobUrls = new Map<string, Promise<string>>();
const mediaDataUrls = new Map<string, string>();
const pendingMediaDataUrls = new Map<string, Promise<string>>();
const mediaBytes = new Map<string, ArrayBuffer>();
const pendingMediaBytes = new Map<string, Promise<ArrayBuffer>>();
const thumbnailUrls = new Map<string, string>();
const pendingThumbnailUrls = new Map<string, Promise<string>>();

/**
 * Native preview fallback for WebKitGTK when file/custom protocol URLs are
 * rejected by the media pipeline. This keeps the original bytes and lets the
 * browser decode them; it is not a proxy and not a transcode.
 */
export function mediaBlobUrl(path: string): Promise<string> {
  const cached = mediaBlobUrls.get(path);
  if (cached) return Promise.resolve(cached);

  const pending = pendingMediaBlobUrls.get(path);
  if (pending) return pending;

  const next = readMediaBytes(path)
    .then((buf) => {
      const url = URL.createObjectURL(new Blob([buf], { type: mimeForPath(path) }));
      mediaBlobUrls.set(path, url);
      pendingMediaBlobUrls.delete(path);
      return url;
    })
    .catch((err) => {
      pendingMediaBlobUrls.delete(path);
      throw err;
    });
  pendingMediaBlobUrls.set(path, next);
  return next;
}

/** Last native fallback for WebKitGTK media pipeline stalls on blob URLs. */
export function mediaDataUrl(path: string): Promise<string> {
  const cached = mediaDataUrls.get(path);
  if (cached) return Promise.resolve(cached);

  const pending = pendingMediaDataUrls.get(path);
  if (pending) return pending;

  const next = readMediaBytes(path)
    .then((buf) => {
      const url = `data:${mimeForPath(path)};base64,${arrayBufferToBase64(buf)}`;
      mediaDataUrls.set(path, url);
      pendingMediaDataUrls.delete(path);
      return url;
    })
    .catch((err) => {
      pendingMediaDataUrls.delete(path);
      throw err;
    });
  pendingMediaDataUrls.set(path, next);
  return next;
}

function readMediaBytes(path: string): Promise<ArrayBuffer> {
  const cached = mediaBytes.get(path);
  if (cached) return Promise.resolve(cached);

  const pending = pendingMediaBytes.get(path);
  if (pending) return pending;

  const next = invoke<ArrayBuffer>("read_media_file", { path })
    .then((buf) => {
      mediaBytes.set(path, buf);
      pendingMediaBytes.delete(path);
      return buf;
    })
    .catch((err) => {
      pendingMediaBytes.delete(path);
      throw err;
    });
  pendingMediaBytes.set(path, next);
  return next;
}

function fileUrl(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const encoded = normalized
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")
    .replace(/^([A-Za-z])%3A/, "$1:");

  if (/^[A-Za-z]:\//.test(normalized)) return `file:///${encoded}`;
  return `file://${encoded}`;
}

function mimeForPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "mp4":
    case "m4v":
      return "video/mp4";
    case "mov":
      return "video/quicktime";
    case "webm":
      return "video/webm";
    case "mkv":
      return "video/x-matroska";
    case "avi":
      return "video/x-msvideo";
    case "mp3":
      return "audio/mpeg";
    case "m4a":
    case "aac":
      return "audio/mp4";
    case "wav":
      return "audio/wav";
    case "flac":
      return "audio/flac";
    case "ogg":
      return "audio/ogg";
    case "opus":
      return "audio/opus";
    default:
      return "application/octet-stream";
  }
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Generates a single representative thumbnail (JPEG) and returns an object URL.
 * Cached per source path so re-imports and re-opened projects reuse one object
 * URL per file instead of leaking a new one every time.
 */
export function generateThumbnail(
  path: string,
  time: number,
  maxWidth: number,
): Promise<string> {
  const cached = thumbnailUrls.get(path);
  if (cached) return Promise.resolve(cached);

  const pending = pendingThumbnailUrls.get(path);
  if (pending) return pending;

  const next = invoke<ArrayBuffer>("generate_thumbnail", { path, time, maxWidth })
    .then((buf) => {
      const url = URL.createObjectURL(new Blob([buf], { type: "image/jpeg" }));
      thumbnailUrls.set(path, url);
      pendingThumbnailUrls.delete(path);
      return url;
    })
    .catch((err) => {
      pendingThumbnailUrls.delete(path);
      throw err;
    });
  pendingThumbnailUrls.set(path, next);
  return next;
}

/** Returns downsampled audio peaks (0..1) for rendering a clip's waveform. */
export function generateWaveform(path: string, buckets: number): Promise<number[]> {
  return invoke<number[]>("generate_waveform", { path, buckets });
}

/** Creates or reuses an editor-friendly local media file for smooth preview. */
export function ensurePreviewCache(path: string, proxyHeight: number): Promise<string> {
  return invoke<string>("ensure_preview_cache", { path, proxyHeight });
}

/** Checks whether a local path still exists. Used to recover preview cache after /tmp cleanup. */
export function pathExists(path: string): Promise<boolean> {
  return invoke<boolean>("path_exists", { path });
}

export interface PreviewCacheStats {
  path: string;
  sizeBytes: number;
  fileCount: number;
}

/** Returns preview cache directory usage. */
export function previewCacheStats(): Promise<PreviewCacheStats> {
  return invoke<PreviewCacheStats>("preview_cache_stats");
}

/** Deletes all generated preview cache files and returns fresh usage stats. */
export function clearPreviewCache(): Promise<PreviewCacheStats> {
  return invoke<PreviewCacheStats>("clear_preview_cache");
}

/** A clip as sent to the backend renderer (flattened from the model). */
export interface ExportClipTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface ExportClipEffects {
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

export interface ExportClipTransitions {
  fadeIn: number;
  fadeOut: number;
  inStyle: string;
  outStyle: string;
}

export interface ExportClipPayload {
  path: string;
  start: number;
  in: number;
  out: number;
  volume: number;
  muted: boolean;
  transform: ExportClipTransform;
  effects: ExportClipEffects;
  transitions: ExportClipTransitions;
}

/** Render-ready projection of the timeline (see data-model.md). */
export interface ExportProject {
  output: string;
  width: number;
  height: number;
  fps: number;
  /** Video encoder: software x264 or NVIDIA NVENC. */
  encoder: "x264" | "h264Nvenc";
  /** Rate control mode for x264 export. */
  rateControl: "crf" | "bitrate";
  /** x264 quality (CRF): lower = better/larger. */
  crf: number;
  /** Target video bitrate when rateControl is "bitrate". */
  videoBitrateKbps: number | null;
  /** AAC audio bitrate. */
  audioBitrateKbps: number;
  /** x264 speed/efficiency preset (e.g. "fast", "medium", "slow"). */
  preset: string;
  /** Bottom→top order; the top track occludes lower ones (FR-024a). */
  videoTracks: { clips: ExportClipPayload[] }[];
  audioTracks: { volume: number; muted: boolean; clips: ExportClipPayload[] }[];
}

/** Renders the whole multi-track timeline into one .mp4 (H.264 + AAC). */
export function exportTimeline(project: ExportProject): Promise<void> {
  return invoke("export_timeline", { project });
}

/** Persists a project document (JSON) to a file. */
export function saveProject(path: string, data: string): Promise<void> {
  return invoke("save_project", { path, data });
}

/** Reads a project document (JSON) back from a file. */
export function loadProject(path: string): Promise<string> {
  return invoke<string>("load_project", { path });
}

export interface SessionLogSnapshot {
  directory: string;
  path: string;
  content: string;
}

/** Appends a diagnostic line to the current session log. */
export function appendSessionLog(level: string, message: string): Promise<void> {
  return invoke("append_session_log", { level, message });
}

/** Reads the current session log path and contents. */
export function sessionLogSnapshot(): Promise<SessionLogSnapshot> {
  return invoke<SessionLogSnapshot>("session_log_snapshot");
}

/** Requests a native app exit after frontend save/discard decisions are done. */
export function requestAppExit(): Promise<void> {
  return invoke("request_app_exit");
}


const VIDEO_EXTENSIONS = withUppercaseExtensions(["mp4", "mov", "mkv", "webm", "avi", "m4v"]);
const AUDIO_EXTENSIONS = withUppercaseExtensions([
  "mp3",
  "m4a",
  "aac",
  "wav",
  "flac",
  "ogg",
  "opus",
]);

function withUppercaseExtensions(extensions: string[]): string[] {
  return [...new Set(extensions.flatMap((ext) => [ext, ext.toUpperCase()]))];
}

/** Opens a dialog to pick a media file (video or audio). Returns the path or null. */
export async function pickMediaFile(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Media", extensions: [...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS] }],
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

const PROJECT_EXT = "kairos";

/** Opens a dialog to save a project file. Returns the path or null. */
export async function pickSaveProjectPath(defaultName = "Untitled"): Promise<string | null> {
  const selected = await save({
    defaultPath: `${defaultName}.${PROJECT_EXT}`,
    filters: [{ name: "Kairos Project", extensions: [PROJECT_EXT] }],
  });
  return selected ?? null;
}

/** Opens a dialog to open a project file. Returns the path or null. */
export async function pickOpenProjectPath(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Kairos Project", extensions: [PROJECT_EXT] }],
  });
  return typeof selected === "string" ? selected : null;
}
