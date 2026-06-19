export type PreviewProxyHeight = 360 | 540 | 720 | 1080;

export const DEFAULT_PREVIEW_PROXY_HEIGHT: PreviewProxyHeight = 720;

export const PREVIEW_PROXY_HEIGHTS: PreviewProxyHeight[] = [360, 540, 720, 1080];

const STORAGE_KEY = "previewProxyHeight";

export function loadPreviewProxyHeight(): PreviewProxyHeight {
  return normalizePreviewProxyHeight(Number(localStorage.getItem(STORAGE_KEY)));
}

export function savePreviewProxyHeight(height: PreviewProxyHeight): void {
  localStorage.setItem(STORAGE_KEY, String(height));
}

export function previewProxyHeightLabel(height: PreviewProxyHeight): string {
  const width = Math.round((height * 16) / 9);
  return `${height}p (${width}x${height} / ${height}x${width})`;
}

function normalizePreviewProxyHeight(value: number): PreviewProxyHeight {
  return PREVIEW_PROXY_HEIGHTS.includes(value as PreviewProxyHeight)
    ? (value as PreviewProxyHeight)
    : DEFAULT_PREVIEW_PROXY_HEIGHT;
}
