/** Shared drag payload state for media-library -> timeline drags. */
export const ASSET_DND_TYPE = "application/x-asset-id";

let activeAssetDragId: string | null = null;

export function setActiveAssetDragId(assetId: string | null): void {
  activeAssetDragId = assetId;
}

export function getActiveAssetDragId(): string | null {
  return activeAssetDragId;
}

export function readAssetDragId(dataTransfer: DataTransfer): string | null {
  return (
    getData(dataTransfer, ASSET_DND_TYPE) ??
    getData(dataTransfer, "text/plain") ??
    activeAssetDragId
  );
}

function getData(dataTransfer: DataTransfer, type: string): string | null {
  try {
    return dataTransfer.getData(type) || null;
  } catch {
    return null;
  }
}
