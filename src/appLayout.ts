export const DEFAULT_LIBRARY_WIDTH = 320;
export const MIN_LIBRARY_WIDTH = 240;
export const MAX_LIBRARY_WIDTH = 520;
export const DEFAULT_DRAWER_WIDTH = 300;
export const MIN_DRAWER_WIDTH = 260;
export const MAX_DRAWER_WIDTH = 520;

export function clampLibraryWidth(width: number): number {
  return Math.min(MAX_LIBRARY_WIDTH, Math.max(MIN_LIBRARY_WIDTH, Math.round(width)));
}

export function clampDrawerWidth(width: number): number {
  return Math.min(MAX_DRAWER_WIDTH, Math.max(MIN_DRAWER_WIDTH, Math.round(width)));
}
