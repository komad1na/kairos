import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "./App.css";
import { Toolbar } from "./components/Toolbar";
import { Preview } from "./components/Preview";
import { Timeline } from "./components/Timeline";
import { useFrameRenderer } from "./useFrameRenderer";
import { colorForIndex, totalDuration } from "./timeline";
import { Clip } from "./types";
import {
  exportTimeline,
  pickExportPath,
  pickVideoFile,
  probeVideo,
} from "./api";

/** Max width of the frame we request from Rust (for speed and memory). */
const PREVIEW_MAX_WIDTH = 960;
const MIN_PX_PER_SEC = 10;
const MAX_PX_PER_SEC = 400;

function App() {
  const { t } = useTranslation();
  const [clips, setClips] = useState<Clip[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pxPerSec, setPxPerSec] = useState(80);
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRender = useFrameRenderer(canvasRef, PREVIEW_MAX_WIDTH);

  const total = totalDuration(clips);

  // Refs holding the freshest values — used by the RAF loop without stale closures.
  const clipsRef = useRef(clips);
  const playheadRef = useRef(playhead);
  useEffect(() => {
    clipsRef.current = clips;
  }, [clips]);
  useEffect(() => {
    playheadRef.current = playhead;
  }, [playhead]);

  // Redraw the frame whenever the playhead position or clip contents change.
  useEffect(() => {
    requestRender(playhead, clips);
  }, [playhead, clips, requestRender]);

  // If the timeline shrinks (delete/trim), keep the playhead in range.
  useEffect(() => {
    if (playhead > total) setPlayhead(total);
  }, [total, playhead]);

  // Redraw on resize (the canvas backing store changes).
  useEffect(() => {
    const onResize = () =>
      requestRender(playheadRef.current, clipsRef.current);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [requestRender]);

  // Playback loop: advances the playhead in real time (wall clock). Frames are
  // fetched on demand and may lag — the timing stays accurate.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const tot = totalDuration(clipsRef.current);
      const next = playheadRef.current + dt;
      if (tot === 0 || next >= tot) {
        setPlayhead(tot);
        setPlaying(false);
        return;
      }
      setPlayhead(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const togglePlay = useCallback(() => {
    if (total === 0) return;
    setPlaying((p) => {
      if (!p && playheadRef.current >= total) setPlayhead(0);
      return !p;
    });
  }, [total]);

  const handleImport = useCallback(async () => {
    try {
      const path = await pickVideoFile();
      if (!path) return;
      setStatus(t("status.readingMetadata"));
      const info = await probeVideo(path);
      const name = path.split(/[\\/]/).pop() ?? "clip";
      setClips((prev) => {
        const clip: Clip = {
          id: crypto.randomUUID(),
          path,
          name,
          sourceDuration: info.duration,
          in: 0,
          out: info.duration,
          color: colorForIndex(prev.length),
        };
        return [...prev, clip];
      });
      setStatus(
        t("status.imported", {
          name,
          width: info.width,
          height: info.height,
          fps: info.fps.toFixed(2),
          codec: info.codec,
          audio: t(info.has_audio ? "status.audioYes" : "status.audioNo"),
        }),
      );
    } catch (e) {
      setStatus(t("status.importError", { error: String(e) }));
    }
  }, [t]);

  const handleTrim = useCallback(
    (id: string, edge: "in" | "out", value: number) => {
      setClips((prev) =>
        prev.map((c) => (c.id === id ? { ...c, [edge]: value } : c)),
      );
    },
    [],
  );

  const handleDelete = useCallback(() => {
    if (!selectedId) return;
    setClips((prev) => prev.filter((c) => c.id !== selectedId));
    setSelectedId(null);
  }, [selectedId]);

  const handleExport = useCallback(async () => {
    if (clipsRef.current.length === 0) return;
    try {
      const out = await pickExportPath();
      if (!out) return;
      setExporting(true);
      setStatus(t("status.exporting"));
      await exportTimeline(
        clipsRef.current.map((c) => ({
          path: c.path,
          start: c.in,
          end: c.out,
        })),
        out,
      );
      setStatus(t("status.exportDone", { path: out }));
    } catch (e) {
      setStatus(t("status.exportError", { error: String(e) }));
    } finally {
      setExporting(false);
    }
  }, [t]);

  const zoomIn = useCallback(
    () => setPxPerSec((p) => Math.min(MAX_PX_PER_SEC, p * 1.25)),
    [],
  );
  const zoomOut = useCallback(
    () => setPxPerSec((p) => Math.max(MIN_PX_PER_SEC, p / 1.25)),
    [],
  );

  // Keyboard shortcuts: Space = play/pause, Delete = delete selected clip.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "Delete" || e.code === "Backspace") {
        handleDelete();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, handleDelete]);

  return (
    <div className="app">
      <Toolbar
        playing={playing}
        exporting={exporting}
        hasClips={clips.length > 0}
        hasSelection={selectedId !== null}
        currentTime={playhead}
        total={total}
        onImport={handleImport}
        onTogglePlay={togglePlay}
        onDeleteSelected={handleDelete}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onExport={handleExport}
      />

      <Preview canvasRef={canvasRef} hasClips={clips.length > 0} />

      <Timeline
        clips={clips}
        pxPerSec={pxPerSec}
        playhead={playhead}
        selectedId={selectedId}
        onSeek={setPlayhead}
        onSelect={setSelectedId}
        onTrim={handleTrim}
      />

      <div className="statusbar">{status || t("status.ready")}</div>
    </div>
  );
}

export default App;
