import { useCallback, useEffect, useRef, useState } from "react";
import { TimelineState, TrackKind } from "../types";
import { PlaybackEngine } from "./playbackEngine";
import { logDebug, logInfo } from "../logger";

/**
 * Binds the {@link PlaybackEngine} to the current timeline model and exposes
 * transport state + controls to React. The engine reads the latest state via a
 * ref so the RAF loop never sees stale clips.
 */
export function usePlaybackEngine(state: TimelineState, onStatus?: (message: string) => void) {
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);

  const stateRef = useRef(state);
  stateRef.current = state;

  const engineRef = useRef<PlaybackEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new PlaybackEngine(
      () => stateRef.current,
      (ph, pl) => {
        setPlayhead(ph);
        setPlaying(pl);
      },
      onStatus ?? null,
    );
  }
  const engine = engineRef.current;

  // Re-apply the model to the media elements after any edit (move/trim/volume).
  useEffect(() => {
    engine.refresh();
  }, [state, engine]);

  // Tear down the engine (and its AudioContext) on unmount.
  useEffect(() => () => engine.dispose(), [engine]);

  const attach = useCallback(
    (trackId: string, kind: TrackKind, el: HTMLMediaElement | null) => {
      logDebug("playback:attach", { trackId, kind, attached: Boolean(el) });
      engine.attach(trackId, kind, el);
    },
    [engine],
  );

  const play = useCallback(() => {
    logInfo("playback:play");
    engine.play();
  }, [engine]);
  const pause = useCallback(() => {
    logInfo("playback:pause");
    engine.pause();
  }, [engine]);
  const stop = useCallback(() => {
    logInfo("playback:stop");
    engine.stop();
  }, [engine]);
  const toggle = useCallback(() => {
    logInfo("playback:toggle");
    engine.toggle();
  }, [engine]);
  const seek = useCallback(
    (t: number) => {
      logDebug("playback:seek", { time: t });
      engine.seek(t);
    },
    [engine],
  );

  return { playhead, playing, attach, play, pause, stop, toggle, seek };
}
