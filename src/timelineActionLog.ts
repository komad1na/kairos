import type { Action } from "./timelineReducer";

export function summarizeAction(action: Action): Record<string, unknown> {
  switch (action.type) {
    case "addAsset":
      return {
        type: action.type,
        asset: {
          id: action.asset.id,
          name: action.asset.name,
          path: action.asset.path,
          kind: action.asset.kind,
          duration: action.asset.duration,
          previewable: action.asset.previewable,
          videoCodec: action.asset.videoCodec,
          audioCodec: action.asset.audioCodec,
        },
      };
    case "setAssetThumbnail":
      return { type: action.type, assetId: action.assetId, thumbnailUrl: "[object-url]" };
    case "dropAsset":
      return {
        type: action.type,
        assetId: action.asset.id,
        assetName: action.asset.name,
        trackId: action.trackId,
        start: action.start,
      };
    case "loadState":
      return {
        type: action.type,
        assets: action.state.assets.length,
        clips: action.state.clips.length,
        tracks: action.state.tracks.length,
        links: action.state.links.length,
        settings: action.state.settings,
      };
    default:
      return { ...action };
  }
}
