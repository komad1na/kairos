/**
 * Realtime preview engine — lives entirely in the webview (constitution IV).
 *
 * One muted `<video>` per video track + one `<audio>` per audio track, driven by
 * a single JS master clock. Each tick maps the playhead to the active clip on
 * every track, points the element at that source, corrects drift, and applies
 * gain. Audio uses native media volume for 0..100%, and lazily switches to a
 * Web Audio gain node only when a clip/track is boosted above 100%. ffmpeg is
 * never involved here.
 */
import { Asset, Clip, TimelineState, TrackKind } from "../types";
import {
  activeClipAt,
  effectiveGain,
  sourceTimeAt,
  timelineDuration,
} from "../timeline";
import { mediaBlobUrl, mediaDataUrl, mediaUrl } from "../api";
import {
  applyVideoTransform,
  clamp01,
  transitionFactor,
  videoClipCoversCanvas,
} from "./transitions";
import { errorMessage, mediaErrorDescription, mediaState, shortSrc } from "./mediaDiagnostics";

interface TrackMedia {
  trackId: string;
  kind: TrackKind;
  el: HTMLMediaElement;
  source: MediaElementAudioSourceNode | null;
  gain: GainNode | null;
  /** Source URL currently loaded on the element. */
  currentSrcUrl: string | null;
  blobFallbackPath: string | null;
  blobFallbackUrl: string | null;
  blobFallbackRequestedPath: string | null;
  dataFallbackPath: string | null;
  dataFallbackUrl: string | null;
  dataFallbackRequestedPath: string | null;
  /** Bumps whenever `src` changes so stale load handlers do nothing. */
  loadToken: number;
}

type TickListener = (playhead: number, playing: boolean) => void;
type StatusListener = (message: string) => void;

/** Drift tolerances (s): looser during playback to avoid stutter. */
const DRIFT_PLAYING = 0.3;
const DRIFT_PAUSED = 0.05;
const MEDIA_SYNC_INTERVAL_MS = 50;
const UI_TICK_INTERVAL_MS = 66;

export class PlaybackEngine {
  private getState: () => TimelineState;
  private onTick: TickListener;
  private onStatus: StatusListener | null;
  private media = new Map<string, TrackMedia>();
  private audioCtx: AudioContext | null = null;
  private playing = false;
  private playhead = 0;
  private raf = 0;
  private lastTs = 0;
  private lastMediaSyncTs = 0;
  private lastTickNotifyTs = 0;

  constructor(
    getState: () => TimelineState,
    onTick: TickListener,
    onStatus: StatusListener | null = null,
  ) {
    this.getState = getState;
    this.onTick = onTick;
    this.onStatus = onStatus;
  }

  /** Register (el) or unregister (null) the media element for a track. */
  attach(trackId: string, kind: TrackKind, el: HTMLMediaElement | null): void {
    if (!el) {
      const existing = this.media.get(trackId);
      if (existing) this.disconnectAudioGraph(existing);
      this.media.delete(trackId);
      return;
    }
    const existing = this.media.get(trackId);
    if (existing && existing.el === el) return;

    if (existing) this.disconnectAudioGraph(existing);
    if (kind === "video") el.muted = true; // video audio comes from audio tracks
    el.preload = "auto";
    this.media.set(trackId, {
      trackId,
      kind,
      el,
      source: null,
      gain: null,
      currentSrcUrl: null,
      blobFallbackPath: null,
      blobFallbackUrl: null,
      blobFallbackRequestedPath: null,
      dataFallbackPath: null,
      dataFallbackUrl: null,
      dataFallbackRequestedPath: null,
      loadToken: 0,
    });
    this.syncAll();
  }

  isPlaying(): boolean {
    return this.playing;
  }

  getPlayhead(): number {
    return this.playhead;
  }

  seek(t: number): void {
    const dur = timelineDuration(this.getState().clips);
    this.playhead = Math.min(Math.max(0, t), dur);
    this.syncAll();
    this.emitTick(true);
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  play(): void {
    const dur = timelineDuration(this.getState().clips);
    if (dur <= 0) return;
    if (this.playhead >= dur) this.playhead = 0;
    void this.audioCtx?.resume();
    this.playing = true;
    this.lastTs = performance.now();
    this.lastMediaSyncTs = this.lastTs;
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.loop);
    this.syncAll();
    this.emitTick(true);
  }

