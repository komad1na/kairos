import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Clip, Track, clipLength } from "../types";
import { formatTime } from "../timeline";

interface LinkSummaryItem {
  label: string;
  name: string;
  clip: Clip;
  track: Track | null | undefined;
}

/** Side-by-side preview of the two clips that a link/unlink action affects. */
export function LinkSummary({
  title,
  note,
  connector,
  first,
  second,
}: {
  title: string;
  note: string;
  connector: ReactNode;
  first: LinkSummaryItem;
  second: LinkSummaryItem | null;
}) {
  return (
    <div className="link-summary">
      <div className="link-summary-head">
        <div className="link-summary-title">{title}</div>
        <div className="link-summary-note">{note}</div>
      </div>
      <LinkSummaryCard item={first} />
      <div className="link-summary-connector">{connector}</div>
      {second ? (
        <LinkSummaryCard item={second} />
      ) : (
        <div className="link-summary-item muted">?</div>
      )}
    </div>
  );
}

function LinkSummaryCard({ item }: { item: LinkSummaryItem }) {
  const { t } = useTranslation();
  return (
    <div className="link-summary-item">
      <div className="link-summary-item-head">
        <span className="link-summary-badge">{item.label}</span>
        <span className="link-summary-track">{formatTrackLabel(item.track, t)}</span>
      </div>
      <div className="link-summary-name">{item.name}</div>
      <div className="link-summary-times">
        <span>{formatTime(item.clip.start)}</span>
        <span>{formatTime(item.clip.start + clipLength(item.clip))}</span>
        <span>{formatTime(clipLength(item.clip))}</span>
      </div>
    </div>
  );
}

function formatTrackLabel(track: Track | null | undefined, t: (key: string) => string): string {
  if (!track) return "";
  const kind = track.kind === "video" ? t("timeline.videoTrack") : t("timeline.audioTrack");
  return `${kind} ${track.name}`;
}
