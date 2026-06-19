# Phase 0 Research: Audio, Multi-Track Timeline, Live Preview & Media Library

All decisions below are constrained by the constitution (v2.0.0): realtime preview lives in
the webview, ffmpeg never in the preview loop, one non-destructive model drives preview AND
export, no speculative dependencies.

---

## R1. Serving local source files to webview media elements

**Decision**: Enable Tauri's **asset protocol** (`app.security.assetProtocol` with
`enable: true` and a scope covering imported paths) and load files in `<video>`/`<audio>`
via `convertFileSrc(path)` from `@tauri-apps/api/core`. Add a CSP that permits the asset
scheme for `media-src` (and keep `img-src` for thumbnails if served the same way).

**Rationale**: The asset protocol streams files with HTTP range support, which is exactly
what `<video>` needs for seeking. It keeps the backend out of the hot path (Principle IV)
and requires no per-frame IPC. `convertFileSrc` is the supported, documented bridge.

**Alternatives considered**:
- *Read whole file → Blob URL*: loads entire (possibly GB) videos into memory; no range
  seeking. Rejected.
- *Custom `tauri://` command streaming bytes*: reinvents the asset protocol; more code,
  worse seeking. Rejected.
- *`file://` directly*: blocked by webview security/CSP; not portable. Rejected.

**Notes**: CSP is currently `null` (fully open) in `tauri.conf.json`. We will set a real
CSP that explicitly allows the asset scheme for media; document this in the README. Scope
the asset protocol as narrowly as practical (the directories users import from).

---

## R2. Realtime multi-track preview architecture

**Decision**: One media element **per track** — a muted `<video>` per video track, an
`<audio>` per audio track — all positioned/sized by CSS; a **single JS master clock**
(`requestAnimationFrame` + `performance.now()`) owns playhead time. Each frame: for every
track, resolve the active clip at the playhead (pure fn in `timeline.ts`), point that
element's `src` at the clip source (via `convertFileSrc`) and set `currentTime` to the
mapped source time; play/pause all elements together. The **visible picture** is the
topmost video track that has an active clip (FR-024a); lower video elements are hidden via
CSS. Audio is never taken from video elements (they are muted) — all audible audio comes
from audio-track elements, because a video+audio source is split into a linked pair
(FR-031), so the audio lives on an audio track.

**Sync strategy**: Treat the JS clock as the source of truth. Each animation tick, if a
playing element's `currentTime` drifts from the expected source time by more than a small
threshold (~50 ms, SC-002), nudge it (`element.currentTime = expected`); for larger jumps
(seek, clip boundary) set it directly. This keeps drift within the perceptible margin
without a hard dependency on any single element's clock.

**Clip boundaries**: When the playhead crosses into a new clip on a track, swap that
element's `src` and seek. To avoid an audible/visible gap, optionally preload the next
clip's source on a second hidden element per track and switch (double-buffer). Baseline
(single element + swap) is implemented first; double-buffering is a follow-up only if seams
are noticeable (Principle V).

**Rationale**: The webview ships a hardware-accelerated decoder and audio stack; using one
element per track gives synchronized multi-source playback essentially for free and matches
the export model 1:1 (Principle III/IV).

**Alternatives considered**:
- *WebCodecs + canvas compositing*: WebKitGTK support is uneven (constitution warns);
  large complexity. Deferred, not baseline.
- *Single `<video>` re-pointed for all tracks*: cannot play simultaneous audio tracks.
  Rejected.
- *Backend frame streaming over a Channel*: puts ffmpeg back in the realtime path —
  forbidden by Principle II/IV. Rejected.

---

## R3. Volume and gain (0–200%) in preview

**Decision**: Route each audio-producing element through the **Web Audio API**:
`AudioContext` → `MediaElementAudioSourceNode(element)` → `GainNode` →
`AudioContext.destination`. Effective gain = `clipVolume × trackVolume` (each 0–2.0),
clamped to the 0–2.0 range (FR-018/019); mute (clip or track) sets gain to 0. Element
`.volume` is left at 1.0 and all level control happens in the gain node, so values above
100% work.

