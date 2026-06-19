import { memo, useCallback } from "react";
import { Button, Empty, List, Popconfirm, Tag, Tooltip, Typography } from "antd";
import {
  CustomerServiceOutlined,
  DeleteOutlined,
  ImportOutlined,
  LoadingOutlined,
  VideoCameraOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { Asset } from "../types";
import { Action } from "../timelineReducer";
import { generateThumbnail, pickMediaFile, probeVideo } from "../api";
import { ASSET_DND_TYPE, setActiveAssetDragId } from "../dragDrop";
import { logDebug, logError, logInfo } from "../logger";
import { assetFromInfo } from "../media";
import { formatTime } from "../timeline";

interface Props {
  assets: Asset[];
  dispatch: React.Dispatch<Action>;
  onStatus: (msg: string) => void;
  width: number;
  onResizeStart: (e: React.PointerEvent) => void;
  disabled?: boolean;
}

/** Left-hand media library: import files and drag them onto the timeline (US3). */
export const MediaLibrary = memo(function MediaLibrary({
  assets,
  dispatch,
  onStatus,
  width,
  onResizeStart,
  disabled = false,
}: Props) {
  const { t } = useTranslation();

  const handleImport = useCallback(async () => {
    try {
      const path = await pickMediaFile();
      if (!path) return;
      logInfo("media_import:selected", { path });
      onStatus(t("status.readingMetadata"));
      logDebug("media_import:probe:start", { path });
      const info = await probeVideo(path);
      logInfo("media_import:probe:ok", { path, info });
      const name = path.split(/[\\/]/).pop() ?? "clip";
      const asset = assetFromInfo(path, name, info);
      dispatch({ type: "addAsset", asset });
      onStatus(
        t("status.imported", {
          name,
          kind: t(`library.kind.${asset.kind}`),
          duration: formatTime(asset.duration),
        }),
      );
      if (asset.kind !== "audio" && asset.previewable) {
        try {
          logDebug("media_import:thumbnail:start", { path });
          const url = await generateThumbnail(path, Math.min(1, asset.duration / 2), 240);
          dispatch({ type: "setAssetThumbnail", assetId: asset.id, thumbnailUrl: url });
          logDebug("media_import:thumbnail:ok", { path });
        } catch (thumbError) {
          logError("media_import:thumbnail:error", thumbError);
          /* thumbnail is best-effort */
        }
      }
    } catch (e) {
      logError("media_import:error", e);
      onStatus(t("status.importError", { error: String(e) }));
    }
  }, [dispatch, onStatus, t]);

  const handleDeleteAsset = useCallback(
    (asset: Asset) => {
      logInfo("media_library:delete_asset", {
        id: asset.id,
        name: asset.name,
        path: asset.path,
      });
      dispatch({ type: "deleteAsset", assetId: asset.id });
      onStatus(t("library.removed", { name: asset.name }));
    },
    [dispatch, onStatus, t],
  );

  return (
    <div className="library" style={{ width, flexBasis: width }}>
      <div className="library-header">
        <Typography.Text strong>{t("library.title")}</Typography.Text>
        <Tooltip title={disabled ? t("library.createProjectFirst") : t("library.import")}>
          <Button
            size="small"
            type="primary"
            icon={<ImportOutlined />}
            onClick={handleImport}
            disabled={disabled}
          >
            {t("library.import")}
          </Button>
        </Tooltip>
      </div>
      <div className="library-list">
        {assets.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={disabled ? t("library.createProjectFirst") : t("library.empty")}
          />
        ) : (
          <List
            size="small"
            dataSource={assets}
            renderItem={(a) => {
              const cacheReady = Boolean(a.previewPath);
              return (
                <List.Item style={{ padding: 4, border: "none" }}>
                  <div
                    className={`library-item${cacheReady ? "" : " is-caching"}`}
                    draggable={cacheReady}
                    onDragStart={(e) => {
                      if (!cacheReady) {
                        e.preventDefault();
                        return;
                      }
                      setActiveAssetDragId(a.id);
                      e.dataTransfer.setData(ASSET_DND_TYPE, a.id);
                      e.dataTransfer.setData("text/plain", a.id);
                      e.dataTransfer.effectAllowed = "copy";
                      e.dataTransfer.setDragImage(e.currentTarget, 12, 12);
                    }}
                    onDragEnd={() => setActiveAssetDragId(null)}
                    aria-label={a.name}
                  >
                    <div className="library-thumb">
                      {a.thumbnailUrl ? (
                        <img src={a.thumbnailUrl} alt="" />
                      ) : a.kind === "audio" ? (
                        <CustomerServiceOutlined className="library-thumb-icon" />
                      ) : (
                        <VideoCameraOutlined className="library-thumb-icon" />
                      )}
                    </div>
                    <div className="library-meta">
                      <div className="library-name-row">
                        <Tooltip title={a.name}>
                          <div className="library-name">{a.name}</div>
                        </Tooltip>
                        <div
                          className="library-actions"
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <Popconfirm
                            title={t("library.deleteConfirm", { name: a.name })}
                            okText={t("common.delete")}
                            cancelText={t("common.cancel")}
                            onConfirm={() => handleDeleteAsset(a)}
                          >
                            <Tooltip title={t("library.delete")}>
                              <Button
                                className="library-delete"
                                size="small"
                                danger
                                type="text"
                                icon={<DeleteOutlined />}
                                aria-label={t("library.delete")}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </Tooltip>
                          </Popconfirm>
                        </div>
                      </div>
                      <div className="library-sub">
                        <Tag color={a.kind === "audio" ? "purple" : "blue"} bordered={false}>
                          {t(`library.kind.${a.kind}`)}
                        </Tag>
                        <div className="library-status-row">
                          {!cacheReady && (
                            <span className="library-cache-status">
                              <LoadingOutlined />
                              <span>{t("library.caching")}</span>
                            </span>
                          )}
                          {!a.previewable && (
                            <Tooltip title={t("library.notPreviewableHint")}>
                              <Tag icon={<WarningOutlined />} color="warning" bordered={false}>
                                {t("library.notPreviewable")}
                              </Tag>
                            </Tooltip>
                          )}
                        </div>
                        <Typography.Text type="secondary" className="library-dur">
                          {formatTime(a.duration)}
                        </Typography.Text>
                      </div>
                    </div>
                  </div>
                </List.Item>
              );
            }}
          />
        )}
      </div>
      <div
        className="library-resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-valuemin={240}
        aria-valuemax={520}
        aria-valuenow={width}
        onPointerDown={onResizeStart}
      />
    </div>
  );
});
