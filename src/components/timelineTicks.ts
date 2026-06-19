/** Pure helpers for the timeline ruler tick spacing. */

const TICK_STEPS = [1 / 30, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];

/** Smallest tick step (s) whose on-screen spacing is at least `minPixels`. */
export function tickStep(pxPerSec: number, minPixels: number): number {
  for (const c of TICK_STEPS) if (c * pxPerSec >= minPixels) return c;
  return TICK_STEPS[TICK_STEPS.length - 1];
}

/** Tick times from 0..total at the given step (rounded to ms). */
export function buildTicks(total: number, step: number): number[] {
  const ticks: number[] = [];
  for (let tk = 0; tk <= total + 0.0001; tk += step) ticks.push(roundTick(tk));
  return ticks;
}

function roundTick(value: number): number {
  return Math.round(value * 1000) / 1000;
}
