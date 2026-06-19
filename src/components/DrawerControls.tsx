import { useEffect, useRef } from "react";
import { InputNumber, Select, Slider } from "antd";
import { useTranslation } from "react-i18next";
import { CLIP_TRANSITION_STYLES, ClipTransitionStyle } from "../types";
import { clamp } from "../timeline";

export interface WheelNumberProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  precision?: number;
  addonAfter?: string;
  onChange: (value: number) => void;
}

/** A labelled number input plus a slider, sharing the same range. */
export function EffectControl({
  label,
  value,
  min,
  max,
  step,
  precision,
  addonAfter,
  onChange,
}: WheelNumberProps) {
  return (
    <div className="effect-control">
      <WheelNumber
        label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        precision={precision}
        addonAfter={addonAfter}
        onChange={onChange}
      />
      <Slider
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(next) => onChange(next as number)}
        tooltip={{ formatter: (next) => String(next ?? value) }}
      />
    </div>
  );
}

/** A number input whose value can also be nudged with the mouse wheel. */
export function WheelNumber({
  label,
  value,
  min,
  max,
  step,
  precision,
  addonAfter,
  onChange,
}: WheelNumberProps) {
  const inputRef = useRef<HTMLDivElement | null>(null);

  function commit(next: number) {
    const factor = precision == null ? 1 : 10 ** precision;
    onChange(Math.round(clamp(next, min, max) * factor) / factor);
  }

  function commitWheel(deltaY: number, shiftKey: boolean, altKey: boolean) {
    const direction = deltaY < 0 ? 1 : -1;
    const multiplier = shiftKey ? 10 : altKey ? 0.2 : 1;
    commit(value + direction * step * multiplier);
  }

  useEffect(() => {
    const node = inputRef.current;
    if (!node) return;

    function onWheel(event: WheelEvent) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      commitWheel(event.deltaY, event.shiftKey, event.altKey);
    }

    node.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => node.removeEventListener("wheel", onWheel, { capture: true });
  });

  return (
    <div className="wheel-number">
      <span className="wheel-number-label">{label}</span>
      <div className="wheel-number-input" ref={inputRef}>
        <InputNumber
          size="small"
          min={min}
          max={max}
          step={step}
          precision={precision}
          value={value}
          addonAfter={addonAfter}
          onChange={(next) => commit(inputNumber(next, value))}
        />
      </div>
    </div>
  );
}

/** Dropdown for picking a clip transition style (fade, dip, slide…). */
export function TransitionStyleControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ClipTransitionStyle;
  onChange: (value: ClipTransitionStyle) => void;
}) {
  const { t } = useTranslation();
  return (
    <label className="transition-style-control">
      <span>{label}</span>
      <Select
        size="small"
        value={value}
        options={CLIP_TRANSITION_STYLES.map((style) => ({
          value: style,
          label: t(`timeline.transitionStyle.${style}`),
        }))}
        onChange={onChange}
      />
    </label>
  );
}

function inputNumber(value: number | string | null, fallback: number): number {
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) ? next : fallback;
}