**Rationale**: HTML media `.volume` is capped at 1.0, so it cannot satisfy the 0–200%
requirement; a `GainNode` can exceed 1.0. It is browser-native (no dependency) and updates
sample-accurately, meeting SC-007's responsiveness.

**Alternatives considered**:
- *`element.volume` only*: cannot boost above 100%. Rejected (fails FR).
- *A npm audio mixing library*: unnecessary dependency for one gain node (Principle V).
  Rejected.

**Export parity**: ffmpeg applies the same factor via the `volume`/`amix` filters
(weights), so preview and export levels match (Principle III).

---

## R4. Codec compatibility & graceful degradation (Principle VII)

**Decision**: After `ffprobe`, classify a source as webview-previewable based on its codecs
(H.264/VP8/VP9/AV1 video, AAC/Opus/Vorbis/MP3 audio in supported containers are the safe
set for WebKitGTK; H.265/HEVC and exotic codecs are flagged). If a clip cannot be previewed,
show a clear message/badge on the clip and in the library item rather than a silent black
frame or muted track. **Export is unaffected** — ffmpeg decodes everything.

**Rationale**: Honors Principle VII (no silent failure) while keeping scope tight. An
ffmpeg-generated preview **proxy/transcode** for unsupported codecs is explicitly **deferred
until a concrete need is hit** (resolves the constitution's open follow-up TODO): we record
the decision point but do not build it now (Principle V).

**Alternatives considered**:
- *Always transcode to a proxy on import*: heavy, slow, premature. Deferred.
- *Ignore the problem*: violates Principle VII. Rejected.

---

## R5. Thumbnail and waveform generation

**Decision (thumbnail)**: Reuse the existing `extract_frame` (ffmpeg `-ss -frames:v 1` →
JPEG bytes) for both the library item thumbnail and the single timeline-clip thumbnail
(FR-003, FR-016a). Expose as a `generate_thumbnail` command; cache by `path@time@width`.

**Decision (waveform)**: Add a `generate_waveform` command that runs ffmpeg to decode audio
to mono PCM at a low sample rate (`-ac 1 -ar 8000 -f s16le pipe:1`) and computes a
downsampled **peaks array** (e.g. ~1–2 px worth of peaks per second, or a fixed bucket
count) in Rust, returned as `Vec<f32>` (0–1). The frontend renders peaks to a `<canvas>` at
any zoom (FR-016a). Cache by source path.

**Rationale**: A peaks array is resolution-independent (re-render on zoom without
re-decoding), small to transfer, and cache-friendly — better than a fixed-size
`showwavespic` PNG. Thumbnail reuse avoids new code. Both stay inside `ffmpeg.rs`
(Principle II).

**Alternatives considered**:
- *`showwavespic` PNG*: simplest but fixed width, blurry on zoom, larger payload. Rejected
  as the primary path (acceptable fallback if peak extraction proves troublesome).
- *Web Audio `decodeAudioData` in the frontend for peaks*: would pull full audio into the
  webview and duplicate decode work; keeping it in ffmpeg matches Principle II. Rejected.

---

## R6. Multi-track export filtergraph

**Decision**: Rebuild `ffmpeg::export` to take the full timeline (tracks + clips with
positions, trims, volume, mute, link/track order) and emit one `filter_complex`:
- **Per clip**: `trim`/`atrim` + `setpts`/`asetpts` to the source in/out; place on the
  timeline by padding with `tpad`/`color` gaps (video) and `adelay`/`apad` (audio) so each
  clip starts at its timeline position.
- **Video compositing (top-wins, FR-024a)**: build a base black canvas at the project
  resolution and `overlay` each video track from bottom to top by `enable='between(t,...)'`
  per clip, so the topmost active clip occludes lower ones (no blending).
- **Audio mixing (FR-021)**: apply per-clip then per-track `volume`, then `amix` (or
  `amerge`+pan) across all audio streams; normalize to avoid clipping.
- Encode to `.mp4` H.264 (`libx264`) + AAC (FR-030, clarified). Keep the existing
  `-preset/-crf/-pix_fmt yuv420p` defaults.

**Decision (testability)**: Extract a **pure function** that, given the timeline payload,
returns the ordered `Vec<String>` of ffmpeg args (no process spawn). `cargo test` asserts
the filtergraph for representative timelines (single clip, gap, two audio tracks, two video
tracks overlapping). The thin wrapper spawns the process.

**Rationale**: A pure args-builder is the constitution's "pure logic is tested logic" gate
applied to Rust, and it makes preview/export parity reviewable. Overlay+amix is the standard
ffmpeg approach for layered video and mixed audio.

**Alternatives considered**:
- *Multiple intermediate render passes / temp files*: slower, more failure modes than one
  filtergraph. Rejected for this scope.
- *Keep the current concat-only export*: cannot express tracks, gaps, overlap, or per-clip
  volume. Rejected (insufficient).

---

## R7. Frontend state management

**Decision**: Model the editor state (library, tracks, clips, selection, playback,
zoom) with a **`useReducer`** reducer in `src/timelineReducer.ts` plus a small React context
to share dispatch — **no store library**. The reducer is pure and unit-tested with Vitest.

**Rationale**: The state is non-trivial but bounded; a typed reducer keeps mutations
centralized, testable, and free of new dependencies (Principle V/III/VI). The constitution
explicitly says a store is a Principle-V decision, "not a default" — `useReducer` is the
lighter choice that suffices.

**Alternatives considered**:
- *Zustand/Redux*: new runtime dependency for state a reducer already handles. Deferred —
  adopt only if reducer composition proves unwieldy.
- *Keep ad-hoc `useState` in `App.tsx`*: doesn't scale to tracks/clips/linking and
  scatters logic out of testable pure code. Rejected.

---

## R8. Drag-and-drop: library → timeline, and clip move/trim with snapping

**Decision**: Use **pointer-event-based** dragging (consistent with the existing
trim-drag in `Timeline.tsx`) rather than the HTML5 Drag-and-Drop API. A drag from a library
item carries the asset id; on drop over a track lane, compute the drop time from cursor X
and `pxPerSec`, then dispatch a create-clip action. Reuse the same pointer model for moving
clips between/within tracks and trimming. **Snapping** (FR-015a): a pure helper in
`timeline.ts` snaps a candidate edge time to the nearest anchor (playhead, other clip
edges, timeline start) within a pixel threshold; a held modifier key (e.g. Alt) disables it.

**Rationale**: Pointer events already work in this codebase (WebKitGTK), give precise
control over snapping and the no-overlap rule (FR-015), and avoid HTML5 DnD quirks under
WebKitGTK. Snapping as a pure function is unit-testable (constitution gate).

**Alternatives considered**:
- *HTML5 DnD API*: ghost-image and drop-effect behavior is inconsistent across WebKitGTK;
  harder to implement snap previews. Rejected.
- *A DnD library (dnd-kit, react-dnd)*: new dependency for behavior the pointer model
  already covers (Principle V). Rejected.

---

## Resolved unknowns summary

| Unknown | Resolution |
|---------|------------|
| How does the webview load local media? | Tauri asset protocol + `convertFileSrc` + CSP (R1) |
| How is multi-track realtime preview built? | One media element/track + JS master clock + drift correction (R2) |
| How to get 0–200% volume? | Web Audio API `GainNode` (R3) |
| Codecs the webview can't decode? | Detect via ffprobe, warn clearly; proxy deferred (R4) |
| Thumbnails & waveforms? | ffmpeg: reuse frame extract; PCM→peaks array (R5) |
| Multi-track export? | One `filter_complex`: overlay (top-wins) + amix; pure args-builder + cargo test (R6) |
| State management? | `useReducer` + context, no store dependency (R7) |
| Drag/drop & snapping? | Pointer events; pure snapping helper with modifier override (R8) |

No `NEEDS CLARIFICATION` items remain.
