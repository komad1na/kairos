import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Segmented,
  Select,
  Slider,
  Space,
  Switch,
  Tabs,
  Tooltip,
  Typography,
} from "antd";
import {
  DeleteOutlined,
  FolderOpenOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import {
  clearPreviewCache,
  GpuAdapter,
  gpuAdapters,
  openSystemPath,
  pickFolderPath,
  PreviewCacheStats,
  previewCacheStats,
  SessionLogSnapshot,
  sessionLogSnapshot,
} from "../api";
import {
  EXPORT_PRESETS,
  ExportEncoder,
  ExportProfile,
  ExportRateControl,
  QUALITY_CRF,
  QualityKey,
  clamp,
  createExportProfile,
  loadExportProfiles,
  loadExportSettings,
  numberOrFallback,
  resolveResolution,
  saveExportProfiles,
  saveExportSettings,
  SavedExportSettings,
  suggestVideoBitrateKbps,
} from "../exportSettings";
import { availableExportEncoderOptions, isExportEncoderAvailable } from "../exportEncoders";
import {
  GeneralPreferences,
  loadGeneralPreferences,
  saveGeneralPreferences,
} from "../generalPreferences";
import { LANGUAGES } from "../i18n";
import { logError, logInfo } from "../logger";
import {
  PREVIEW_PROXY_HEIGHTS,
  PreviewProxyHeight,
  loadPreviewProxyHeight,
  previewProxyHeightLabel,
  savePreviewProxyHeight,
} from "../previewProxySettings";
import { ProjectSettings } from "../types";

interface Props {
  open: boolean;
  settings: ProjectSettings;
  onCancel: () => void;
  onStatus: (message: string) => void;
  onCacheCleared: () => void;
}

export function PreferencesModal({
  open,
  settings,
  onCancel,
  onStatus,
  onCacheCleared,
}: Props) {
  const { t, i18n } = useTranslation();
  const [cache, setCache] = useState<PreviewCacheStats | null>(null);
  const [cacheLoading, setCacheLoading] = useState(false);
  const [cacheClearing, setCacheClearing] = useState(false);
  const [logSnapshot, setLogSnapshot] = useState<SessionLogSnapshot | null>(null);
  const [logLoading, setLogLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resKey, setResKey] = useState("project");
  const [rateControl, setRateControl] = useState<ExportRateControl>("crf");
  const [quality, setQuality] = useState<QualityKey>("medium");
  const [crf, setCrf] = useState(QUALITY_CRF.medium);
  const [videoBitrateKbps, setVideoBitrateKbps] = useState(() =>
    suggestVideoBitrateKbps(settings.width, settings.height),
  );
  const [audioBitrateKbps, setAudioBitrateKbps] = useState(192);
  const [preset, setPreset] = useState("fast");
  const [encoder, setEncoder] = useState<ExportEncoder>("x264");
  const [profiles, setProfiles] = useState<ExportProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [profileName, setProfileName] = useState("");
  const [gpuAdapterList, setGpuAdapterList] = useState<GpuAdapter[] | null>(null);
  const [generalPreferences, setGeneralPreferences] = useState<GeneralPreferences>(() =>
    loadGeneralPreferences(),
  );
  const [proxyHeight, setProxyHeight] = useState<PreviewProxyHeight>(() =>
    loadPreviewProxyHeight(),
  );
  const [initialProxyHeight, setInitialProxyHeight] = useState<PreviewProxyHeight>(() =>
    loadPreviewProxyHeight(),
  );

  const refreshCache = useCallback(async () => {
    setCacheLoading(true);
    setError(null);
    try {
      logInfo("preferences:cache:refresh");
      setCache(await previewCacheStats());
    } catch (e) {
      setError(String(e));
      logError("preferences:cache:refresh:error", e);
    } finally {
      setCacheLoading(false);
    }
  }, []);

  const refreshLogs = useCallback(async () => {
    setLogLoading(true);
    setError(null);
    try {
      logInfo("preferences:logs:refresh");
      setLogSnapshot(await sessionLogSnapshot());
    } catch (e) {
      setError(String(e));
      logError("preferences:logs:refresh:error", e);
    } finally {
      setLogLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const saved = loadExportSettings(settings);
    applySavedSettings(saved);
    setGeneralPreferences(loadGeneralPreferences());
    setProfiles(loadExportProfiles(settings));
    setSelectedProfileId(null);
    setProfileName("");
    const savedProxyHeight = loadPreviewProxyHeight();
    setProxyHeight(savedProxyHeight);
    setInitialProxyHeight(savedProxyHeight);
    void gpuAdapters()
      .then(setGpuAdapterList)
      .catch((e) => {
        logError("preferences:gpu_adapters:error", e);
        setGpuAdapterList([]);
      });
    void refreshCache();
    void refreshLogs();
  }, [open, refreshCache, refreshLogs, settings]);

  useEffect(() => {
    if (
      !gpuAdapterList ||
      isExportEncoderAvailable(
        encoder,
        gpuAdapterList,
      )
    )
      return;
    setEncoder("x264");
  }, [encoder, gpuAdapterList]);

  function handleResolutionChange(next: string) {
    setResKey(next);
    const res = resolveResolution(next, settings);
    setVideoBitrateKbps(suggestVideoBitrateKbps(res.width, res.height));
  }

  function handleQualityChange(next: QualityKey) {
    setQuality(next);
    if (next !== "custom") setCrf(QUALITY_CRF[next]);
  }

  function handleCrfChange(value: number | string | null) {
    const next = clamp(Math.round(numberOrFallback(value, crf)), 0, 51);
    setCrf(next);
    const presetQuality = Object.entries(QUALITY_CRF).find(([, presetCrf]) => presetCrf === next);
    setQuality((presetQuality?.[0] as QualityKey | undefined) ?? "custom");
  }

  function handleVideoBitrateChange(value: number | string | null) {
    const mbps = numberOrFallback(value, videoBitrateKbps / 1000);
    setVideoBitrateKbps(clamp(Math.round(mbps * 1000), 250, 200000));
  }

  function currentSavedSettings(): SavedExportSettings {
    return {
      resKey,
      encoder,
      rateControl,
      quality,
      crf,
      videoBitrateKbps,
      audioBitrateKbps,
      preset,
    };
  }

  function applySavedSettings(saved: SavedExportSettings) {
    setResKey(saved.resKey);
    setEncoder(saved.encoder);
    setRateControl(saved.rateControl);
    setQuality(saved.quality);
    setCrf(saved.crf);
    setVideoBitrateKbps(saved.videoBitrateKbps);
    setAudioBitrateKbps(saved.audioBitrateKbps);
    setPreset(saved.preset);
  }

  function handleProfileChange(id: string) {
    setSelectedProfileId(id);
    const profile = profiles.find((item) => item.id === id);
    if (!profile) return;
    logInfo("preferences:export_profile:apply", { id: profile.id, name: profile.name });
    const settings = {
      ...profile.settings,
      encoder: isExportEncoderAvailable(
        profile.settings.encoder,
        gpuAdapterList,
      )
        ? profile.settings.encoder
        : "x264",
    };
    applySavedSettings(settings);
    saveExportSettings(settings);
  }

  function handleSaveProfile() {
    const name = profileName.trim();
    if (!name) return;
    const exportSettings = currentSavedSettings();
    const existing = profiles.find((item) => item.name.toLowerCase() === name.toLowerCase());
    const next = existing
      ? profiles.map((item) =>
          item.id === existing.id
            ? { ...item, name, settings: exportSettings, updatedAt: Date.now() }
            : item,
        )
      : [...profiles, createExportProfile(name, exportSettings)];
    const saved = next.find((item) => item.name.toLowerCase() === name.toLowerCase())!;
    saveExportProfiles(next);
    saveExportSettings(exportSettings);
    setProfiles(next);
    setSelectedProfileId(saved.id);
    setProfileName("");
    logInfo("preferences:export_profile:save", { id: saved.id, name: saved.name });
    onStatus(t("export.profileSaved", { name: saved.name }));
  }

  function handleDeleteProfile() {
    if (!selectedProfileId) return;
    const deleted = profiles.find((item) => item.id === selectedProfileId);
    const next = profiles.filter((item) => item.id !== selectedProfileId);
    saveExportProfiles(next);
    setProfiles(next);
    setSelectedProfileId(null);
    logInfo("preferences:export_profile:delete", {
      id: selectedProfileId,
      name: deleted?.name,
    });
  }

  async function handleClearCache() {
    setCacheClearing(true);
    setError(null);
    try {
      const next = await clearPreviewCache();
      setCache(next);
      onCacheCleared();
      onStatus(t("preferences.cacheCleared"));
      logInfo("preferences:cache:clear:ok");
    } catch (e) {
      setError(String(e));
      logError("preferences:cache:clear:error", e);
    } finally {
      setCacheClearing(false);
    }
  }

  async function openPreferencePath(path: string | null | undefined) {
    if (!path) return;
    try {
      await openSystemPath(path);
    } catch (e) {
      setError(String(e));
      logError("preferences:open_path:error", { path, error: String(e) });
    }
  }

  function updateGeneralPreferences(patch: Partial<GeneralPreferences>) {
    setGeneralPreferences((current) => ({ ...current, ...patch }));
  }

  async function chooseGeneralFolder(key: "defaultExportFolder" | "defaultProjectFolder") {
    const selected = await pickFolderPath(generalPreferences[key]);
    if (selected) updateGeneralPreferences({ [key]: selected });
  }

  function handleSave() {
    saveGeneralPreferences(generalPreferences);
    saveExportSettings(currentSavedSettings());
    savePreviewProxyHeight(proxyHeight);
    const proxyChanged = proxyHeight !== initialProxyHeight;
    if (proxyChanged) {
      onCacheCleared();
      onStatus(t("preferences.proxyResolutionChanged"));
    } else {
      onStatus(t("preferences.saved"));
    }
    logInfo("preferences:save", { proxyHeight, proxyChanged });
    onCancel();
  }

  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const encoderOptions = availableExportEncoderOptions(t, gpuAdapterList);

  return (
    <Modal
      open={open}
      title={t("preferences.title")}
      okText={t("common.save")}
      cancelText={t("common.cancel")}
      width={685}
      className="preferences-modal"
      wrapClassName="preferences-modal-wrap"
      onCancel={onCancel}
      onOk={handleSave}
    >
      <Tabs
        items={[
          {
            key: "general",
            label: t("preferences.general"),
            children: (
              <Form className="preferences-general-panel" layout="vertical">
                <div className="preferences-general-grid">
                  <Form.Item label={t("toolbar.language")}>
                    <Select
                      value={i18n.language}
                      onChange={(v) => {
                        logInfo("preferences:language:change", { language: v });
                        void i18n.changeLanguage(v);
                      }}
                      options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
                    />
                  </Form.Item>
                  <Form.Item label={t("preferences.accentColor")}>
                    <Select
                      value={generalPreferences.accentColor}
                      onChange={(accentColor) => updateGeneralPreferences({ accentColor })}
                      options={[
                        { value: "#4f8cff", label: t("preferences.accentBlue") },
                        { value: "#22c55e", label: t("preferences.accentGreen") },
                        { value: "#f59e0b", label: t("preferences.accentAmber") },
                        { value: "#e879f9", label: t("preferences.accentPink") },
                      ]}
                    />
                  </Form.Item>
                </div>
                <div className="preferences-general-grid">
                  <Form.Item
                    label={labelWithInfo(
                      t("preferences.autosaveInterval"),
                      t("preferences.autosaveIntervalHint"),
                    )}
                  >
                    <InputNumber
                      min={0}
                      max={60}
                      value={generalPreferences.autosaveIntervalMinutes}
                      addonAfter={t("preferences.minutes")}
                      onChange={(value) =>
                        updateGeneralPreferences({
                          autosaveIntervalMinutes: Number(value ?? 0),
                        })
                      }
                    />
                  </Form.Item>
                  <Form.Item label={t("preferences.confirmDeletes")}>
                    <Switch
                      checked={generalPreferences.confirmDeletes}
                      onChange={(confirmDeletes) => updateGeneralPreferences({ confirmDeletes })}
                    />
                  </Form.Item>
                </div>
                <div className="preferences-folder-grid">
                  <Form.Item label={t("preferences.defaultProjectFolder")}>
                    <Space.Compact className="preferences-folder-input">
                      <Input readOnly value={generalPreferences.defaultProjectFolder} />
                      <Button onClick={() => chooseGeneralFolder("defaultProjectFolder")}>
                        {t("preferences.chooseFolder")}
                      </Button>
                    </Space.Compact>
                  </Form.Item>
                  <Form.Item label={t("preferences.defaultExportFolder")}>
                    <Space.Compact className="preferences-folder-input">
                      <Input readOnly value={generalPreferences.defaultExportFolder} />
                      <Button onClick={() => chooseGeneralFolder("defaultExportFolder")}>
                        {t("preferences.chooseFolder")}
                      </Button>
                    </Space.Compact>
                  </Form.Item>
                </div>
              </Form>
            ),
          },
          {
            key: "cache",
            label: t("preferences.cache"),
            children: (
              <div className="preferences-panel">
                {error && <Alert type="error" message={error} showIcon />}
                <Form layout="vertical">
                  <Form.Item
                    label={t("preferences.proxyResolution")}
                    extra={t("preferences.proxyResolutionHint")}
                  >
                    <Select
                      value={proxyHeight}
                      onChange={(value) => setProxyHeight(value as PreviewProxyHeight)}
                      options={PREVIEW_PROXY_HEIGHTS.map((height) => ({
                        value: height,
                        label: previewProxyHeightLabel(height),
                      }))}
                    />
                  </Form.Item>
                </Form>
                <div className="preferences-cache-card">
                  <div>
                    <Typography.Text type="secondary">{t("preferences.cacheSize")}</Typography.Text>
                    <div className="preferences-cache-size">
                      {cache ? formatBytes(cache.sizeBytes) : "..."}
                    </div>
                  </div>
                  <div>
                    <Typography.Text type="secondary">{t("preferences.cacheFiles")}</Typography.Text>
                    <div className="preferences-cache-size">{cache?.fileCount ?? "..."}</div>
                  </div>
                </div>
                <Typography.Paragraph type="secondary" className="preferences-cache-path">
                  {cache?.path ?? ""}
                </Typography.Paragraph>
                <Space wrap>
                  <Button icon={<ReloadOutlined />} loading={cacheLoading} onClick={refreshCache}>
                    {t("preferences.refreshCache")}
                  </Button>
                  <Button
                    icon={<FolderOpenOutlined />}
                    disabled={!cache?.path}
                    onClick={() => openPreferencePath(cache?.path)}
                  >
                    {t("preferences.openProxyFolder")}
                  </Button>
                  <Button
                    danger
                    icon={<DeleteOutlined />}
                    loading={cacheClearing}
                    onClick={handleClearCache}
                  >
                    {t("preferences.clearCache")}
                  </Button>
                </Space>
              </div>
            ),
          },
          {
            key: "export",
            label: t("preferences.exportDefaults"),
            children: (
              <Form className="preferences-export-panel" layout="vertical">
                <section className="preferences-export-profile">
                  <div className="preferences-export-profile-main">
                    <Form.Item className="preferences-export-field" label={t("export.profile")}>
                      <Select
                        value={selectedProfileId ?? undefined}
                        placeholder={t("export.chooseProfile")}
                        onChange={handleProfileChange}
                        options={profiles.map((profile) => ({
                          value: profile.id,
                          label: profile.name,
                        }))}
                      />
                    </Form.Item>
                    {selectedProfile && (
                      <Typography.Paragraph
                        type="secondary"
                        className="preferences-profile-summary"
                      >
                        {profileSummary(selectedProfile.settings, settings, t)}
                      </Typography.Paragraph>
                    )}
                  </div>
                  <div className="preferences-export-profile-actions">
                    <Button
                      disabled={!selectedProfileId}
                      onClick={() => selectedProfileId && handleProfileChange(selectedProfileId)}
                    >
                      {t("export.applyProfile")}
                    </Button>
                    <Popconfirm
                      title={t("export.deleteProfileConfirm")}
                      okText={t("common.delete")}
                      cancelText={t("common.cancel")}
                      onConfirm={handleDeleteProfile}
                    >
                      <Button danger disabled={!selectedProfileId}>
                        {t("export.deleteProfile")}
                      </Button>
                    </Popconfirm>
                  </div>
                </section>
                <div className="preferences-export-grid">
                  <section className="preferences-export-section preferences-export-section-wide">
                    <Form.Item className="preferences-export-field" label={t("export.resolution")}>
                  <Select
                    value={resKey}
                    onChange={handleResolutionChange}
                    options={[
                      {
                        value: "project",
                        label: t("export.resProject", { w: settings.width, h: settings.height }),
                      },
                      { value: "2160", label: "2160p (3840×2160)" },
                      { value: "1080", label: "1080p (1920×1080)" },
                      { value: "720", label: "720p (1280×720)" },
                      { value: "480", label: "480p (854×480)" },
                    ]}
                  />
                </Form.Item>
                    <Form.Item
                      className="preferences-export-field"
                  label={labelWithInfo(t("export.encoder"), encoderHint(encoder, t))}
                >
                  <Select
                    value={encoder}
                    onChange={setEncoder}
                    options={encoderOptions}
                  />
                </Form.Item>
                  </section>

                  <section className="preferences-export-section">
                    <Form.Item className="preferences-export-field" label={t("export.rateControl")}>
                  <Segmented
                    block
                    value={rateControl}
                    onChange={(value) => setRateControl(value as ExportRateControl)}
                    options={[
                      { value: "crf", label: t("export.rateControlCrf") },
                      { value: "bitrate", label: t("export.rateControlBitrate") },
                    ]}
                  />
                </Form.Item>
                {rateControl === "crf" ? (
                  <>
                    <Form.Item className="preferences-export-field" label={t("export.quality")}>
                      <Select
                        value={quality}
                        onChange={handleQualityChange}
                        options={[
                          { value: "high", label: t("export.qualityHigh") },
                          { value: "medium", label: t("export.qualityMedium") },
                          { value: "low", label: t("export.qualityLow") },
                          { value: "custom", label: t("export.qualityCustom") },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item className="preferences-export-field" label={t("export.crf")}>
                      <div className="preferences-range-row">
                        <Slider
                          min={0}
                          max={51}
                          value={crf}
                          onChange={(value) => handleCrfChange(value as number)}
                          tooltip={{ formatter: (value) => `${value}` }}
                        />
                        <InputNumber min={0} max={51} value={crf} onChange={handleCrfChange} />
                      </div>
                    </Form.Item>
                  </>
                ) : (
                  <Form.Item className="preferences-export-field" label={t("export.videoBitrate")}>
                    <InputNumber
                      min={0.25}
                      max={200}
                      step={0.5}
                      value={Number((videoBitrateKbps / 1000).toFixed(2))}
                      onChange={handleVideoBitrateChange}
                      addonAfter="Mbps"
                      className="preferences-inline-number"
                    />
                  </Form.Item>
                )}
                  </section>

                  <section className="preferences-export-section">
                    <Form.Item className="preferences-export-field" label={t("export.audioBitrate")}>
                  <Select
                    value={audioBitrateKbps}
                    onChange={setAudioBitrateKbps}
                    options={[
                      { value: 96, label: "96 kbps" },
                      { value: 128, label: "128 kbps" },
                      { value: 192, label: "192 kbps" },
                      { value: 256, label: "256 kbps" },
                      { value: 320, label: "320 kbps" },
                    ]}
                  />
                    </Form.Item>
                    <Form.Item className="preferences-export-field" label={t("export.preset")}>
                  <Select
                    value={preset}
                    onChange={setPreset}
                    options={EXPORT_PRESETS.map((value) => ({ value, label: value }))}
                  />
                    </Form.Item>
                  </section>
                </div>

                <section className="preferences-export-save-profile">
                  <Form.Item className="preferences-export-field" label={t("export.profileName")}>
                    <Space.Compact className="preferences-save-profile-input">
                    <Input
                      value={profileName}
                      placeholder={t("export.profileNamePlaceholder")}
                      onChange={(e) => setProfileName(e.target.value)}
                      onPressEnter={handleSaveProfile}
                    />
                    <Button type="primary" disabled={!profileName.trim()} onClick={handleSaveProfile}>
                      {t("export.saveProfile")}
                    </Button>
                    </Space.Compact>
                  </Form.Item>
                </section>
              </Form>
            ),
          },
          {
            key: "logs",
            label: t("preferences.logs"),
            children: (
              <div className="preferences-panel">
                {error && <Alert type="error" message={error} showIcon />}
                <div className="preferences-log-paths">
                  <div>
                    <Typography.Text type="secondary">{t("preferences.logFolder")}</Typography.Text>
                    <Typography.Paragraph copyable className="preferences-log-path">
                      {logSnapshot?.directory ?? "..."}
                    </Typography.Paragraph>
                  </div>
                  <div>
                    <Typography.Text type="secondary">{t("preferences.sessionLog")}</Typography.Text>
                    <Typography.Paragraph copyable className="preferences-log-path">
                      {logSnapshot?.path ?? "..."}
                    </Typography.Paragraph>
                  </div>
                </div>
                <Space wrap>
                  <Button icon={<ReloadOutlined />} loading={logLoading} onClick={refreshLogs}>
                    {t("preferences.refreshLogs")}
                  </Button>
                  <Button
                    icon={<FolderOpenOutlined />}
                    disabled={!logSnapshot?.directory}
                    onClick={() => openPreferencePath(logSnapshot?.directory)}
                  >
                    {t("preferences.openLogFolder")}
                  </Button>
                </Space>
                <Input.TextArea
                  className="preferences-log-textarea"
                  readOnly
                  value={logSnapshot?.content ?? ""}
                  autoSize={{ minRows: 16, maxRows: 24 }}
                />
              </div>
            ),
          },
        ]}
      />
    </Modal>
  );
}

function labelWithInfo(label: string, info: string) {
  return (
    <span className="label-with-info">
      <span>{label}</span>
      <Tooltip title={info}>
        <InfoCircleOutlined />
      </Tooltip>
    </span>
  );
}

function encoderHint(
  encoder: ExportEncoder,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (encoder === "h264Nvenc") return t("export.encoderNvencHint");
  if (encoder === "h264Amf") return t("export.encoderAmfHint");
  return t("export.encoderX264Hint");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[idx]}`;
}

function profileSummary(
  profileSettings: SavedExportSettings,
  projectSettings: ProjectSettings,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const res = resolveResolution(profileSettings.resKey, projectSettings);
  const encoder =
    profileSettings.encoder === "h264Nvenc"
      ? t("export.encoderNvenc")
      : profileSettings.encoder === "h264Amf"
        ? t("export.encoderAmf")
        : t("export.encoderX264");
  const video =
    profileSettings.rateControl === "bitrate"
      ? `${Number((profileSettings.videoBitrateKbps / 1000).toFixed(2))} Mbps`
      : `${qualityLabel(profileSettings.quality, t)}, CRF ${profileSettings.crf}`;
  return `${res.width}×${res.height} · ${encoder} · ${video} · ${profileSettings.audioBitrateKbps} kbps`;
}

function qualityLabel(
  quality: QualityKey,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  switch (quality) {
    case "high":
      return t("export.qualityHigh");
    case "low":
      return t("export.qualityLow");
    case "custom":
      return t("export.qualityCustom");
    case "medium":
    default:
      return t("export.qualityMedium");
  }
}
