/** Helpers to turn probe metadata into a library Asset. */
import { Asset, MediaKind, VideoInfo } from "./types";

// Codecs WebKitGTK can typically decode for realtime preview (research R4).
const PREVIEWABLE_VIDEO = new Set(["h264", "vp8", "vp9", "av1", "mpeg4", "theora"]);
const PREVIEWABLE_AUDIO = new Set([
  "aac",
  "mp3",
  "opus",
  "vorbis",
  "flac",
  "pcm_s16le",
  "pcm_s16be",
]);

export function mediaKind(info: VideoInfo): MediaKind {
  if (info.hasVideo && info.hasAudio) return "both";
  if (info.hasVideo) return "video";
  return "audio";
}

/** Whether the webview can likely decode this source for preview (else: warn). */
export function isPreviewable(info: VideoInfo): boolean {
  const videoOk =
    !info.hasVideo || (info.videoCodec != null && PREVIEWABLE_VIDEO.has(info.videoCodec));
  const audioOk =
    !info.hasAudio || (info.audioCodec != null && PREVIEWABLE_AUDIO.has(info.audioCodec));
  return videoOk && audioOk;
}

export function assetFromInfo(path: string, name: string, info: VideoInfo): Asset {
  return {
    id: crypto.randomUUID(),
    path,
    previewPath: null,
    name,
    kind: mediaKind(info),
    duration: info.duration,
    width: info.width,
    height: info.height,
    fps: info.fps,
    videoCodec: info.videoCodec,
    audioCodec: info.audioCodec,
    hasAudio: info.hasAudio,
    previewable: isPreviewable(info),
    thumbnailUrl: null,
  };
}
