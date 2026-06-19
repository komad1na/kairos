import { useCallback, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { logInfo } from "../logger";

interface UseResizableWidthOptions {
  storageKey: string;
  defaultWidth: number;
  clamp: (width: number) => number;
  bodyClass: string;
  logEvent: string;
  direction: "left" | "right";
}

export function useResizableWidth({
  storageKey,
  defaultWidth,
  clamp,
  bodyClass,
  logEvent,
  direction,
}: UseResizableWidthOptions): readonly [number, (e: ReactPointerEvent) => void] {
  const [width, setWidth] = useState(() => {
    const saved = Number(localStorage.getItem(storageKey));
    return Number.isFinite(saved) ? clamp(saved) : defaultWidth;
  });

  const resizeFromPointer = useCallback(
    (startWidth: number, startX: number, clientX: number) => {
      const delta = direction === "right" ? clientX - startX : startX - clientX;
      return clamp(startWidth + delta);
    },
    [clamp, direction],
  );

  const startResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = width;

      function onMove(ev: PointerEvent) {
        setWidth(resizeFromPointer(startWidth, startX, ev.clientX));
      }

      function onUp(ev: PointerEvent) {
        const next = resizeFromPointer(startWidth, startX, ev.clientX);
        setWidth(next);
        localStorage.setItem(storageKey, String(next));
        logInfo(logEvent, { width: next });
        document.body.classList.remove(bodyClass);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      }

      document.body.classList.add(bodyClass);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [bodyClass, logEvent, resizeFromPointer, storageKey, width],
  );

  return [width, startResize] as const;
}
