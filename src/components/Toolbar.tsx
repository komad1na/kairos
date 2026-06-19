import { memo } from "react";
import { Button, Dropdown, Tooltip } from "antd";
import type { MenuProps } from "antd";
import {
  BorderOutlined,
  BorderOuterOutlined,
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  DownloadOutlined,
  FileAddOutlined,
  FolderOpenOutlined,
  MinusOutlined,
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
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onCloseWindow: () => void;
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
  onMinimize,
  onToggleMaximize,
  onCloseWindow,
}: Props) {
  const { t } = useTranslation();

  const projectItems: MenuProps["items"] = [
    {
      key: "new",
      icon: <FileAddOutlined />,
      label: t("project.new"),
      onClick: onNew,
    },
    {
      key: "open",
      icon: <FolderOpenOutlined />,
      label: t("project.open"),
      onClick: onOpen,
    },
    {
      key: "save",
      icon: <SaveOutlined />,
      label: t("project.save"),
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
      label: t("preferences.title"),
      onClick: onPreferences,
    },
  ];

  const editItems: MenuProps["items"] = [
    {
      key: "undo",
      icon: <UndoOutlined />,
      label: t("toolbar.undo"),
      disabled: !canUndo,
      onClick: onUndo,
    },
    {
      key: "redo",
      icon: <RedoOutlined />,
      label: t("toolbar.redo"),
      disabled: !canRedo,
      onClick: onRedo,
    },
    { type: "divider" },
    {
      key: "split-clip",
      icon: <ScissorOutlined />,
      label: t("timeline.splitClip"),
      disabled: !hasSelectedClip,
      onClick: onSplitClip,
    },
    {
      key: "edit-open",
      icon: <ToolOutlined />,
      label: editOpen ? t("timeline.closeEdit") : t("timeline.openEdit"),
      disabled: !hasSelectedClip && !editOpen,
      onClick: editOpen ? onCloseEdit : onOpenEdit,
    },
    {
      key: "delete-selected",
      icon: <DeleteOutlined />,
      label: t("timeline.deleteClip"),
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
      label: t("toolbar.timelineZoomIn"),
      onClick: onTimelineZoomIn,
    },
    {
      key: "zoom-out",
      icon: <ZoomOutOutlined />,
      label: t("toolbar.timelineZoomOut"),
      onClick: onTimelineZoomOut,
    },
  ];

  return (
    <header className="toolbar">
      <div className="brand-mark" data-tauri-drag-region onDoubleClick={onToggleMaximize}>
        <span className="brand-symbol">K</span>
        <span className="brand-name">{t("app.title")}</span>
      </div>

      <nav className="menu-bar" aria-label={t("toolbar.mainMenu")}>
        <MenuButton label={t("toolbar.project")} items={projectItems} />
        <MenuButton label={t("toolbar.edit")} items={editItems} />
        <MenuButton label={t("toolbar.view")} items={viewItems} />
      </nav>

      <div
        className="titlebar-drag-region"
        data-tauri-drag-region
        onDoubleClick={onToggleMaximize}
      />

      <Button
        className="topbar-export"
        size="small"
        type="primary"
        icon={<DownloadOutlined />}
        disabled={!hasProject || !hasClips || exporting}
        loading={exporting}
        onClick={onExport}
      >
        {t("toolbar.export")}
      </Button>

      <div className="window-controls">
        <Tooltip title={t("toolbar.minimize")}>
          <Button
            className="window-control"
            size="small"
            type="text"
            icon={<MinusOutlined />}
            onClick={onMinimize}
          />
        </Tooltip>
        <Tooltip title={t("toolbar.maximizeRestore")}>
          <Button
            className="window-control"
            size="small"
            type="text"
            icon={<BorderOutlined />}
            onClick={onToggleMaximize}
          />
        </Tooltip>
        <Tooltip title={t("toolbar.closeWindow")}>
          <Button
            className="window-control close"
            size="small"
            type="text"
            icon={<CloseOutlined />}
            onClick={onCloseWindow}
          />
        </Tooltip>
      </div>
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
