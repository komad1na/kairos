import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Clip, clipLength } from "../types";
import { clipStartOnTimeline, formatTime, totalDuration } from "../timeline";

const MIN_CLIP_LEN = 0.1; // shortest allowed clip (s)
const TRACK_HEIGHT = 72;

interface Props {
  clips: Clip[];
  pxPerSec: number;
  playhead: number;
  selectedId: string | null;
  onSeek: (t: number) => void;
  onSelect: (id: string) => void;
  /** Trim change: edge is "in" or "out", value is the new time in the source. */
  onTrim: (id: string, edge: "in" | "out", value: number) => void;
}

/** Picks a nice spacing between ruler labels so they sit ~90px apart. */
function tickStep(pxPerSec: number): number {
  const candidates = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  for (const c of candidates) {
    if (c * pxPerSec >= 90) return c;
  }
  return candidates[candidates.length - 1];
}

export function Timeline({
  clips,
  pxPerSec,
  playhead,
  selectedId,
  onSeek,
  onSelect,
  onTrim,
}: Props) {
  const { t } = useTranslation();
  const contentRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: string;
    edge: "in" | "out";
    startX: number;
    startIn: number;
    startOut: number;
    sourceDuration: number;
  } | null>(null);

  const total = totalDuration(clips);
  const contentWidth = Math.max(total * pxPerSec, 600);

  // Global listeners for trim-drag (so it keeps working when the cursor
  // leaves the clip block).
  useEffect(() => {
    function onMove(e: PointerEvent) {
      const d = drag.current;
      if (!d) return;
      const dSec = (e.clientX - d.startX) / pxPerSec;
      if (d.edge === "in") {
        const value = Math.min(
          Math.max(0, d.startIn + dSec),
          d.startOut - MIN_CLIP_LEN,
        );
        onTrim(d.id, "in", value);
      } else {
        const value = Math.min(
          Math.max(d.startIn + MIN_CLIP_LEN, d.startOut + dSec),
          d.sourceDuration,
        );
        onTrim(d.id, "out", value);
      }
    }
    function onUp() {
      drag.current = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [pxPerSec, onTrim]);

  function seekFromEvent(e: React.PointerEvent) {
    const rect = contentRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    onSeek(Math.min(Math.max(0, x / pxPerSec), total));
  }

  function startTrim(e: React.PointerEvent, clip: Clip, edge: "in" | "out") {
    e.stopPropagation();
    e.preventDefault();
    drag.current = {
      id: clip.id,
      edge,
      startX: e.clientX,
      startIn: clip.in,
      startOut: clip.out,
      sourceDuration: clip.sourceDuration,
    };
  }

  const step = tickStep(pxPerSec);
  const ticks: number[] = [];
  for (let t0 = 0; t0 <= total + 0.0001; t0 += step) ticks.push(t0);

  return (
    <div className="timeline">
      <div className="timeline-scroll">
        <div
          ref={contentRef}
          className="timeline-content"
          style={{ width: contentWidth }}
        >
          {/* Ruler */}
          <div className="ruler" onPointerDown={seekFromEvent}>
            {ticks.map((tick) => (
              <div
                key={tick}
                className="tick"
                style={{ left: tick * pxPerSec }}
              >
                <span>{formatTime(tick)}</span>
              </div>
            ))}
          </div>

          {/* Clip track */}
          <div
            className="track"
            style={{ height: TRACK_HEIGHT }}
            onPointerDown={seekFromEvent}
          >
            {clips.map((clip, i) => {
              const left = clipStartOnTimeline(clips, i) * pxPerSec;
              const width = clipLength(clip) * pxPerSec;
              return (
                <div
                  key={clip.id}
                  className={
                    "clip" + (clip.id === selectedId ? " selected" : "")
                  }
                  style={{ left, width, background: clip.color }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onSelect(clip.id);
                    seekFromEvent(e);
                  }}
                  title={`${clip.name}  (${formatTime(clipLength(clip))})`}
                >
                  <div
                    className="trim-handle left"
                    onPointerDown={(e) => startTrim(e, clip, "in")}
                  />
                  <span className="clip-label">{clip.name}</span>
                  <div
                    className="trim-handle right"
                    onPointerDown={(e) => startTrim(e, clip, "out")}
                  />
                </div>
              );
            })}
          </div>

          {/* Playhead */}
          <div className="playhead" style={{ left: playhead * pxPerSec }} />
        </div>
      </div>
      {clips.length === 0 && (
        <div className="timeline-empty">{t("timeline.empty")}</div>
      )}
    </div>
  );
}
