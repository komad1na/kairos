import { Tooltip } from "antd";
import { AudioMutedOutlined, LinkOutlined, WarningOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { Asset, Clip, ClipTransitionStyle, TrackKind, clipLength } from "../types";
import { formatTime } from "../timeline";
import { Waveform } from "./Waveform";

interface Props {
  clip: Clip;
  asset: Asset | undefined;
  trackKind: TrackKind;
  pxPerSec: number;
  laneHeight: number;
  selected: boolean;
  onStartMove: (e: React.PointerEvent, clip: Clip) => void;
  onStartTrim: (e: React.PointerEvent, clip: Clip, edge: "in" | "out") => void;
}

/** A single clip block on a timeline lane: thumbnail/waveform, label, fades, trim handles. */
export function TimelineClip({
  clip,
  asset,
  trackKind,
  pxPerSec,
  laneHeight,
  selected,
  onStartMove,
  onStartTrim,
}: Props) {
  const { t } = useTranslation();
  const left = clip.start * pxPerSec;
  const width = clipLength(clip) * pxPerSec;
  const fadeInWidth = fadePixels(clip.transitions?.fadeIn ?? 0, clip, pxPerSec);
  const fadeOutWidth = fadePixels(clip.transitions?.fadeOut ?? 0, clip, pxPerSec);
  const inStyle = clip.transitions?.inStyle ?? "fade";
  const outStyle = clip.transitions?.outStyle ?? "fade";

  return (
    <div
      className={`clip ${trackKind}${selected ? " selected" : ""}`}
      style={{ left, width }}
      onPointerDown={(e) => onStartMove(e, clip)}
      title={`${asset?.name ?? ""} (${formatTime(clipLength(clip))})`}
    >
      <div className="trim-handle left" onPointerDown={(e) => onStartTrim(e, clip, "in")} />
      <div className="clip-body">
        {fadeInWidth > 1 && (
          <div
            className={`clip-fade fade-in transition-${inStyle}`}
            style={{ width: fadeInWidth }}
            title={`${transitionStyleLabel(t, inStyle)} ${formatTime(clip.transitions.fadeIn)}`}
          />
        )}
        {fadeOutWidth > 1 && (
          <div
            className={`clip-fade fade-out transition-${outStyle}`}
            style={{ width: fadeOutWidth }}
            title={`${transitionStyleLabel(t, outStyle)} ${formatTime(clip.transitions.fadeOut)}`}
          />
        )}
        {trackKind === "video" && asset?.thumbnailUrl && (
          <img className="clip-thumb" src={asset.thumbnailUrl} alt="" draggable={false} />
        )}
        {trackKind === "audio" && asset && (
          <Waveform path={asset.path} width={Math.max(0, width - 16)} height={laneHeight - 28} />
        )}
        <span className="clip-label">
          {clip.linkId && <LinkOutlined className="clip-icon" />}
          {asset?.name ?? ""}
          {clip.muted && <AudioMutedOutlined className="clip-icon" />}
        </span>
        {asset && !asset.previewable && (
          <Tooltip title={t("library.notPreviewableHint")}>
            <WarningOutlined className="clip-warn" />
          </Tooltip>
        )}
      </div>
      <div className="trim-handle right" onPointerDown={(e) => onStartTrim(e, clip, "out")} />
    </div>
  );
}

function fadePixels(seconds: number, clip: Clip, pxPerSec: number): number {
  const duration = clipLength(clip);
  if (duration <= 0 || seconds <= 0) return 0;
  return Math.min(duration, seconds) * pxPerSec;
}

function transitionStyleLabel(
  t: (key: string) => string,
  style: ClipTransitionStyle,
): string {
  return t(`timeline.transitionStyle.${style}`);
}
