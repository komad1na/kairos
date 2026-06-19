/**
 * Pure visual math for the realtime preview: per-clip transforms, CSS effect
 * filters, and transition (fade/dip/slide) state. Extracted from the engine so
 * the engine file stays focused on media-element orchestration.
 */
import {
  Asset,
  Clip,
  ClipEffects,
  ClipTransitions,
  ClipTransitionStyle,
  DEFAULT_CLIP_EFFECTS,
  DEFAULT_CLIP_TRANSITIONS,
  DEFAULT_CLIP_TRANSFORM,
  ProjectSettings,
} from "../types";

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function applyVideoTransform(
  el: HTMLMediaElement,
  clip: Clip | null,
  settings: ProjectSettings,
  playhead: number,
): void {
  const transform = clip?.transform ?? DEFAULT_CLIP_TRANSFORM;
  const effects = clipEffects(clip);
  const transition = clip ? transitionVisualState(clip, playhead) : defaultTransitionVisualState();
  const tx = (settings.width > 0 ? (transform.x / settings.width) * 100 : 0) + transition.xPercent;
  const ty = (settings.height > 0 ? (transform.y / settings.height) * 100 : 0) + transition.yPercent;
  el.style.transform = `translate3d(${tx}%, ${ty}%, 0) rotate(${transform.rotation}deg) scale(${transform.scale})`;
  el.style.opacity = String(effects.opacity * transition.opacity);
  el.style.filter = cssEffectsFilter(effects, transition);
  el.style.clipPath = transition.clipPath;
}

export function videoClipCoversCanvas(
  clip: Clip,
  asset: Asset,
  settings: ProjectSettings,
  playhead: number,
): boolean {
  if (asset.width <= 0 || asset.height <= 0 || settings.width <= 0 || settings.height <= 0) {
    return false;
  }

  const transform = clip.transform ?? DEFAULT_CLIP_TRANSFORM;
  const effects = clipEffects(clip);
  if (effects.opacity < 0.999) return false;
  const transition = transitionVisualState(clip, playhead);
  if (transition.opacity < 0.999) return false;
  if (Math.abs(transition.xPercent) > 0.001 || Math.abs(transition.yPercent) > 0.001) return false;
  if (transition.clipPath !== "none") return false;
  if (Math.abs(transform.rotation) > 0.001 || transform.scale <= 0) return false;

  const canvasAspect = settings.width / settings.height;
  const sourceAspect = asset.width / asset.height;
  const fitted =
    sourceAspect > canvasAspect
      ? { width: settings.width, height: settings.width / sourceAspect }
      : { width: settings.height * sourceAspect, height: settings.height };

  const width = fitted.width * transform.scale;
  const height = fitted.height * transform.scale;
  const centerX = settings.width / 2 + transform.x;
  const centerY = settings.height / 2 + transform.y;
  const left = centerX - width / 2;
  const right = centerX + width / 2;
  const top = centerY - height / 2;
  const bottom = centerY + height / 2;
  const epsilon = 0.5;

  return (
    left <= epsilon &&
    top <= epsilon &&
    right >= settings.width - epsilon &&
    bottom >= settings.height - epsilon
  );
}

function clipEffects(clip: Clip | null): ClipEffects {
  return { ...DEFAULT_CLIP_EFFECTS, ...(clip?.effects ?? {}) };
}

function clipTransitions(clip: Clip | null): ClipTransitions {
  return { ...DEFAULT_CLIP_TRANSITIONS, ...(clip?.transitions ?? {}) };
}

export function transitionFactor(clip: Clip, playhead: number): number {
  const transitions = clipTransitions(clip);
  const length = Math.max(0, clip.out - clip.in);
  const local = Math.min(length, Math.max(0, playhead - clip.start));
  let factor = 1;
  if (transitions.fadeIn > 0) {
    factor = Math.min(factor, local / Math.min(transitions.fadeIn, length || transitions.fadeIn));
  }
  if (transitions.fadeOut > 0) {
    const duration = Math.min(transitions.fadeOut, length || transitions.fadeOut);
    factor = Math.min(factor, (length - local) / duration);
  }
  return clamp01(factor);
}

interface TransitionVisualState {
  opacity: number;
  xPercent: number;
  yPercent: number;
  brightness: number;
  invert: number;
  clipPath: string;
}

function defaultTransitionVisualState(): TransitionVisualState {
  return {
    opacity: 1,
    xPercent: 0,
    yPercent: 0,
    brightness: 1,
    invert: 0,
    clipPath: "none",
  };
}

function transitionVisualState(clip: Clip, playhead: number): TransitionVisualState {
  const transitions = clipTransitions(clip);
  const length = Math.max(0, clip.out - clip.in);
  const local = Math.min(length, Math.max(0, playhead - clip.start));
  const state = defaultTransitionVisualState();
  applyTransitionEdge(state, transitions.inStyle, edgeProgress(local, transitions.fadeIn, length));
  applyTransitionEdge(
    state,
    transitions.outStyle,
    edgeProgress(length - local, transitions.fadeOut, length),
  );
  return state;
}

function edgeProgress(edgeTime: number, duration: number, length: number): number | null {
  if (duration <= 0.001 || length <= 0) return null;
  const d = Math.min(duration, length);
  if (edgeTime >= d) return null;
  return clamp01(edgeTime / d);
}

function applyTransitionEdge(
  state: TransitionVisualState,
  style: ClipTransitionStyle,
  progress: number | null,
): void {
  if (progress == null) return;
  const amount = 1 - progress;
  switch (style) {
    case "dipBlack":
      state.brightness *= progress;
      break;
    case "dipWhite":
      state.brightness *= progress;
      state.invert = Math.max(state.invert, amount);
      break;
    case "slideLeft":
      state.xPercent -= amount * 100;
      break;
    case "slideRight":
      state.xPercent += amount * 100;
      break;
    case "slideUp":
      state.yPercent -= amount * 100;
      break;
    case "slideDown":
      state.yPercent += amount * 100;
      break;
    case "fade":
    default:
      state.opacity *= progress;
      break;
  }
}

function cssEffectsFilter(
  effects: ClipEffects,
  transition: TransitionVisualState = defaultTransitionVisualState(),
): string {
  const filters = [];
  if (Math.abs(transition.brightness - 1) > 0.001) {
    filters.push(`brightness(${transition.brightness})`);
  }
  if (transition.invert > 0.001) filters.push(`invert(${transition.invert})`);
  if (effects.blur > 0.001) filters.push(`blur(${effects.blur}px)`);
  if (Math.abs(effects.brightness - 1) > 0.001) {
    filters.push(`brightness(${effects.brightness})`);
  }
  if (Math.abs(effects.contrast - 1) > 0.001) filters.push(`contrast(${effects.contrast})`);
  if (Math.abs(effects.saturation - 1) > 0.001) {
    filters.push(`saturate(${effects.saturation})`);
  }
  if (Math.abs(effects.hue) > 0.001) filters.push(`hue-rotate(${effects.hue}deg)`);
  if (effects.grayscale > 0.001) filters.push(`grayscale(${effects.grayscale})`);
  if (effects.sepia > 0.001) filters.push(`sepia(${effects.sepia})`);
  if (effects.invert > 0.001) filters.push(`invert(${effects.invert})`);
  return filters.length > 0 ? filters.join(" ") : "none";
}
