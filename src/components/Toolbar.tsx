import { memo } from "react";
import { Button, Dropdown, Tooltip } from "antd";
import type { MenuProps } from "antd";
import {
  BorderOuterOutlined,
  CheckOutlined,
  DeleteOutlined,
  DownloadOutlined,
  FileAddOutlined,
  FolderOpenOutlined,
  RedoOutlined,
  SaveOutlined,
  ScissorOutlined,
  SettingOutlined,
  ToolOutlined,
  UndoOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";

interface Props {
  exporting: boolean;
  hasProject: boolean;
  hasClips: boolean;
  hasSelectedClip: boolean;
  canUndo: boolean;
  canRedo: boolean;
  editOpen: boolean;
  showCanvasGuide: boolean;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSettings: () => void;
  onPreferences: () => void;
  onExport: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenEdit: () => void;
  onCloseEdit: () => void;
  onSplitClip: () => void;
  onDeleteSelected: () => void;
  onToggleCanvasGuide: () => void;
  onTimelineZoomIn: () => void;
  onTimelineZoomOut: () => void;
}

export const Toolbar = memo(function Toolbar({
  exporting,
  hasProject,
  hasClips,
  hasSelectedClip,
  canUndo,
  canRedo,
  editOpen,
  showCanvasGuide,
  onNew,
  onOpen,
  onSave,
  onSettings,
  onPreferences,
  onExport,
  onUndo,
  onRedo,
  onOpenEdit,
  onCloseEdit,
  onSplitClip,
  onDeleteSelected,
  onToggleCanvasGuide,
  onTimelineZoomIn,
  onTimelineZoomOut,
}: Props) {
  const { t } = useTranslation();
  const editLabel = editOpen ? t("timeline.closeEdit") : t("timeline.openEdit");

  const projectItems: MenuProps["items"] = [
    {
      key: "new",
      icon: <FileAddOutlined />,
      label: <ShortcutLabel label={t("project.new")} shortcut="Ctrl+N" />,
      onClick: onNew,
    },
    {
      key: "open",
      icon: <FolderOpenOutlined />,
      label: <ShortcutLabel label={t("project.open")} shortcut="Ctrl+O" />,
      onClick: onOpen,
    },
    {
      key: "save",
      icon: <SaveOutlined />,
      label: <ShortcutLabel label={t("project.save")} shortcut="Ctrl+S" />,
      disabled: !hasProject,
      onClick: onSave,
    },
    { type: "divider" },
    {
      key: "settings",
      icon: <SettingOutlined />,
      label: t("project.settings"),
      disabled: !hasProject,
      onClick: onSettings,
    },
    {
      key: "preferences",
      icon: <ToolOutlined />,
      label: <ShortcutLabel label={t("preferences.title")} shortcut="Ctrl+," />,
      onClick: onPreferences,
    },
  ];

  const editItems: MenuProps["items"] = [
    {
      key: "undo",
      icon: <UndoOutlined />,
      label: <ShortcutLabel label={t("toolbar.undo")} shortcut="Ctrl+Z" />,
      disabled: !canUndo,
      onClick: onUndo,
    },
    {
      key: "redo",
      icon: <RedoOutlined />,
      label: <ShortcutLabel label={t("toolbar.redo")} shortcut="Ctrl+Y" />,
      disabled: !canRedo,
      onClick: onRedo,
    },
    { type: "divider" },
    {
      key: "split-clip",
      icon: <ScissorOutlined />,
      label: <ShortcutLabel label={t("timeline.splitClip")} shortcut="S" />,
      disabled: !hasSelectedClip,
      onClick: onSplitClip,
    },
    {
      key: "edit-open",
      icon: <ToolOutlined />,
      label: hasSelectedClip ? (
        editLabel
      ) : (
        <Tooltip title={t("timeline.selectClipForEdit")} placement="right">
          <span>{editLabel}</span>
        </Tooltip>
      ),
      disabled: !hasSelectedClip,
      onClick: editOpen ? onCloseEdit : onOpenEdit,
    },
    {
      key: "delete-selected",
      icon: <DeleteOutlined />,
      label: <ShortcutLabel label={t("timeline.deleteClip")} shortcut="Del" />,
      danger: true,
      disabled: !hasSelectedClip,
      onClick: onDeleteSelected,
    },
  ];

  const viewItems: MenuProps["items"] = [
    {
      key: "canvas-guide",
      icon: showCanvasGuide ? <CheckOutlined /> : <BorderOuterOutlined />,
      label: showCanvasGuide ? t("preview.hideCanvasGuide") : t("preview.showCanvasGuide"),
      onClick: onToggleCanvasGuide,
    },
    { type: "divider" },
    {
      key: "zoom-in",
      icon: <ZoomInOutlined />,
      label: <ShortcutLabel label={t("toolbar.timelineZoomIn")} shortcut="Ctrl+=" />,
      onClick: onTimelineZoomIn,
    },
    {
      key: "zoom-out",
      icon: <ZoomOutOutlined />,
      label: <ShortcutLabel label={t("toolbar.timelineZoomOut")} shortcut="Ctrl+-" />,
      onClick: onTimelineZoomOut,
    },
  ];

  return (
    <header className="toolbar">
      <div className="brand-mark">
        <span className="brand-symbol">K</span>
        <span className="brand-name">{t("app.title")}</span>
      </div>

      <nav className="menu-bar" aria-label={t("toolbar.mainMenu")}>
        <MenuButton label={t("toolbar.project")} items={projectItems} />
        <MenuButton label={t("toolbar.edit")} items={editItems} />
        <MenuButton label={t("toolbar.view")} items={viewItems} />
      </nav>

      <div className="toolbar-spacer" />

      <Button
        className="topbar-export"
        size="small"
        type="primary"
        icon={<DownloadOutlined />}
        disabled={!hasProject || !hasClips || exporting}
        loading={exporting}
        onClick={onExport}
        title="Ctrl+E"
      >
        {t("toolbar.export")}
      </Button>
    </header>
  );
});

function MenuButton({
  label,
  items,
  loading,
}: {
  label: string;
  items: MenuProps["items"];
  loading?: boolean;
}) {
  return (
    <Dropdown menu={{ items }} trigger={["click"]}>
      <Button className="menu-trigger" size="small" type="text" loading={loading}>
        {label}
      </Button>
    </Dropdown>
  );
}

function ShortcutLabel({ label, shortcut }: { label: string; shortcut: string }) {
  return (
    <span className="menu-item-with-shortcut">
      <span>{label}</span>
      <kbd>{shortcut}</kbd>
    </span>
  );
}
