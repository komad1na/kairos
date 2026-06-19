import { useEffect, useState } from "react";
import { Form, InputNumber, Modal, Select, Space } from "antd";
import { useTranslation } from "react-i18next";
import { ProjectSettings } from "../types";

interface Props {
  open: boolean;
  settings: ProjectSettings;
  mode?: "create" | "edit";
  onCancel: () => void;
  onSave: (settings: ProjectSettings) => void;
}

const RES_PRESET_GROUPS = [
  {
    key: "horizontal",
    presets: [
      { value: "3840x2160", label: "3840×2160 (4K UHD)", w: 3840, h: 2160 },
      { value: "2560x1440", label: "2560×1440 (QHD)", w: 2560, h: 1440 },
      { value: "1920x1080", label: "1920×1080 (Full HD)", w: 1920, h: 1080 },
      { value: "1280x720", label: "1280×720 (HD)", w: 1280, h: 720 },
      { value: "854x480", label: "854×480 (SD)", w: 854, h: 480 },
    ],
  },
  {
    key: "vertical",
    presets: [
      { value: "2160x3840", label: "2160×3840 (4K vertical)", w: 2160, h: 3840 },
      { value: "1440x2560", label: "1440×2560 (QHD vertical)", w: 1440, h: 2560 },
      { value: "1080x1920", label: "1080×1920 (Full HD vertical)", w: 1080, h: 1920 },
      { value: "720x1280", label: "720×1280 (HD vertical)", w: 720, h: 1280 },
      { value: "480x854", label: "480×854 (SD vertical)", w: 480, h: 854 },
    ],
  },
] as const;

const RES_PRESETS: Map<string, { w: number; h: number }> = new Map(
  RES_PRESET_GROUPS.flatMap((group) =>
    group.presets.map((preset) => [preset.value, { w: preset.w, h: preset.h }] as const),
  ),
);

/** Modal to set the project canvas (resolution + fps) clips are composited into. */
export function ProjectSettingsModal({ open, settings, mode = "edit", onCancel, onSave }: Props) {
  const { t } = useTranslation();
  const [width, setWidth] = useState(settings.width);
  const [height, setHeight] = useState(settings.height);
  const [fps, setFps] = useState(settings.fps);

  useEffect(() => {
    if (open) {
      setWidth(settings.width);
      setHeight(settings.height);
      setFps(settings.fps);
    }
  }, [open, settings]);

  function applyPreset(key: string) {
    const p = RES_PRESETS.get(key);
    if (p) {
      setWidth(p.w);
      setHeight(p.h);
    }
  }

  return (
    <Modal
      open={open}
      title={mode === "create" ? t("project.createTitle") : t("project.title")}
      okText={mode === "create" ? t("project.create") : t("common.save")}
      cancelText={t("common.cancel")}
      onCancel={onCancel}
      onOk={() =>
        onSave({
          width: Math.max(2, Math.round(width)),
          height: Math.max(2, Math.round(height)),
          fps: Math.max(1, fps),
        })
      }
    >
      <Form layout="vertical">
        <Form.Item label={t("project.presets")}>
          <Select
            placeholder={t("project.choosePreset")}
            onChange={applyPreset}
            options={RES_PRESET_GROUPS.map((group) => ({
              label: t(`project.${group.key}`),
              options: group.presets.map((preset) => ({
                value: preset.value,
                label: preset.label,
              })),
            }))}
          />
        </Form.Item>
        <Form.Item label={t("project.resolution")}>
          <Space>
            <InputNumber min={2} value={width} onChange={(v) => setWidth(v ?? width)} />
            <span>×</span>
            <InputNumber min={2} value={height} onChange={(v) => setHeight(v ?? height)} />
          </Space>
        </Form.Item>
        <Form.Item label={t("project.fps")}>
          <InputNumber min={1} max={120} value={fps} onChange={(v) => setFps(v ?? fps)} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
