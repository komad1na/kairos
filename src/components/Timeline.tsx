import { memo, useEffect, useRef, useState } from "react";
import { Button, Empty, InputNumber, Slider, Switch, Tooltip } from "antd";
import {
  DeleteOutlined,
  PlusOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { Asset, Clip, TimelineState, Track, TrackKind } from "../types";
import { Action } from "../timelineReducer";
import { getActiveAssetDragId, readAssetDragId, setActiveAssetDragId } from "../dragDrop";
import { clamp, formatTime, placeClip, placePair, snapAnchors, snapTime, timelineDuration } from "../timeline";
import { TimelineClip } from "./TimelineClip";
import { tickStep, buildTicks } from "./timelineTicks";
import { useTimelineDrag } from "./useTimelineDrag";

const RULER_H = 34;
const TRACK_H = 60;
const HEADER_W = 150;
const SNAP_PX = 8;
const DROP_SNAP_MIN_SEC = 0.25;
const MIN_CLIP_LEN = 0.1;
const MIN_PX_PER_SEC = 10;
const MAX_PX_PER_SEC = 300;
const LABEL_TICK_MIN_PX = 58;
const MINOR_TICK_MIN_PX = 24;

interface Props {
  state: TimelineState;
  playhead: number;
  dispatch: React.Dispatch<Action>;
  onSeek: (t: number) => void;
}

interface RulerScrub {
  pointerId: number;
  target: HTMLElement;
}

interface DropPreviewClip {
  id: string;
  trackId: string;
  kind: TrackKind;
  name: string;
  start: number;
  length: number;
  valid: boolean;
}

export const Timeline = memo(function Timeline({ state, playhead, dispatch, onSeek }: Props) {
  const { t } = useTranslation();
  const timelineRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const rulerScrubRef = useRef<RulerScrub | null>(null);
  const [dropPreview, setDropPreview] = useState<DropPreviewClip[]>([]);

  // Refs so the window drag listeners always read the freshest values.
  const stateRef = useRef(state);
  stateRef.current = state;
  const playheadRef = useRef(playhead);
  playheadRef.current = playhead;

  const { tracks, clips, assets, pxPerSec, selectedClipId } = state;
  const total = timelineDuration(clips);
  const contentWidth = Math.max(total * pxPerSec, 600);
  const assetOf = (clip: Clip): Asset | undefined => assets.find((a) => a.id === clip.assetId);

  const { startMove, startTrim } = useTimelineDrag(stateRef, playheadRef, dispatch);

  function setZoom(value: number | null) {
    if (value == null) return;
    dispatch({ type: "setPxPerSec", value });
  }

  useEffect(() => {
    const timeline = timelineRef.current;
    if (!timeline) return;
    const timelineElement = timeline;

    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey) return;
      const target = e.target instanceof Element ? e.target : null;
      const lane = target?.closest(".lane");
      if (!lane || !timelineElement.contains(lane)) return;
      e.preventDefault();
      e.stopPropagation();
      zoomFromWheel(e);
    }

    timelineElement.addEventListener("wheel", onWheel, { passive: false });
    return () => timelineElement.removeEventListener("wheel", onWheel);
  }, [dispatch]);

  useEffect(() => {
    const ruler = rulerRef.current;
    if (!ruler) return;

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      e.stopPropagation();
      seekFromRulerWheel(e);
    }

    ruler.addEventListener("wheel", onWheel, { passive: false });
    return () => ruler.removeEventListener("wheel", onWheel);
  }, [onSeek]);

  function seekFromEvent(e: React.PointerEvent, clearSelection = false) {
    if (clearSelection && stateRef.current.selectedClipId) {
      dispatch({ type: "select", id: null });
    }
    seekToClientX(e.clientX);
  }

  function seekToClientX(clientX: number) {
    const rect = contentRef.current?.getBoundingClientRect();
    if (!rect) return;
    const st = stateRef.current;
    onSeek(clamp((clientX - rect.left) / st.pxPerSec, 0, Math.max(timelineDuration(st.clips), 0)));
  }

  function startRulerScrub(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || !e.isPrimary) return;
    e.preventDefault();
    if (stateRef.current.selectedClipId) {
      dispatch({ type: "select", id: null });
    }
    const target = e.currentTarget;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      /* best-effort: move/up handlers still run while pointer stays over ruler */
    }
    rulerScrubRef.current = { pointerId: e.pointerId, target };
    seekToClientX(e.clientX);
  }

  function updateRulerScrub(e: React.PointerEvent<HTMLDivElement>) {
    const scrub = rulerScrubRef.current;
    if (!scrub || scrub.pointerId !== e.pointerId) return;
    if (e.buttons === 0) {
      finishRulerScrub(e.pointerId);
      return;
    }
    e.preventDefault();
    seekToClientX(e.clientX);
  }

  function finishRulerScrub(pointerId: number) {
    const scrub = rulerScrubRef.current;
    if (!scrub || scrub.pointerId !== pointerId) return;
    try {
      if (scrub.target.hasPointerCapture(scrub.pointerId)) {
        scrub.target.releasePointerCapture(scrub.pointerId);
      }
    } catch {
      /* pointer capture can be gone if the webview lost focus */
    }
    rulerScrubRef.current = null;
  }

  function zoomFromWheel(e: WheelEvent) {
    const st = stateRef.current;
    const scroll = scrollRef.current;
    const content = contentRef.current;
    if (!scroll || !content) return;

    const rawDelta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (rawDelta === 0) return;

    const wheelUnits =
      e.deltaMode === 0
        ? clamp(Math.abs(rawDelta) / 100, 0.25, 4)
        : clamp(Math.abs(rawDelta), 1, 4);
    const direction = rawDelta < 0 ? 1 : -1;
    const nextPxPerSec = clamp(
      st.pxPerSec * Math.pow(1.12, direction * wheelUnits),
      MIN_PX_PER_SEC,
      MAX_PX_PER_SEC,
    );
    if (nextPxPerSec === st.pxPerSec) return;

    const contentRect = content.getBoundingClientRect();
    const scrollRect = scroll.getBoundingClientRect();
    const anchorTime = Math.max(0, (e.clientX - contentRect.left) / st.pxPerSec);
    const anchorViewportX = e.clientX - scrollRect.left;

    dispatch({ type: "setPxPerSec", value: nextPxPerSec });
    requestAnimationFrame(() => {
      scroll.scrollLeft = Math.max(0, anchorTime * nextPxPerSec - anchorViewportX);
    });
  }

  function seekFromRulerWheel(e: WheelEvent) {
    const st = stateRef.current;
    const maxTime = timelineDuration(st.clips);
    if (maxTime <= 0) return;

    const rawDelta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (rawDelta === 0) return;

    const fps = Math.max(1, st.settings.fps || 30);
    const frame = 1 / fps;
    const baseStep = e.altKey ? frame : clamp(tickStep(st.pxPerSec, LABEL_TICK_MIN_PX) / 4, frame, 1);
    const speed = e.shiftKey ? 5 : 1;
    const wheelUnits =
      e.deltaMode === 0
        ? clamp(Math.abs(rawDelta) / 100, 0.25, 4)
        : clamp(Math.abs(rawDelta), 1, 4);
    const direction = rawDelta > 0 ? 1 : -1;

    onSeek(clamp(playheadRef.current + direction * baseStep * speed * wheelUnits, 0, maxTime));
  }

  function onLaneDrop(e: React.DragEvent, track: Track) {
    e.preventDefault();
    setDropPreview([]);
    const assetId = readAssetDragId(e.dataTransfer);
    setActiveAssetDragId(null);
    const asset = stateRef.current.assets.find((a) => a.id === assetId);
    if (!asset) return;
    if (!canDropAssetOnTrack(asset, track)) return;
    const start = dropStartFromEvent(e);
    dispatch({ type: "dropAsset", asset, trackId: track.id, start });
    requestAnimationFrame(() => onSeek(start));
  }

  function onLaneDragOver(e: React.DragEvent, track: Track) {
    const assetId = dragAssetId(e);
    const asset = assetId ? stateRef.current.assets.find((a) => a.id === assetId) : null;
    if (!asset) return;

    e.preventDefault();
    const preview = dropPreviewFromEvent(e, asset, track);
    e.dataTransfer.dropEffect = preview.some((item) => item.valid) ? "copy" : "none";
    setDropPreview(preview);
  }

  function onTimelineDragLeave(e: React.DragEvent) {
    const next = e.relatedTarget as Node | null;
    if (next && e.currentTarget.contains(next)) return;
    setDropPreview([]);
  }

  function dropStartFromEvent(e: React.DragEvent): number {
    const st = stateRef.current;
    if (st.clips.length === 0) return 0;

    const rect = contentRef.current?.getBoundingClientRect();
    if (!rect) return 0;

    const raw = Math.max(0, (e.clientX - rect.left) / st.pxPerSec);
    const anchors = snapAnchors(st, playheadRef.current);
    const threshold = Math.max(SNAP_PX / st.pxPerSec, DROP_SNAP_MIN_SEC);
    const snapped = snapTime(raw, anchors, threshold, e.altKey);
    return snapped < DROP_SNAP_MIN_SEC ? 0 : snapped;
  }

  function dropPreviewFromEvent(
    e: React.DragEvent,
    asset: Asset,
    target: Track,
  ): DropPreviewClip[] {
    const st = stateRef.current;
    const rawStart = dropStartFromEvent(e);
    const length = Math.max(asset.duration, MIN_CLIP_LEN);
    const invalid = () => [
      {
        id: `${asset.id}:${target.id}:invalid`,
        trackId: target.id,
        kind: target.kind,
        name: asset.name,
        start: rawStart,
        length,
        valid: false,
      },
    ];

    if (!canDropAssetOnTrack(asset, target)) return invalid();

    if (asset.kind === "video" || asset.kind === "audio") {
      const start = placeClip(st.clips, target.id, rawStart, length);
      return [
        {
          id: `${asset.id}:${target.id}`,
          trackId: target.id,
          kind: target.kind,
          name: asset.name,
          start,
          length,
          valid: true,
        },
      ];
    }

    const videoTrack = target.kind === "video" ? target : st.tracks.find((tr) => tr.kind === "video");
    const audioTrack = target.kind === "audio" ? target : st.tracks.find((tr) => tr.kind === "audio");
    if (!videoTrack || !audioTrack) return invalid();

    const start = placePair(st.clips, videoTrack.id, audioTrack.id, rawStart, length, length);

    return [
      {
        id: `${asset.id}:${videoTrack.id}`,
        trackId: videoTrack.id,
        kind: "video",
        name: asset.name,
        start,
        length,
        valid: true,
      },
      {
        id: `${asset.id}:${audioTrack.id}`,
        trackId: audioTrack.id,
        kind: "audio",
        name: asset.name,
        start,
        length,
        valid: true,
      },
    ];
  }

  const labelStep = tickStep(pxPerSec, LABEL_TICK_MIN_PX);
  const minorStep = tickStep(pxPerSec, MINOR_TICK_MIN_PX);
  const labelTicks = buildTicks(total, labelStep);
  const labelTickKeys = new Set(labelTicks.map((tick) => tick.toFixed(3)));
  const minorTicks = buildTicks(total, minorStep).filter(
    (tick) => !labelTickKeys.has(tick.toFixed(3)),
  );

  return (
    <div ref={timelineRef} className="timeline">
      {/* Controls bar */}
      <div className="timeline-toolbar">
        <Button
          size="small"
          icon={<PlusOutlined />}
          onClick={() => dispatch({ type: "addTrack", kind: "video" })}
        >
          {t("timeline.addVideoTrack")}
        </Button>
        <Button
          size="small"
          icon={<PlusOutlined />}
          onClick={() => dispatch({ type: "addTrack", kind: "audio" })}
        >
          {t("timeline.addAudioTrack")}
        </Button>
        <div className="spacer" />
        <div className="timeline-zoom">
          <Tooltip title={t("toolbar.zoomOut")}>
            <Button
              size="small"
              icon={<ZoomOutOutlined />}
              onClick={() => setZoom(pxPerSec / 1.15)}
            />
          </Tooltip>
          <Slider
            className="timeline-zoom-slider"
            min={MIN_PX_PER_SEC}
            max={MAX_PX_PER_SEC}
            step={5}
            value={pxPerSec}
            onChange={(v) => setZoom(v as number)}
            tooltip={{ formatter: (v) => `${v}px/s` }}
          />
          <Tooltip title={t("toolbar.zoomIn")}>
            <Button
              size="small"
              icon={<ZoomInOutlined />}
              onClick={() => setZoom(pxPerSec * 1.15)}
            />
          </Tooltip>
          <InputNumber
            size="small"
            min={MIN_PX_PER_SEC}
            max={MAX_PX_PER_SEC}
            step={5}
            value={Math.round(pxPerSec)}
            onChange={setZoom}
            addonAfter="px/s"
          />
        </div>
      </div>

      <div className="timeline-body">
        {/* Track headers */}
        <div className="track-headers" style={{ width: HEADER_W }}>
          <div className="track-headers-spacer" style={{ height: RULER_H }} />
          {tracks.map((tr) => (
            <div key={tr.id} className="track-header" style={{ height: TRACK_H }}>
              <div className="track-header-row">
                <span className="track-name">{tr.name}</span>
                <Tooltip title={t("timeline.removeTrack")}>
                  <Button
                    size="small"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => {
                      const hasClips = clips.some((c) => c.trackId === tr.id);
                      if (!hasClips || confirm(t("timeline.removeTrackConfirm", { name: tr.name }))) {
                        dispatch({ type: "removeTrack", id: tr.id });
                      }
                    }}
                  />
                </Tooltip>
              </div>
              {tr.kind === "audio" && (
                <div className="track-header-row">
                  <Tooltip title={t("timeline.mute")}>
                    <Switch
                      size="small"
                      checked={tr.muted}
                      onChange={(v) => dispatch({ type: "setTrackMuted", id: tr.id, muted: v })}
                    />
                  </Tooltip>
                  <Slider
                    style={{ flex: 1, margin: "0 8px" }}
                    min={0}
                    max={200}
                    value={Math.round(tr.volume * 100)}
                    tooltip={{ formatter: (v) => `${v}%` }}
                    onChange={(v) =>
                      dispatch({ type: "setTrackVolume", id: tr.id, volume: (v as number) / 100 })
                    }
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Scrollable lanes */}
        <div ref={scrollRef} className="timeline-scroll" onDragLeave={onTimelineDragLeave}>
          <div ref={contentRef} className="timeline-content" style={{ width: contentWidth }}>
            <div
              ref={rulerRef}
              className="ruler"
              style={{ height: RULER_H }}
              onPointerDown={startRulerScrub}
              onPointerMove={updateRulerScrub}
              onPointerUp={(e) => finishRulerScrub(e.pointerId)}
              onPointerCancel={(e) => finishRulerScrub(e.pointerId)}
            >
              {minorTicks.map((tick) => (
                <div key={`minor-${tick}`} className="tick minor" style={{ left: tick * pxPerSec }} />
              ))}
              {labelTicks.map((tick) => (
                <div key={tick} className="tick" style={{ left: tick * pxPerSec }}>
                  <span>{formatTime(tick)}</span>
                </div>
              ))}
            </div>

            {tracks.map((tr) => (
              <div
                key={tr.id}
                className={`lane ${tr.kind}`}
                data-track-id={tr.id}
                data-kind={tr.kind}
                style={{ height: TRACK_H }}
                onPointerDown={(e) => seekFromEvent(e, true)}
                onDragOver={(e) => onLaneDragOver(e, tr)}
                onDrop={(e) => onLaneDrop(e, tr)}
              >
                {dropPreview
                  .filter((preview) => preview.trackId === tr.id)
                  .map((preview) => (
                    <div
                      key={preview.id}
                      className={`drop-preview ${preview.kind}${preview.valid ? "" : " invalid"}`}
                      style={{
                        left: preview.start * pxPerSec,
                        width: Math.max(preview.length * pxPerSec, 24),
                      }}
                    >
                      <span>{preview.name}</span>
                    </div>
                  ))}
                {clips
                  .filter((c) => c.trackId === tr.id)
                  .map((clip) => (
                    <TimelineClip
                      key={clip.id}
                      clip={clip}
                      asset={assetOf(clip)}
                      trackKind={tr.kind}
                      pxPerSec={pxPerSec}
                      laneHeight={TRACK_H}
                      selected={clip.id === selectedClipId}
                      onStartMove={startMove}
                      onStartTrim={startTrim}
                    />
                  ))}
              </div>
            ))}

            <div
              className="playhead"
              style={{ left: playhead * pxPerSec, height: RULER_H + tracks.length * TRACK_H }}
            />
          </div>
        </div>
      </div>

      {clips.length === 0 && (
        <div className="timeline-empty">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("timeline.empty")} />
        </div>
      )}
    </div>
  );
});

function canDropAssetOnTrack(asset: Asset, track: Track): boolean {
  if (!asset.previewPath) return false;
  return asset.kind === "both" || asset.kind === track.kind;
}

function dragAssetId(e: React.DragEvent): string | null {
  const activeId = getActiveAssetDragId();
  if (activeId) return activeId;
  return readAssetDragId(e.dataTransfer);
}
