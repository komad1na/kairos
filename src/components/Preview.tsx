import { memo, useRef } from "react";
import { Empty } from "antd";
import { useTranslation } from "react-i18next";
import { ProjectSettings, Track, TrackKind } from "../types";

interface Props {
  tracks: Track[];
  settings: ProjectSettings;
  /** Register/unregister a track's media element with the playback engine. */
  attach: (trackId: string, kind: TrackKind, el: HTMLMediaElement | null) => void;
  hasClips: boolean;
  showCanvasGuide: boolean;
}

/**
 * The preview area hosts one webview media element per track. Active video
 * tracks are layered top-to-bottom inside a frame sized to the project
 * resolution; audio elements are hidden. The {@link PlaybackEngine} drives and
 * positions them.
 */
export const Preview = memo(function Preview({
  tracks,
  settings,
  attach,
  hasClips,
  showCanvasGuide,
}: Props) {
  const { t } = useTranslation();
  const refCbs = useRef(new Map<string, (el: HTMLMediaElement | null) => void>());

  function refFor(trackId: string, kind: TrackKind) {
    let cb = refCbs.current.get(trackId);
    if (!cb) {
      cb = (el: HTMLMediaElement | null) => attach(trackId, kind, el);
      refCbs.current.set(trackId, cb);
    }
    return cb;
  }

  return (
    <div className="preview">
      <div
        className={`preview-frame${showCanvasGuide ? " guide-on" : ""}`}
        style={{ aspectRatio: `${settings.width} / ${settings.height}` }}
      >
        {tracks.map((tr) =>
          tr.kind === "video" ? (
            <video
              key={tr.id}
              ref={refFor(tr.id, "video")}
              className="preview-video"
              muted
              playsInline
              preload="auto"
            />
          ) : (
            <audio key={tr.id} ref={refFor(tr.id, "audio")} preload="auto" />
          ),
        )}
        {!hasClips && (
          <div className="preview-placeholder">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <>
                  <div>{t("preview.noVideo")}</div>
                  <small>{t("preview.hint")}</small>
                </>
              }
            />
          </div>
        )}
      </div>
    </div>
  );
});
