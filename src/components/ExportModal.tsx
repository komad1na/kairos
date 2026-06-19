import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Segmented,
  Select,
  Slider,
  Space,
  Tabs,
  Typography,
} from "antd";
import { useTranslation } from "react-i18next";
import { ProjectSettings } from "../types";
import { logInfo } from "../logger";
import {
  EXPORT_PRESETS,
  ExportProfile,
  ExportEncoder,
  ExportOptions,
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

interface Props {
  open: boolean;
  exporting: boolean;
  exportDone: boolean;
  exportResult: ExportResult | null;
  settings: ProjectSettings;
  progressPercent: number | null;
  progressEtaSec: number | null;
  onCancel: () => void;
  onExport: (opts: ExportOptions) => void;
}

export interface ExportResult {
  type: "success" | "error";
  message: string;
  description?: string;
}

/** Modal to choose export resolution and quality before rendering. */
export function ExportModal({
  open,
  exporting,
  exportDone,
  exportResult,
  settings,
  progressPercent,
  progressEtaSec,
  onCancel,
  onExport,
}: Props) {
  const { t } = useTranslation();
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

  useEffect(() => {
    if (open) {
      const saved = loadExportSettings(settings);
      applySavedSettings(saved);
      setProfiles(loadExportProfiles(settings));
      setSelectedProfileId(null);
      setProfileName("");
    }
  }, [open, settings]);

  function handleOk() {
    const res = resolveResolution(resKey, settings);
    saveExportSettings(currentSavedSettings());
    logInfo("export_modal:run", {
      resolution: res,
      encoder,
      rateControl,
      crf,
      videoBitrateKbps: rateControl === "bitrate" ? videoBitrateKbps : null,
      audioBitrateKbps,
      preset,
    });
    onExport({
      width: res.width,
      height: res.height,
      encoder,
      rateControl,
      crf,
      videoBitrateKbps: rateControl === "bitrate" ? videoBitrateKbps : null,
      audioBitrateKbps,
      preset,
    });
  }

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
    logInfo("export_modal:profile:apply", { id: profile.id, name: profile.name });
    applySavedSettings(profile.settings);
    saveExportSettings(profile.settings);
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
    logInfo("export_modal:profile:save", { id: saved.id, name: saved.name });
  }

  function handleDeleteProfile() {
    if (!selectedProfileId) return;
    const deleted = profiles.find((item) => item.id === selectedProfileId);
    const next = profiles.filter((item) => item.id !== selectedProfileId);
    saveExportProfiles(next);
    setProfiles(next);
    setSelectedProfileId(null);
    logInfo("export_modal:profile:delete", { id: selectedProfileId, name: deleted?.name });
  }

  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const progressMode = exporting || exportDone;
  const shownProgress = exportDone ? 100 : progressPercent;

  return (
    <Modal
      open={open}
      title={t("export.title")}
      okText={t("export.run")}
      cancelText={t("common.cancel")}
      confirmLoading={exporting}
      cancelButtonProps={{ disabled: exporting }}
      maskClosable={!exporting}
      closable={!exporting}
      width={560}
      footer={
        exporting
          ? null
          : exportDone
            ? [
                <Button key="close" type="primary" onClick={onCancel}>
                  {t("common.close")}
                </Button>,
              ]
            : undefined
      }
      onCancel={() => {
        if (!exporting) onCancel();
      }}
      onOk={handleOk}
    >
      {exportResult && (
        <Alert
          className="export-result-alert"
          type={exportResult.type}
          showIcon
          message={exportResult.message}
          description={exportResult.description}
        />
      )}
      {!progressMode && (
        <Tabs
          defaultActiveKey="basic"
          items={[
            {
              key: "basic",
              label: t("export.basic"),
              children:
                profiles.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("export.noProfiles")} />
                ) : (
                  <div className="export-basic-tab">
                    <Form layout="vertical">
                      <Form.Item label={t("export.profile")}>
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
                    </Form>
                    {selectedProfile && (
                      <div className="export-profile-summary">
                        <Typography.Text strong>{selectedProfile.name}</Typography.Text>
                        <Typography.Text type="secondary">
                          {profileSummary(selectedProfile.settings, settings, t)}
                        </Typography.Text>
                      </div>
                    )}
                    <Space>
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
                    </Space>
                  </div>
                ),
            },
            {
              key: "advanced",
              label: t("export.advanced"),
              children: (
                <Form layout="vertical">
                  <Form.Item label={t("export.resolution")}>
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
                    label={t("export.encoder")}
                    extra={
                      encoder === "h264Nvenc"
                        ? t("export.encoderNvencHint")
                        : t("export.encoderX264Hint")
                    }
                  >
                    <Select
                      value={encoder}
                      onChange={setEncoder}
                      options={[
                        { value: "x264", label: t("export.encoderX264") },
                        { value: "h264Nvenc", label: t("export.encoderNvenc") },
                      ]}
                    />
                  </Form.Item>
                  <Form.Item label={t("export.rateControl")}>
                    <Segmented
                      style={{ width: "100%" }}
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
                      <Form.Item label={t("export.quality")}>
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
                      <Form.Item label={t("export.crf")}>
                        <div className="export-range-row">
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
                    <Form.Item label={t("export.videoBitrate")}>
                      <InputNumber
                        min={0.25}
                        max={200}
                        step={0.5}
                        value={Number((videoBitrateKbps / 1000).toFixed(2))}
                        onChange={handleVideoBitrateChange}
                        addonAfter="Mbps"
                        style={{ width: 180 }}
                      />
                    </Form.Item>
                  )}
                  <Form.Item label={t("export.audioBitrate")}>
                    <Select
                      value={audioBitrateKbps}
                      onChange={setAudioBitrateKbps}
                      style={{ width: 180 }}
                      options={[
                        { value: 96, label: "96 kbps" },
                        { value: 128, label: "128 kbps" },
                        { value: 192, label: "192 kbps" },
                        { value: 256, label: "256 kbps" },
                        { value: 320, label: "320 kbps" },
                      ]}
                    />
                  </Form.Item>
                  <Form.Item label={t("export.preset")}>
                    <Select
                      value={preset}
                      onChange={setPreset}
                      options={EXPORT_PRESETS.map((value) => ({ value, label: value }))}
                    />
                  </Form.Item>
                  <Form.Item label={t("export.profileName")}>
                    <Space.Compact style={{ width: "100%" }}>
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
                </Form>
              ),
            },
          ]}
        />
      )}
      {progressMode && shownProgress != null && (
        <div className="export-modal-progress">
          <div className="export-modal-progress-row">
            <span>{t("export.progress")}</span>
            <strong>
              {Math.floor(shownProgress)}%
              {!exportDone && progressEtaSec != null && progressEtaSec > 0
                ? ` · ${t("status.exportEta", { time: formatEta(progressEtaSec) })}`
                : ""}
            </strong>
          </div>
          <div className="export-modal-progress-track">
            <div className="export-modal-progress-fill" style={{ width: `${shownProgress}%` }} />
          </div>
        </div>
      )}
    </Modal>
  );
}

function formatEta(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  const secs = whole % 60;
  return minutes > 0 ? `${minutes}m ${secs}s` : `${secs}s`;
}

function profileSummary(
  profileSettings: SavedExportSettings,
  projectSettings: ProjectSettings,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const res = resolveResolution(profileSettings.resKey, projectSettings);
  const encoder =
    profileSettings.encoder === "h264Nvenc" ? t("export.encoderNvenc") : t("export.encoderX264");
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
