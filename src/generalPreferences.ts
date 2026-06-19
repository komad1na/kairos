export interface GeneralPreferences {
  accentColor: string;
  autosaveIntervalMinutes: number;
  defaultExportFolder: string;
  defaultProjectFolder: string;
  confirmDeletes: boolean;
}

const GENERAL_PREFERENCES_KEY = "videoEditor.generalPreferences";

export const DEFAULT_GENERAL_PREFERENCES: GeneralPreferences = {
  accentColor: "#4f8cff",
  autosaveIntervalMinutes: 0,
  defaultExportFolder: "",
  defaultProjectFolder: "",
  confirmDeletes: true,
};

export function loadGeneralPreferences(): GeneralPreferences {
  try {
    const raw = localStorage.getItem(GENERAL_PREFERENCES_KEY);
    if (!raw) return DEFAULT_GENERAL_PREFERENCES;
    return sanitizeGeneralPreferences(JSON.parse(raw));
  } catch {
    return DEFAULT_GENERAL_PREFERENCES;
  }
}

export function saveGeneralPreferences(preferences: GeneralPreferences) {
  const sanitized = sanitizeGeneralPreferences(preferences);
  localStorage.setItem(GENERAL_PREFERENCES_KEY, JSON.stringify(sanitized));
  applyGeneralPreferences(sanitized);
  window.dispatchEvent(new CustomEvent("general-preferences-changed", { detail: sanitized }));
}

export function applyGeneralPreferences(preferences = loadGeneralPreferences()) {
  document.documentElement.style.setProperty("--accent", preferences.accentColor);
}

function sanitizeGeneralPreferences(value: Partial<GeneralPreferences> | null): GeneralPreferences {
  const fallback = DEFAULT_GENERAL_PREFERENCES;
  const accentColor =
    typeof value?.accentColor === "string" && /^#[0-9a-f]{6}$/i.test(value.accentColor)
      ? value.accentColor
      : fallback.accentColor;
  const autosaveIntervalMinutes = clamp(
    Math.round(Number(value?.autosaveIntervalMinutes ?? fallback.autosaveIntervalMinutes)),
    0,
    60,
  );
  return {
    accentColor,
    autosaveIntervalMinutes,
    defaultExportFolder:
      typeof value?.defaultExportFolder === "string" ? value.defaultExportFolder : "",
    defaultProjectFolder:
      typeof value?.defaultProjectFolder === "string" ? value.defaultProjectFolder : "",
    confirmDeletes:
      typeof value?.confirmDeletes === "boolean" ? value.confirmDeletes : fallback.confirmDeletes,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
