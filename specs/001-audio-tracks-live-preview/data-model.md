# Phase 1 Data Model

The model is the single source of truth for both preview and export (Constitution III). It
lives in `src/types.ts` (shapes) and `src/timeline.ts` / `src/timelineReducer.ts` (pure
logic). Times are in **seconds** (float). Volume is a **linear factor** where `1.0` = 100%,
valid range `0.0–2.0` (FR-018/019). Sources are never mutated (FR-007/016).

---

## Entities

### Asset (Media Library Item)
A reference to an imported source file. Created on import; reused by many clips.

| Field | Type | Notes |
|-------|------|-------|
| `id` | string (uuid) | Stable id for keys/drag payload |
| `path` | string | Absolute source path (read-only) |
| `name` | string | File name shown in the library |
| `kind` | `"video" \| "audio" \| "both"` | Derived from probe streams (FR-004) |
| `duration` | number | Full source duration (s) |
| `width` / `height` | number | Video only (0 for audio) |
| `fps` | number | Video only |
| `videoCodec` / `audioCodec` | string \| null | From probe |
| `hasAudio` | boolean | From probe |
| `previewable` | boolean | Webview can decode it (R4); false → warn, don't fail |
| `thumbnailUrl` | string \| null | Cached thumbnail (video/both) |

**Validation**: `path` must exist and probe successfully or it is rejected with a clear
message and not added (FR-008). `kind`/`duration`/codecs come from `probe_video`.

### Track
A horizontal lane holding clips of a single kind.

| Field | Type | Notes |
|-------|------|-------|
| `id` | string (uuid) | |
| `kind` | `"video" \| "audio"` | A track is one kind (FR-009/013) |
| `name` | string | e.g. "V1", "A2" |
| `order` | number | Top-to-bottom index **within its kind**; higher video `order` = on top for occlusion (FR-024a) |
| `volume` | number | 0.0–2.0 (audio tracks; ignored for video) |
| `muted` | boolean | FR-019/020 |

**Rules**: A new project starts with one video + one audio track (FR-010). Tracks can be
added (FR-011) and removed with a warning when non-empty (FR-012).

### Clip
An instance of an Asset placed on a Track.

| Field | Type | Notes |
|-------|------|-------|
| `id` | string (uuid) | |
| `assetId` | string | → Asset (FR-006: many clips per asset) |
| `trackId` | string | → Track; clip.kind must match track.kind (FR-013) |
| `start` | number | Timeline position of the clip's left edge (s) |
| `in` / `out` | number | Source in/out points (s); `0 ≤ in < out ≤ asset.duration` |
| `volume` | number | 0.0–2.0 (FR-018) |
| `muted` | boolean | FR-018/020 |
| `linkId` | string \| null | → Link group; null when independent |

**Derived**: `length = out − in`; `end = start + length`. **Rules**: clips on one track
never overlap; an overlapping placement snaps to nearest free space (FR-015). Trimming
adjusts `in`/`out` only (`MIN_CLIP_LEN` floor, as today). Moving changes `trackId`/`start`
(compatible track only).

### Link (Linked Pair)
Associates a video clip and an audio clip created from the same `both` source (FR-031–034).

| Field | Type | Notes |
|-------|------|-------|
| `id` | string (uuid) | Shared `linkId` on both clips |
| `clipIds` | [string, string] | The video clip id + audio clip id |

**Rules**: While linked, move/trim apply to both, kept time-aligned (FR-032); deleting one
deletes the pair. **Unlink** clears `linkId` on both → they become independent (FR-033).

### TimelineState (root)
The whole editor document for the session.

| Field | Type | Notes |
|-------|------|-------|
| `assets` | Asset[] | Library contents |
| `tracks` | Track[] | Video + audio lanes |
| `clips` | Clip[] | All clips across tracks |
| `links` | Link[] | Linked pairs |
| `selectedClipId` | string \| null | Current selection |
| `pxPerSec` | number | Timeline zoom (existing) |

### PlaybackState (transport)
Drives the preview; owned by the playback engine/hook (R2), not persisted in the model.

| Field | Type | Notes |
|-------|------|-------|
| `playhead` | number | Current time (s) |
| `playing` | boolean | |
| `duration` | number | Derived: max clip `end` across all tracks |

---

## Relationships

```
Asset 1 ──< Clip >── 1 Track
              │
              └── 0..1 Link (pairs one video Clip with one audio Clip)
TimelineState aggregates Assets, Tracks, Clips, Links + selection + zoom
PlaybackState (playhead/playing) is derived/runtime, interprets TimelineState
```

---

## Key pure functions (in `src/timeline.ts`, unit-tested)

- `activeClipAt(track, clips, t)` → the clip on `track` covering time `t`, or null (gap).
- `topVideoClipAt(tracks, clips, t)` → the visible clip for the preview (FR-024a).
- `effectiveGain(clip, track)` → `clip.muted||track.muted ? 0 : clamp(clip.volume*track.volume, 0, 2)`.
- `sourceTimeAt(clip, t)` → `clip.in + (t − clip.start)` for the active clip.
- `snapTime(candidate, anchors, thresholdSec, disabled)` → snapped time (FR-015a).
- `placeClip(clips, trackId, desiredStart, length)` → start that avoids overlap (FR-015).
- `timelineDuration(clips)` → max `end` across clips (gaps included).
- `formatTime`, `colorForIndex` (existing) retained.

## Migration from the current model

The existing single-track `Clip` (`{id,path,name,sourceDuration,in,out,color}`) is a strict
subset. Migration: add `assetId` (split source identity into `Asset`), `trackId`, `start`,
`volume`, `muted`, `linkId`; move `sourceDuration` and `name`/`path` to `Asset`. Existing
`clipLength`, trim semantics, and the seek/playhead model are preserved and extended.

## Export payload (UI → backend; see contracts/ipc-commands.md)

A flattened, render-ready projection of the model:

```jsonc
{
  "output": "/path/out.mp4",
  "width": 1920, "height": 1080, "fps": 30,
  "videoTracks": [   // ordered bottom→top; top occludes (FR-024a)
    { "clips": [ { "path": "...", "start": 0.0, "in": 2.0, "out": 5.0 } ] }
  ],
  "audioTracks": [
    { "volume": 1.0, "muted": false,
      "clips": [ { "path": "...", "start": 0.0, "in": 2.0, "out": 5.0, "volume": 1.5, "muted": false } ] }
  ]
}
```
