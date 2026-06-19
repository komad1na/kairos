import { memo, useEffect, useRef } from "react";
import { generateWaveform } from "../api";

/** Per-source peak cache so we decode each file's waveform only once. */
const peaksCache = new Map<string, number[]>();

interface Props {
  path: string;
  width: number;
  height: number;
}

/** Renders an audio clip's waveform from downsampled peaks (FR-016a). */
export const Waveform = memo(function Waveform({ path, width, height }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    const cached = peaksCache.get(path);
    if (cached) {
      draw(cached);
      return;
    }
    generateWaveform(path, 800)
      .then((peaks) => {
        if (cancelled) return;
        peaksCache.set(path, peaks);
        draw(peaks);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, width, height]);

  function draw(peaks: number[]) {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0 || peaks.length === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    const mid = height / 2;
    for (let x = 0; x < width; x++) {
      const idx = Math.floor((x / width) * peaks.length);
      const peak = peaks[Math.min(idx, peaks.length - 1)] ?? 0;
      const h = Math.max(1, peak * (height - 2));
      ctx.fillRect(x, mid - h / 2, 1, h);
    }
  }

  return <canvas ref={canvasRef} className="clip-waveform" style={{ width, height }} />;
});
