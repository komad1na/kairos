import { ProjectSettings } from "./types";

export type ExportRateControl = "crf" | "bitrate";
export type ExportEncoder = "x264" | "h264Nvenc";
export type QualityKey = "high" | "medium" | "low" | "custom";

export interface ExportOptions {
  width: number;
  height: number;
  encoder: ExportEncoder;
  rateControl: ExportRateControl;
  crf: number;
  videoBitrateKbps: number | null;
  audioBitrateKbps: number;
  preset: string;
}

export interface SavedExportSettings {
  resKey: string;
  encoder: ExportEncoder;
  rateControl: ExportRateControl;
  quality: QualityKey;
  crf: number;
  videoBitrateKbps: number;
  audioBitrateKbps: number;
  preset: string;
}

export interface ExportProfile {
  id: string;
  name: string;
  settings: SavedExportSettings;
  createdAt: number;
  updatedAt: number;
}

export const RESOLUTION_PRESETS: Record<string, { w: number; h: number } | null> = {
  project: null,
  "2160": { w: 3840, h: 2160 },
  "1080": { w: 1920, h: 1080 },
  "720": { w: 1280, h: 720 },
  "480": { w: 854, h: 480 },
};

export const QUALITY_CRF: Record<Exclude<QualityKey, "custom">, number> = {
  high: 18,
  medium: 23,
  low: 28,
};

export const EXPORT_PRESETS = ["ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow"];

const EXPORT_SETTINGS_KEY = "videoEditor.lastExportSettings";
const EXPORT_PROFILES_KEY = "videoEditor.exportProfiles";

export function defaultExportSettings(settings: ProjectSettings): SavedExportSettings {
  return {
    resKey: "project",
    encoder: "x264",
    rateControl: "crf",
    quality: "medium",
    crf: QUALITY_CRF.medium,
    videoBitrateKbps: suggestVideoBitrateKbps(settings.width, settings.height),
    audioBitrateKbps: 192,
    preset: "fast",
  };
}

export function loadExportSettings(settings: ProjectSettings): SavedExportSettings {
  const fallback = defaultExportSettings(settings);
  try {
    const raw = localStorage.getItem(EXPORT_SETTINGS_KEY);
    if (!raw) return fallback;
    const saved = JSON.parse(raw) as Partial<SavedExportSettings>;
    const resKey =
      typeof saved.resKey === "string" && saved.resKey in RESOLUTION_PRESETS
        ? saved.resKey
        : fallback.resKey;
    const rateControl = saved.rateControl === "bitrate" ? "bitrate" : "crf";
    const encoder = saved.encoder === "h264Nvenc" ? "h264Nvenc" : "x264";
    const crf = clamp(Math.round(numberOrFallback(saved.crf ?? null, fallback.crf)), 0, 51);
    return {
      resKey,
      encoder,
      rateControl,
      quality: qualityForCrf(crf, saved.quality),
      crf,
      videoBitrateKbps: clamp(
        Math.round(numberOrFallback(saved.videoBitrateKbps ?? null, fallback.videoBitrateKbps)),
        250,
        200000,
      ),
      audioBitrateKbps: clamp(
        Math.round(numberOrFallback(saved.audioBitrateKbps ?? null, fallback.audioBitrateKbps)),
        64,
        512,
      ),
      preset:
        typeof saved.preset === "string" && EXPORT_PRESETS.includes(saved.preset)
          ? saved.preset
          : fallback.preset,
    };
  } catch {
    return fallback;
  }
}

export function saveExportSettings(settings: SavedExportSettings) {
  localStorage.setItem(EXPORT_SETTINGS_KEY, JSON.stringify(settings));
}

export function loadExportProfiles(settings: ProjectSettings): ExportProfile[] {
  const fallback = defaultExportSettings(settings);
  try {
    const raw = localStorage.getItem(EXPORT_PROFILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((profile): ExportProfile | null => {
        if (!profile || typeof profile !== "object") return null;
        const name = typeof profile.name === "string" ? profile.name.trim() : "";
        if (!name) return null;
        const id = typeof profile.id === "string" && profile.id ? profile.id : crypto.randomUUID();
        const saved = sanitizeExportSettings(profile.settings, fallback);
        const createdAt = finiteOr(profile.createdAt, Date.now());
        const updatedAt = finiteOr(profile.updatedAt, createdAt);
        return { id, name, settings: saved, createdAt, updatedAt };
      })
      .filter((profile): profile is ExportProfile => profile !== null);
  } catch {
    return [];
  }
}

export function saveExportProfiles(profiles: ExportProfile[]) {
  localStorage.setItem(EXPORT_PROFILES_KEY, JSON.stringify(profiles));
}

export function createExportProfile(name: string, settings: SavedExportSettings): ExportProfile {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    settings,
    createdAt: now,
    updatedAt: now,
  };
}

export function qualityForCrf(crf: number, savedQuality?: QualityKey): QualityKey {
  if (savedQuality === "custom") return "custom";
  const presetQuality = Object.entries(QUALITY_CRF).find(([, presetCrf]) => presetCrf === crf);
  return (presetQuality?.[0] as QualityKey | undefined) ?? "custom";
}

export function resolveResolution(key: string, settings: ProjectSettings): { width: number; height: number } {
  const preset = RESOLUTION_PRESETS[key];
  return preset ? { width: preset.w, height: preset.h } : settings;
}

export function suggestVideoBitrateKbps(width: number, height: number): number {
  const pixels = width * height;
  if (pixels >= 3840 * 2160 * 0.8) return 35000;
  if (pixels >= 1920 * 1080 * 0.8) return 12000;
  if (pixels >= 1280 * 720 * 0.8) return 6000;
  if (pixels >= 854 * 480 * 0.8) return 3000;
  return 2000;
}

export function numberOrFallback(value: number | string | null, fallback: number): number {
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) ? next : fallback;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitizeExportSettings(
  saved: Partial<SavedExportSettings> | null | undefined,
  fallback: SavedExportSettings,
): SavedExportSettings {
  if (!saved || typeof saved !== "object") return fallback;
  const resKey =
    typeof saved.resKey === "string" && saved.resKey in RESOLUTION_PRESETS
      ? saved.resKey
      : fallback.resKey;
  const rateControl = saved.rateControl === "bitrate" ? "bitrate" : "crf";
  const encoder = saved.encoder === "h264Nvenc" ? "h264Nvenc" : "x264";
  const crf = clamp(Math.round(numberOrFallback(saved.crf ?? null, fallback.crf)), 0, 51);
  return {
    resKey,
    encoder,
    rateControl,
    quality: qualityForCrf(crf, saved.quality),
    crf,
    videoBitrateKbps: clamp(
      Math.round(numberOrFallback(saved.videoBitrateKbps ?? null, fallback.videoBitrateKbps)),
      250,
      200000,
    ),
    audioBitrateKbps: clamp(
      Math.round(numberOrFallback(saved.audioBitrateKbps ?? null, fallback.audioBitrateKbps)),
      64,
      512,
    ),
    preset:
      typeof saved.preset === "string" && EXPORT_PRESETS.includes(saved.preset)
        ? saved.preset
        : fallback.preset,
  };
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
