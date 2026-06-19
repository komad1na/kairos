export interface ExportProgressPayload {
  percent: number;
  seconds: number;
  total: number;
}

export function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
}