  pause(): void {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    for (const m of this.media.values()) {
      if (!m.el.paused) m.el.pause();
    }
    this.emitTick(true);
  }

  stop(): void {
    this.pause();
    this.seek(0);
  }

  /** Re-apply the model to the elements (after edits / volume changes). */
  refresh(): void {
    this.syncAll();
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    for (const m of this.media.values()) this.disconnectAudioGraph(m);
    this.media.clear();
    void this.audioCtx?.close();
    this.audioCtx = null;
  }

  private loop = (ts: number): void => {
    if (!this.playing) return;
    const dt = (ts - this.lastTs) / 1000;
    this.lastTs = ts;
    const dur = timelineDuration(this.getState().clips);
    const next = this.playhead + dt;
    if (next >= dur) {
      this.playhead = dur;
      this.syncAll();
      this.pause();
      return;
    }
    this.playhead = next;
    if (ts - this.lastMediaSyncTs >= MEDIA_SYNC_INTERVAL_MS) {
      this.syncAll();
      this.lastMediaSyncTs = ts;
    }
    this.emitTick(false, ts);
    this.raf = requestAnimationFrame(this.loop);
  };

  private emitTick(force: boolean, ts = performance.now()): void {
    if (!force && ts - this.lastTickNotifyTs < UI_TICK_INTERVAL_MS) return;
    this.lastTickNotifyTs = ts;
    this.onTick(this.playhead, this.playing);
  }

  /**
   * Build Web Audio nodes only when gain needs to exceed native media volume.
   * Normal 0..100% playback stays on the media element, which is much more
   * tolerant of platform/WebKit quirks.
   */
  private ensureAudioGraphFor(m: TrackMedia): boolean {
    if (m.kind !== "audio") return false;
    if (!this.audioCtx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return false;
      this.audioCtx = new Ctor();
    }
    const ctx = this.audioCtx;
    if (m.source && m.gain) return true;
    try {
      m.source = ctx.createMediaElementSource(m.el);
      m.gain = ctx.createGain();
      m.source.connect(m.gain);
      m.gain.connect(ctx.destination);
      m.el.muted = false; // level is controlled by the gain node
      m.el.volume = 1;
      return true;
    } catch (err) {
      console.warn("[preview] Failed to create Web Audio graph; using native volume.", err);
      this.disconnectAudioGraph(m);
      return false;
    }
  }

  private disconnectAudioGraph(m: TrackMedia): void {
    try {
      m.source?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      m.gain?.disconnect();
    } catch {
      /* ignore */
    }
    m.source = null;
    m.gain = null;
  }

  private syncAll(): void {
    const state = this.getState();
    const assetById = new Map(state.assets.map((asset) => [asset.id, asset]));
    const videoTrackIds = state.tracks
      .filter((track) => track.kind === "video")
      .map((track) => track.id);
    const videoLayerByTrack = new Map(
      videoTrackIds.map((trackId, index) => [trackId, videoTrackIds.length - index]),
    );
    let videoCoveredByUpperLayer = false;

    for (const track of state.tracks) {
      const m = this.media.get(track.id);
      if (!m) continue;
      const clip = activeClipAt(state.clips, track.id, this.playhead);

      if (track.kind === "video") {
        m.el.style.zIndex = String(videoLayerByTrack.get(track.id) ?? 0);
        if (!clip || videoCoveredByUpperLayer) {
          m.el.style.visibility = "hidden";
          if (!m.el.paused) m.el.pause();
          if (!clip) applyVideoTransform(m.el, null, state.settings, this.playhead);
          continue;
        }
        m.el.style.visibility = "visible";
      }

      if (!clip) {
        if (!m.el.paused) m.el.pause();
        if (m.gain) m.gain.gain.value = 0;
        continue;
      }

      const asset = assetById.get(clip.assetId);
      if (!asset) continue;
      if (track.kind === "video") {
        applyVideoTransform(m.el, clip, state.settings, this.playhead);
        if (videoClipCoversCanvas(clip, asset, state.settings, this.playhead)) {
          videoCoveredByUpperLayer = true;
        }
      }
      this.syncElement(m, asset, clip, track.kind === "audio" ? track : null);
    }
  }

