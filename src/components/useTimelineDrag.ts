import { useEffect, useRef, type Dispatch, type MutableRefObject } from "react";
import { Action } from "../timelineReducer";
import { Clip, TimelineState, TrackKind } from "../types";
import { clamp, snapAnchors, snapTime } from "../timeline";

const SNAP_PX = 8;
const MIN_CLIP_LEN = 0.1;

type Drag =
  | {
      mode: "move";
      id: string;
      kind: TrackKind;
      pointerId: number;
      target: HTMLElement;
      startX: number;
      startStart: number;
    }
  | {
      mode: "trim";
      id: string;
      edge: "in" | "out";
      pointerId: number;
      target: HTMLElement;
      startX: number;
      startIn: number;
      startOut: number;
      clipStartOrig: number;
      sourceDuration: number;
    };

/**
 * Pointer-driven clip move/trim for the timeline. Window listeners read the
 * latest state/playhead through refs, and edits are coalesced to one dispatch
 * per animation frame. Returns the `onPointerDown` starters for clip bodies and
 * trim handles.
 */
export function useTimelineDrag(
  stateRef: MutableRefObject<TimelineState>,
  playheadRef: MutableRefObject<number>,
  dispatch: Dispatch<Action>,
) {
  const dragRef = useRef<Drag | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const pendingDragActionRef = useRef<Action | null>(null);

  useEffect(() => {
    function flushDragAction() {
      dragFrameRef.current = null;
      const action = pendingDragActionRef.current;
      pendingDragActionRef.current = null;
      if (action) dispatch(action);
    }

    function finishDrag(pointerId?: number) {
      const d = dragRef.current;
      if (!d) return;
      if (pointerId != null && d.pointerId !== pointerId) return;

      try {
        if (d.target.hasPointerCapture(d.pointerId)) {
          d.target.releasePointerCapture(d.pointerId);
        }
      } catch {
        /* pointer capture can disappear when the webview loses focus */
      }

      dragRef.current = null;
      document.body.classList.remove("timeline-dragging");
      if (dragFrameRef.current != null) {
        cancelAnimationFrame(dragFrameRef.current);
        flushDragAction();
      }
    }

    function queueDragAction(action: Action) {
      pendingDragActionRef.current = action;
      if (dragFrameRef.current == null) {
        dragFrameRef.current = requestAnimationFrame(flushDragAction);
      }
    }

    function onMove(e: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;
      if (e.pointerId !== d.pointerId) return;
      if (e.buttons === 0) {
        finishDrag(e.pointerId);
        return;
      }
      const st = stateRef.current;
      const pps = st.pxPerSec;
      const ph = playheadRef.current;
      const dSec = (e.clientX - d.startX) / pps;
      const anchors = snapAnchors(st, ph, d.id);
      const thresh = SNAP_PX / pps;

      if (d.mode === "move") {
        let newStart = Math.max(0, snapTime(d.startStart + dSec, anchors, thresh, e.altKey));
        let targetTrackId = st.clips.find((c) => c.id === d.id)?.trackId ?? "";
        const lane = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest(
          "[data-track-id]",
        ) as HTMLElement | null;
        if (lane && lane.dataset.kind === d.kind && lane.dataset.trackId) {
          targetTrackId = lane.dataset.trackId;
        }
        queueDragAction({ type: "moveClip", id: d.id, trackId: targetTrackId, start: newStart });
      } else {
        if (d.edge === "in") {
          let value = clamp(d.startIn + dSec, 0, d.startOut - MIN_CLIP_LEN);
          const snapped = snapTime(d.clipStartOrig + (value - d.startIn), anchors, thresh, e.altKey);
          value = clamp(d.startIn + (snapped - d.clipStartOrig), 0, d.startOut - MIN_CLIP_LEN);
          queueDragAction({ type: "trimClip", id: d.id, edge: "in", value });
        } else {
          let value = clamp(d.startOut + dSec, d.startIn + MIN_CLIP_LEN, d.sourceDuration);
          const snapped = snapTime(d.clipStartOrig + (value - d.startIn), anchors, thresh, e.altKey);
          value = clamp(
            d.startIn + (snapped - d.clipStartOrig),
            d.startIn + MIN_CLIP_LEN,
            d.sourceDuration,
          );
          queueDragAction({ type: "trimClip", id: d.id, edge: "out", value });
        }
      }
    }
    function onUp(e: PointerEvent) {
      finishDrag(e.pointerId);
    }
    function onCancel(e: PointerEvent) {
      finishDrag(e.pointerId);
    }
    function onBlur() {
      finishDrag();
    }
    function onContextMenu() {
      finishDrag();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") finishDrag();
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("blur", onBlur);
    window.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      finishDrag();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKeyDown);
      if (dragFrameRef.current != null) cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
      pendingDragActionRef.current = null;
    };
  }, [dispatch, playheadRef, stateRef]);

  function startMove(e: React.PointerEvent, clip: Clip) {
    if (e.button !== 0 || !e.isPrimary) return;
    e.stopPropagation();
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      /* best-effort: global listeners still finish the drag */
    }
    document.body.classList.add("timeline-dragging");
    dispatch({ type: "select", id: clip.id });
    dragRef.current = {
      mode: "move",
      id: clip.id,
      kind: stateRef.current.tracks.find((tr) => tr.id === clip.trackId)?.kind ?? "video",
      pointerId: e.pointerId,
      target,
      startX: e.clientX,
      startStart: clip.start,
    };
  }

  function startTrim(e: React.PointerEvent, clip: Clip, edge: "in" | "out") {
    if (e.button !== 0 || !e.isPrimary) return;
    e.stopPropagation();
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      /* best-effort: global listeners still finish the trim */
    }
    document.body.classList.add("timeline-dragging");
    dispatch({ type: "select", id: clip.id });
    dragRef.current = {
      mode: "trim",
      id: clip.id,
      edge,
      pointerId: e.pointerId,
      target,
      startX: e.clientX,
      startIn: clip.in,
      startOut: clip.out,
      clipStartOrig: clip.start,
      sourceDuration: stateRef.current.assets.find((a) => a.id === clip.assetId)?.duration ?? clip.out,
    };
  }

  return { startMove, startTrim };
}
