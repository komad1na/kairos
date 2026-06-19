# Quickstart & Validation Guide

How to run the feature and prove it works end-to-end. Scenarios map to the spec's user
stories and acceptance criteria. See [data-model.md](./data-model.md) and
[contracts/ipc-commands.md](./contracts/ipc-commands.md) for shapes and commands.

## Prerequisites

- Rust (stable) and Node.js
- `ffmpeg` and `ffprobe` on `PATH`
- Tauri system deps: `webkit2gtk-4.1`, `gtk3`, `libsoup3`
- A few test media files: one video **with** audio (H.264/AAC `.mp4`), one **audio-only**
  (`.mp3`/`.m4a`), and (for codec degradation) one **HEVC/H.265** clip.

## Setup & run

```bash
npm install
npm run tauri dev      # development
# production build / gates:
npm run build          # tsc + vite (must pass)
npm test               # vitest pure-logic unit tests (must pass)
cd src-tauri && cargo test   # ffmpeg args-builder tests (must pass)
npm run tauri build    # full build gate
```

> Note: this feature enables the Tauri **asset protocol** and sets a real **CSP**
> (`media-src` allows the asset scheme) so `<video>`/`<audio>` can stream imported files. If
> media won't load, that config is the first place to check.

## Validation scenarios

### US3 — Media library & drag-to-timeline (P3)
1. Launch; the **left panel** is the media library, **preview** is on the right with
   **transport controls beneath it**, **timeline** spans the bottom (FR-001).
2. Import the video-with-audio and the audio-only file → both appear with **name,
   thumbnail/indicator, duration** and a video/audio/both badge (FR-002/003/004).
3. Drag the audio-only item onto an **audio** track → one clip at the drop point (FR-005).
4. Drag the video-with-audio item onto a **video** track → a **linked pair**: a video clip
   on the video track + an audio clip on an audio track, time-aligned (FR-031/034).
5. Drag the same item again → an independent second clip/pair (FR-006). Confirm source files
   on disk are unchanged (FR-007).
6. Try dragging the audio item onto a video track → rejected/routed, no invalid clip (FR-013).

### US2 — Multi-track organization (P2)
1. Verify a new project starts with **one video + one audio track** (FR-010).
2. Add a second audio track (FR-011); place an audio clip on it.
3. Set that clip's volume to ~150% and mute its **track**; press Play → the clip is silent
   (track mute wins, FR-020). Unmute the track, mute the **clip** → still silent (FR-020).
4. With two audio clips overlapping in time on two tracks → both are **mixed** audibly
   (FR-021).
5. Put clips on two **video** tracks overlapping in time → preview shows the **top** track's
   picture only (FR-024a). Export and confirm the same.
6. Move a clip across to another compatible track and within a track; while dragging,
   confirm it **snaps** to the playhead / adjacent edges, and holding the modifier disables
   snapping (FR-014/015a). Clips never overlap on one track (FR-015).
7. Remove a non-empty track → a **warning** appears before its clips are removed (FR-012).
8. Select a linked pair, **unlink**, then move only the audio clip independently (FR-033).

### US1 — Realtime preview with audio + transport (P1)
1. With clips on the timeline, press **Play** (button or **Spacebar**) → picture plays at
   **1× real time** with **audible, in-sync** sound; the timeline playhead tracks it
   (FR-017/022/023/027/028).
2. **Pause** → stops at the current position; Play resumes from there (AS-2).
3. **Stop** → playhead returns to start (AS-3).
4. Click/drag the ruler or use the transport **seek** → preview jumps there; audio resumes
   from the new point and stays in sync (FR-027, Edge: seek while playing).
5. Move the playhead over a **gap** → black + silence, no error/frozen frame (FR-029).
6. Confirm transport controls below the preview include **play, pause, stop, seek,
   jump-to-start, and a current-time / total-duration readout** (FR-026).

### Codec degradation (Principle VII / Edge cases)
1. Import the **HEVC** clip → it appears but is flagged **not previewable** (clear
   message/badge), not a silent black frame (FR Edge case). **Export still includes it**
   (ffmpeg decodes it).

### Preview/export parity (the core invariant)
1. Build a timeline using volume, mute, trims, gaps, two audio tracks, two video tracks.
2. Note what preview shows/sounds like; **Export** to `.mp4` (you pick only the filename,
   FR-030); play the output → it **matches** the preview (SC-004).

## Success-criteria checks
- A/V drift stays imperceptible (≤ 50 ms) across a clip (SC-002).
- Transport actions feel instant (≤ ~200 ms) (SC-006); volume/mute changes audible quickly
  (SC-007).
- Import → place on a video + an audio track → preview with sound → export, all in-app,
  no external tools (SC-008).

## Gates before "done"
`npm run build` ✅ · `npm test` ✅ · `cargo test` ✅ · `npm run tauri build` ✅ · README
updated (new model, asset protocol, codec limits) ✅ · new UI strings in `en.json` + `sr.json` ✅.
