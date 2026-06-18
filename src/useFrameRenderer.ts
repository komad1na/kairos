import { useCallback, useRef } from "react";
import { getFrame } from "./api";
import { resolveTime } from "./timeline";
import { Clip } from "./types";

/** Max number of cached frames (ImageBitmap) before evicting the oldest. */
const CACHE_LIMIT = 240;

/** Draws a bitmap into the canvas preserving aspect (letterbox), black bg. */
function drawFit(canvas: HTMLCanvasElement, bmp: ImageBitmap | null) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;
  if (cw === 0 || ch === 0) return;
  if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
  }
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, cw, ch);
  if (bmp) {
    const scale = Math.min(cw / bmp.width, ch / bmp.height);
    const w = bmp.width * scale;
    const h = bmp.height * scale;
    ctx.drawImage(bmp, (cw - w) / 2, (ch - h) / 2, w, h);
  }
  ctx.restore();
}

/**
 * Returns a `requestRender(timelineTime, clips)` function that shows the frame
 * matching the given playhead position. Calls are coalesced: while one frame is
 * loading from Rust, only the latest requested position is kept — so scrubbing
 * and playback never flood the backend and always show the freshest state.
 */
export function useFrameRenderer(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  maxWidth: number,
) {
  const cache = useRef<Map<string, ImageBitmap>>(new Map());
  const rendering = useRef(false);
  const pending = useRef<{ t: number; clips: Clip[] } | null>(null);

  const draw = useCallback(
    async (t: number, clips: Clip[]) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const pos = resolveTime(clips, t);
      if (!pos) {
        drawFit(canvas, null);
        return;
      }
      const key = `${pos.clip.path}@${pos.sourceTime.toFixed(2)}`;
      let bmp = cache.current.get(key);
      if (!bmp) {
        bmp = await getFrame(pos.clip.path, pos.sourceTime, maxWidth);
        cache.current.set(key, bmp);
        if (cache.current.size > CACHE_LIMIT) {
          const oldest = cache.current.keys().next().value;
          if (oldest !== undefined) cache.current.delete(oldest);
        }
      }
      drawFit(canvas, bmp);
    },
    [canvasRef, maxWidth],
  );

  const requestRender = useCallback(
    (t: number, clips: Clip[]) => {
      pending.current = { t, clips };
      if (rendering.current) return;
      rendering.current = true;
      void (async () => {
        try {
          while (pending.current) {
            const job = pending.current;
            pending.current = null;
            try {
              await draw(job.t, job.clips);
            } catch (e) {
              console.error("Frame render failed:", e);
            }
          }
        } finally {
          rendering.current = false;
        }
      })();
    },
    [draw],
  );

  return requestRender;
}
