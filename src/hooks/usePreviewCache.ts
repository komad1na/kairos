import { useCallback, useEffect, useRef } from "react";
import type { Dispatch } from "react";
import { ensurePreviewCache, generateThumbnail, pathExists } from "../api";
import { logDebug, logError, logInfo } from "../logger";
import { loadPreviewProxyHeight } from "../previewProxySettings";
import type { Action } from "../timelineReducer";
import type { TimelineState } from "../types";

export function usePreviewCache(
  state: TimelineState,
  dispatch: Dispatch<Action>,
  setStatus: (message: string) => void,
) {
  const previewCacheJobs = useRef(new Set<string>());
  const checkedPreviewPaths = useRef(new Set<string>());

  // /tmp can be cleared between app sessions. If a saved project points to a
  // vanished preview proxy, drop the stale path so the cache builder recreates it.
  useEffect(() => {
    for (const asset of state.assets) {
      if (!asset.previewPath || checkedPreviewPaths.current.has(asset.previewPath)) continue;
      const checkedPath = asset.previewPath;
      checkedPreviewPaths.current.add(checkedPath);
      void pathExists(checkedPath)
        .then((exists) => {
          if (exists) return;
          logInfo("preview_cache:missing", { asset: asset.name, previewPath: checkedPath });
          dispatch({ type: "setAssetPreviewPath", assetId: asset.id, previewPath: null });
        })
        .catch((e) => {
          checkedPreviewPaths.current.delete(checkedPath);
          logError("preview_cache:exists_check:error", {
            asset: asset.name,
            previewPath: checkedPath,
            error: String(e),
          });
        });
    }
  }, [dispatch, state.assets]);

  // Build editor-friendly preview files for any asset that does not have one.
  useEffect(() => {
    const proxyHeight = loadPreviewProxyHeight();
    for (const asset of state.assets) {
      if (asset.previewPath || previewCacheJobs.current.has(asset.id)) continue;
      previewCacheJobs.current.add(asset.id);
      setStatus(`Creating preview cache for ${asset.name}...`);
      logInfo("preview_cache:start", { asset: asset.name, path: asset.path, proxyHeight });
      void ensurePreviewCache(asset.path, proxyHeight)
        .then((previewPath) => {
          dispatch({ type: "setAssetPreviewPath", assetId: asset.id, previewPath });
          setStatus(`Preview cache ready: ${asset.name}`);
          logInfo("preview_cache:ok", { asset: asset.name, previewPath, proxyHeight });
        })
        .catch((e) => {
          setStatus(`Preview cache failed for ${asset.name}: ${String(e)}`);
          logError("preview_cache:error", { asset: asset.name, error: String(e) });
        })
        .finally(() => {
          previewCacheJobs.current.delete(asset.id);
        });
    }
  }, [dispatch, setStatus, state.assets]);

  const regenerateThumbnails = useCallback(
    async (s: TimelineState) => {
      for (const asset of s.assets) {
        if (asset.kind === "audio" || !asset.previewable || asset.thumbnailUrl) continue;
        try {
          logDebug("thumbnail_regenerate:start", { asset: asset.name, path: asset.path });
          const url = await generateThumbnail(asset.path, Math.min(1, asset.duration / 2), 240);
          dispatch({ type: "setAssetThumbnail", assetId: asset.id, thumbnailUrl: url });
          logDebug("thumbnail_regenerate:ok", { asset: asset.name });
        } catch (e) {
          logError("thumbnail_regenerate:error", { asset: asset.name, error: String(e) });
        }
      }
    },
    [dispatch],
  );

  const clearPreviewPaths = useCallback(() => {
    dispatch({ type: "clearAssetPreviewPaths" });
  }, [dispatch]);

  return { regenerateThumbnails, clearPreviewPaths };
}
