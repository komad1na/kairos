# Phase 1 Contract: Tauri IPC Commands (UI ↔ Backend)

The app's external interface is the set of Tauri commands the frontend calls. All calls go
through `src/api.ts` (Constitution VI); all implementations live in `src-tauri/src/lib.rs`
delegating to `src-tauri/src/ffmpeg.rs` (Constitution II). Every command returns
`Result<_, String>` — errors are human-readable and surfaced in the UI.

Legend: ✏️ = changed/new for this feature.

---

## `probe_video` (existing, reused)

Read source metadata via `ffprobe`.

- **Params**: `{ path: string }`
- **Returns**: `VideoInfo { duration, width, height, fps, codec, has_audio }`
- ✏️ **Extension**: also return `audio_codec: string | null` and, for the library, enough to
  derive `kind` (`has_video`/`has_audio`) and `previewable` (R4). If kept minimal, the
  frontend derives `kind`/`previewable` from `codec`/`has_audio`.
- **Errors**: missing file, no video stream, ffprobe not installed → clear message (FR-008).

## `generate_thumbnail` ✏️ (new; wraps existing `extract_frame`)

A single representative frame for a library item and a timeline clip (FR-003, FR-016a).

- **Params**: `{ path: string, time: number, maxWidth: number }`
- **Returns**: `tauri::ipc::Response` (raw JPEG bytes) → frontend makes a `Blob`/object URL.
- **Caching**: frontend caches by `path@time@maxWidth`.
- **Errors**: time out of range, decode failure → message; UI shows a placeholder.

## `generate_waveform` ✏️ (new)

Downsampled audio peaks for rendering an audio clip's waveform (FR-016a).

- **Params**: `{ path: string, buckets?: number }` (default bucket count, e.g. per-second)
- **Returns**: `number[]` (peaks in `0.0–1.0`, mono).
- **Implementation**: ffmpeg `-ac 1 -ar 8000 -f s16le pipe:1` → compute per-bucket peak in
  Rust (R5). Stays in `ffmpeg.rs`.
- **Caching**: frontend caches by `path` (+ bucket count).
- **Errors**: no audio stream / decode failure → message; UI shows a flat placeholder.

## `export_timeline` ✏️ (rewritten signature)

Render the whole multi-track timeline to one `.mp4` (FR-030, FR-024a, FR-020/021).

- **Params**: the export payload from [data-model.md](../data-model.md#export-payload-ui--backend-see-contractsipc-commandsmd):
  ```ts
  exportTimeline(project: {
    output: string;
    width: number; height: number; fps: number;
    videoTracks: { clips: { path: string; start: number; in: number; out: number }[] }[]; // bottom→top
    audioTracks: { volume: number; muted: boolean;
                   clips: { path: string; start: number; in: number; out: number; volume: number; muted: boolean }[] }[];
  }): Promise<void>
  ```
- **Returns**: `void` on success; output written to `output` (H.264 + AAC).
- **Behavior**: build one `filter_complex` — per-clip trim+position (gaps via tpad/adelay),
  video `overlay` bottom→top (top wins, no blending), per-clip/track `volume` + `amix`
  (R6). Pure args-builder is unit-tested with `cargo test`.
- **Errors**: empty timeline, ffmpeg failure → message (existing pattern).

## (removed from the realtime path)

`get_frame` / `extract_frame` is **no longer used for playback** (Constitution IV). It is
retained only as the engine behind `generate_thumbnail`. No per-frame IPC during preview.

---

## Frontend-only contract: media URLs

Not a Tauri command, but part of the UI↔file boundary:

- `mediaUrl(path: string): string` in `api.ts` wraps `convertFileSrc(path)` so
  `<video>`/`<audio>` can stream imported files via the asset protocol (R1). Requires
  `assetProtocol` enabled + CSP `media-src` in `tauri.conf.json`.

## Contract test expectations

| Command | Test (where) | Asserts |
|---------|--------------|---------|
| `export_timeline` args builder | `cargo test` (ffmpeg.rs) | Correct filtergraph for: 1 clip; clip with leading gap; 2 audio tracks mixed w/ volume; 2 video tracks overlapping (top wins) |
| `probe_video` | manual/quickstart | kind + previewable derivation for video / audio / both / HEVC |
| `generate_waveform` | manual/quickstart | returns N buckets in 0–1 for an audio source; error for video-without-audio handled |
| `mediaUrl`/preview | quickstart scenarios | `<video>`/`<audio>` load and play imported files |