  private syncElement(
    m: TrackMedia,
    asset: Asset,
    clip: Clip,
    audioTrack: { volume: number; muted: boolean } | null,
  ): void {
    const sourcePath = previewSourcePath(asset);
    const src =
      m.dataFallbackPath === sourcePath && m.dataFallbackUrl
        ? m.dataFallbackUrl
        : m.blobFallbackPath === sourcePath && m.blobFallbackUrl
          ? m.blobFallbackUrl
          : mediaUrl(sourcePath);
    if (m.currentSrcUrl !== src || m.el.getAttribute("src") !== src) {
      const token = ++m.loadToken;
      m.el.src = src;
      m.currentSrcUrl = src;
      m.el.preload = "auto";
      this.onStatus?.(`[preview] loading ${mediaLabel(m, asset)} (${shortSrc(src)})`);

      const onReady = () => {
        if (m.loadToken !== token) return;
        const st = this.getState();
        const c = activeClipAt(st.clips, m.trackId, this.playhead);
        if (!c) return;
        this.seekElement(m, sourceTimeAt(c, this.playhead), 0);
        if (this.playing) this.playElement(m);
      };

      // Setting currentTime before metadata exists is often ignored. Re-apply on
      // each readiness milestone so a paused preview shows an actual frame.
      m.el.addEventListener("loadedmetadata", onReady, { once: true });
      m.el.addEventListener("loadeddata", onReady, { once: true });
      m.el.addEventListener("canplay", onReady, { once: true });
      m.el.addEventListener(
        "stalled",
        () => {
          if (m.loadToken !== token) return;
          this.onStatus?.(
            `[preview] ${mediaLabel(m, asset)}: native media stalled (${mediaState(m.el)})`,
          );
          this.tryNextSourceFallback(m, asset, sourcePath, token);
        },
        { once: true },
      );
      m.el.addEventListener(
        "waiting",
        () => {
          if (m.loadToken !== token || !this.playing) return;
          this.onStatus?.(
            `[preview] ${mediaLabel(m, asset)}: native media is waiting for data (${mediaState(m.el)})`,
          );
          this.tryNextSourceFallback(m, asset, sourcePath, token);
        },
        { once: true },
      );
      m.el.addEventListener(
        "error",
        () => {
          if (m.loadToken !== token) return;
          const message = `[preview] ${mediaLabel(m, asset)}: ${mediaErrorDescription(m.el.error)} (${mediaState(m.el)})`;
          this.onStatus?.(message);
          this.tryNextSourceFallback(m, asset, sourcePath, token);
          console.warn("[preview] Failed to load media.", {
            path: sourcePath,
            originalPath: asset.path,
            src: m.el.currentSrc || m.el.src,
            code: m.el.error?.code,
            message: m.el.error?.message,
          });
        },
        { once: true },
      );

      try {
        m.el.load();
      } catch {
        /* ignore; load errors also surface through the media error event */
      }

      window.setTimeout(() => {
        if (m.loadToken !== token || m.el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return;
        this.onStatus?.(
          `[preview] ${mediaLabel(m, asset)}: native media has no decoded frame/audio yet (${mediaState(m.el)})`,
        );
        this.tryNextSourceFallback(m, asset, sourcePath, token);
      }, 2500);
    }
    const desired = sourceTimeAt(clip, this.playhead);
    const tol = this.playing ? DRIFT_PLAYING : DRIFT_PAUSED;
    this.seekElement(m, desired, tol);
    if (audioTrack) this.applyAudioGain(m, clip, audioTrack);
    if (this.playing) {
      this.playElement(m);
    } else if (!m.el.paused) {
      m.el.pause();
    }
  }

  private seekElement(m: TrackMedia, desired: number, tolerance: number): void {
    if (!Number.isFinite(desired)) return;
    if (m.el.readyState < HTMLMediaElement.HAVE_METADATA) return;
    if (Number.isFinite(m.el.currentTime) && Math.abs(m.el.currentTime - desired) <= tolerance) {
      return;
    }
    try {
      const t = Math.max(0, desired);
      if (typeof m.el.fastSeek === "function") m.el.fastSeek(t);
      else m.el.currentTime = t;
    } catch {
      /* element not ready yet; readiness handlers and future ticks retry */
    }
  }

  private applyAudioGain(
    m: TrackMedia,
    clip: Clip,
    audioTrack: { volume: number; muted: boolean },
  ): void {
    const gain = effectiveGain(clip, {
      id: "",
      kind: "audio",
      name: "",
      volume: audioTrack.volume,
      muted: audioTrack.muted,
    }) * transitionFactor(clip, this.playhead);

    if (gain > 1 && this.playing && this.ensureAudioGraphFor(m)) {
      void this.audioCtx?.resume();
      if (m.gain) m.gain.gain.value = gain;
      m.el.muted = false;
      m.el.volume = 1;
      return;
    }

    if (m.gain) {
      m.gain.gain.value = gain;
      m.el.muted = false;
      m.el.volume = 1;
      return;
    }

    m.el.muted = gain <= 0;
    m.el.volume = clamp01(gain);
  }

  private playElement(m: TrackMedia): void {
    if (!m.el.paused) return;
    void m.el.play().catch((err) => {
      this.onStatus?.(`[preview] native play failed: ${errorMessage(err)}`);
      console.warn("[preview] Media play() failed.", {
        trackId: m.trackId,
        kind: m.kind,
        src: m.el.currentSrc || m.el.src,
        error: err,
      });
    });
  }

  private useBlobFallback(m: TrackMedia, asset: Asset, sourcePath: string, token: number): void {
    if (m.blobFallbackRequestedPath === sourcePath) return;
    m.blobFallbackRequestedPath = sourcePath;
    this.onStatus?.(`[preview] retrying ${mediaLabel(m, asset)} as native blob source`);

    void mediaBlobUrl(sourcePath)
      .then((url) => {
        if (m.loadToken !== token || m.currentSrcUrl !== mediaUrl(sourcePath)) return;
        m.blobFallbackPath = sourcePath;
        m.blobFallbackUrl = url;
        this.syncAll();
      })
      .catch((err) => {
        if (m.loadToken !== token) return;
        this.onStatus?.(
          `[preview] blob fallback failed for ${mediaLabel(m, asset)}: ${errorMessage(err)}`,
        );
      });
  }

  private useDataFallback(m: TrackMedia, asset: Asset, sourcePath: string, token: number): void {
    if (m.dataFallbackRequestedPath === sourcePath) return;
    m.dataFallbackRequestedPath = sourcePath;
    this.onStatus?.(`[preview] retrying ${mediaLabel(m, asset)} as native data source`);

    void mediaDataUrl(sourcePath)
      .then((url) => {
        if (m.loadToken !== token || m.currentSrcUrl !== m.blobFallbackUrl) return;
        m.dataFallbackPath = sourcePath;
        m.dataFallbackUrl = url;
        this.syncAll();
      })
      .catch((err) => {
        if (m.loadToken !== token) return;
        this.onStatus?.(
          `[preview] data fallback failed for ${mediaLabel(m, asset)}: ${errorMessage(err)}`,
        );
      });
  }

  private tryNextSourceFallback(
    m: TrackMedia,
    asset: Asset,
    sourcePath: string,
    token: number,
  ): void {
    if (m.currentSrcUrl?.startsWith("file:")) {
      this.useBlobFallback(m, asset, sourcePath, token);
    } else if (m.currentSrcUrl?.startsWith("blob:")) {
      this.useDataFallback(m, asset, sourcePath, token);
    }
  }
}

function mediaLabel(m: TrackMedia, asset: Asset): string {
  return `${m.kind} ${asset.name}`;
}

function previewSourcePath(asset: Asset): string {
  return asset.previewPath || asset.path;
}
