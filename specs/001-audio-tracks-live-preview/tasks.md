---
description: "Task list for Audio, Multi-Track Timeline, Live Preview & Media Library"
---

# Tasks: Audio, Multi-Track Timeline, Live Preview & Media Library

**Input**: Design documents from `specs/001-audio-tracks-live-preview/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/ipc-commands.md](./contracts/ipc-commands.md)

**Tests**: Unit tests for **pure logic** are INCLUDED because the constitution's quality gate
("pure logic is tested logic") mandates them — Vitest for `src/timeline.ts` + the reducer,
`cargo test` for the ffmpeg export args-builder. Broader UI/integration tests are NOT
generated (validated manually via [quickstart.md](./quickstart.md)).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 (user-story phases only)
- File paths are repo-relative.

## Path Conventions

Single Tauri project: frontend in `src/`, backend in `src-tauri/src/` (per plan.md Structure Decision).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Tooling and platform config needed before any model/preview work.

- [X] T001 [P] Add **Vitest** devDependency, create `vitest.config.ts`, and add a `"test": "vitest"` script in `package.json`
- [X] T002 [P] Enable the Tauri **asset protocol** (scoped) and set a real **CSP** (allow the asset scheme for `media-src` and `img-src`) in `src-tauri/tauri.conf.json`; add the asset-protocol permission in `src-tauri/capabilities/default.json` if required (research R1)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared, non-destructive timeline model + pure logic + reducer + app shell that EVERY story builds on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T003 Extend the data model in `src/types.ts`: add `Asset`, `Track`, `Clip` (with `assetId`, `trackId`, `start`, `in`, `out`, `volume`, `muted`, `linkId`), `Link`, `TimelineState`, `PlaybackState`; keep `clipLength` (data-model.md)
- [X] T004 [P] Implement pure timeline helpers in `src/timeline.ts`: `activeClipAt`, `topVideoClipAt`, `sourceTimeAt`, `effectiveGain`, `timelineDuration`, `placeClip` (no-overlap), `snapTime` (anchors + disable flag) (data-model.md, FR-015/015a/024a)
- [X] T005 [P] Vitest unit tests for the timeline helpers in `src/timeline.test.ts` (gap resolution, top-video occlusion, gain incl. mute, snapping, no-overlap placement)
- [X] T006 Create the pure reducer + action types in `src/timelineReducer.ts` (import asset, add/move/trim/delete clip, add/remove track, set clip & track volume/mute, link/unlink, select, set playhead, set zoom) — depends on T003/T004
- [X] T007 [P] Vitest unit tests for the reducer in `src/timelineReducer.test.ts`
- [X] T008 Add `mediaUrl(path)` wrapper (`convertFileSrc`) and the multi-track export payload **type** in `src/api.ts` (contracts/ipc-commands.md)
- [X] T009 Build the app-shell layout (CSS grid: **left** library · **right** preview + transport-below · **bottom** timeline, FR-001) and wire the reducer via context in `src/App.tsx` and `src/App.css`
- [X] T010 Adapt the existing timeline render to the new model (clips positioned by `start`/length across the default tracks, ruler, click-seek, playhead) in `src/components/Timeline.tsx` — minimal version so preview has something to drive; full multi-lane UI is US2
- [X] T011 Implement import-to-model in `src/timelineReducer.ts` + `src/App.tsx`: `probe_video` → create `Asset` → create a **linked video+audio clip pair** on default `V1`/`A1` tracks (FR-031 creation logic) so every story has data

**Checkpoint**: Foundation ready — the model, pure logic, reducer, layout, and a populatable timeline exist.

---

## Phase 3: User Story 1 - Watch and hear the edit in real time (Priority: P1) 🎯 MVP

**Goal**: Real-time webview preview with synchronized, audible audio and transport controls directly below the preview panel.

**Independent Test**: Import a video-with-audio, press Play → picture plays at 1× with in-sync sound; pause/stop/seek work; playhead tracks playback; a gap shows black + silence.

- [X] T012 [US1] Implement the playback engine in `src/playback/playbackEngine.ts`: one muted `<video>` per video track + one `<audio>` per audio track, a JS master clock (`requestAnimationFrame`+`performance.now()`), play/pause/stop/seek, drift correction (≤50 ms), clip-boundary `src` swap, top-video selection, gap→black/silence (research R2; FR-022/023/024a/029)
- [X] T013 [US1] Add the **Web Audio** gain graph to `src/playback/playbackEngine.ts` (`AudioContext`→`MediaElementAudioSourceNode`→`GainNode`→destination; gain = `effectiveGain`, supports >100%) — depends on T012 (research R3; FR-017/020)
- [X] T014 [US1] Create the `usePlaybackEngine` hook in `src/playback/usePlaybackEngine.ts` binding the engine to `TimelineState` + `PlaybackState` (mount/teardown elements, react to model changes) — depends on T012/T013
- [X] T015 [US1] Rewrite `src/components/Preview.tsx` to host the per-track media elements and show the topmost video track (empty placeholder when no clips); remove the canvas frame-fetch playback path (retire `src/useFrameRenderer.ts` from the preview loop — Constitution IV)
- [X] T016 [P] [US1] Create `src/components/TransportControls.tsx` (play, pause, stop, seek/scrub, jump-to-start, current-time / total-duration readout) rendered directly beneath the preview (FR-026)
- [X] T017 [US1] Wire transport actions + **Spacebar** toggle + timeline click/drag seek to the playhead, and make the playhead track playback, in `src/App.tsx` — depends on T014/T015/T016 (FR-027/028)
- [X] T018 [P] [US1] Add i18n keys for transport + preview strings in `src/locales/en.json` and `src/locales/sr.json` (Constitution I)

**Checkpoint**: MVP — the editor previews edits with synchronized audio and full transport.

---

## Phase 4: User Story 2 - Organize media on separate video and audio tracks (Priority: P2)

**Goal**: A multi-lane timeline (separate video/audio tracks, add/remove tracks), per-clip and per-track volume/mute with live mixing, move/trim with snapping, clip visuals, and multi-track export.

**Independent Test**: Add a 2nd audio track, place a clip, set its volume 150% and mute its track → silent; two simultaneous audio clips mix; two overlapping video tracks show only the top; export matches preview.

- [X] T019 [P] [US2] Backend: add `generate_waveform` (decode → mono PCM `s16le` → per-bucket peaks) and `generate_thumbnail` (wraps existing `extract_frame`) in `src-tauri/src/ffmpeg.rs`; register both commands in `src-tauri/src/lib.rs` (research R5; contracts)
- [X] T020 [P] [US2] Add `generateThumbnail` and `generateWaveform` invoke wrappers in `src/api.ts` (contracts/ipc-commands.md)
- [X] T021 [US2] Rewrite `src/components/Timeline.tsx` into multi-lane tracks (distinct video/audio lanes, per-track header, **add track** of either kind, **remove track** with a confirm when non-empty) (FR-009/010/011/012)
- [X] T022 [US2] Add clip **move** within/across compatible tracks and **trim**, with snapping to anchors + modifier-to-disable and no-overlap placement, in `src/components/Timeline.tsx` — depends on T021 (FR-013/014/015/015a)
- [X] T023 [US2] Render clip visuals on the timeline — a single representative **thumbnail** for video clips and a **waveform** canvas for audio clips, plus labels — in `src/components/Timeline.tsx`, using T019/T020 — depends on T021 (FR-016a)
- [X] T024 [US2] Add per-clip and per-track **volume sliders (0–200%) + mute** controls wired to reducer actions, applied live by the engine, in `src/components/Timeline.tsx` and `src/playback/usePlaybackEngine.ts` — depends on T021 (FR-018/019/020/021)
- [X] T025 [US2] Backend: rewrite `ffmpeg::export` for multi-track in `src-tauri/src/ffmpeg.rs` — extract a **pure args-builder** function (per-clip trim+position with gaps, video `overlay` bottom→top = top wins, per-clip/track `volume` + `amix`, `.mp4` H.264+AAC); update the `export_timeline` command in `src-tauri/src/lib.rs` (research R6; FR-020/021/024a/030)
- [X] T026 [P] [US2] `cargo test` for the export args-builder in `src-tauri/src/ffmpeg.rs` (cases: single clip; clip with leading gap; two audio tracks mixed with volume; two video tracks overlapping → top wins) — depends on T025
- [X] T027 [US2] Update the `exportTimeline` wrapper and the export handler to send the multi-track payload in `src/api.ts` and `src/App.tsx` (data-model.md export payload)
- [X] T028 [P] [US2] Add i18n keys for track controls, volume/mute, and export strings in `src/locales/en.json` and `src/locales/sr.json`

**Checkpoint**: Multi-track editing with audio mixing and parity-preserving export works.

---

## Phase 5: User Story 3 - Import once, reuse by dragging from a media library (Priority: P3)

**Goal**: A left media-library panel listing imported files (name, thumbnail/indicator, duration, kind badge) as drag sources; drag-to-timeline creates clips (linked pairs for both-kind sources); reuse; unlink; codec degradation messaging.

**Independent Test**: Import two files → both listed with thumbnail/duration; drag one to a video track → linked pair; drag again → independent second clip; sources unchanged; an HEVC file is flagged not-previewable.

- [X] T029 [P] [US3] Create `src/components/MediaLibrary.tsx` (left panel): list assets with name, thumbnail (video) / audio indicator, duration, and a video/audio/both badge; items are drag sources carrying the asset id (FR-002/003/004)
- [X] T030 [US3] Move import into the library (populate assets only, no auto-placement) and remove the Import button from `src/components/Toolbar.tsx`, updating `src/App.tsx` (FR-002)
- [X] T031 [US3] Implement drag-from-library → drop-on-track-lane to create a clip at the drop time, routing both-kind sources into a **linked video+audio pair** (audio-only → single audio clip), in `src/components/Timeline.tsx` + reducer — depends on T021 (FR-005/031/034)
- [X] T032 [US3] Reject/route incompatible drops and allow reusing one asset for multiple independent clips, in the reducer + `src/components/Timeline.tsx` (FR-006/013)
- [X] T033 [US3] Add an **unlink** action for linked pairs (then independent move/trim/delete) in `src/components/Timeline.tsx` + reducer (FR-033)
- [X] T034 [US3] Derive and surface a **not-previewable** flag (from probe codecs, research R4) as a clear badge/message on library items and timeline clips — never a silent black frame (FR edge case; Constitution VII)
- [X] T035 [P] [US3] Add i18n keys for library, linking, and codec-warning strings in `src/locales/en.json` and `src/locales/sr.json`

**Checkpoint**: Full media-library workflow with linking and graceful codec handling.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Docs, extra tests, parity verification, and the build gates.

- [X] T036 [P] Update `README.md`: webview-based preview, enabled asset protocol + CSP, codec limitations, and the multi-track non-destructive model (Constitution: docs track behavior)
- [X] T037 [P] Add edge-case unit tests (snapping/placement boundaries, reducer link/unlink/delete-pair) in `src/timeline.test.ts` and `src/timelineReducer.test.ts`
- [X] T038 Preview/export **parity** verification pass (volume, mute, trims, gaps, top-wins video) and reconcile any divergence (Constitution III; SC-004)
- [X] T039 [P] Run the [quickstart.md](./quickstart.md) validation scenarios (US1–US3 + parity + codec degradation)
- [X] T040 Run the build gates: `npm run build`, `npm test`, `cd src-tauri && cargo test`, and `npm run tauri build` — all green

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup — **blocks all user stories**.
- **User Stories (Phase 3–5)**: all depend on Foundational. US1 is the MVP; US2 builds on US1's playback engine; US3 builds on US2's multi-lane timeline + media commands.
- **Polish (Phase 6)**: depends on the desired stories being complete.

### Cross-Story Notes (intentional, ordered by priority)

- **US2** uses the **US1** playback engine for live volume/mute and mixing.
- **US3** reuses `generate_thumbnail` (built in US2/T019) for library thumbnails and the multi-lane timeline + drop logic from **US2** (T021).
- These follow the P1→P2→P3 order, so sequential delivery satisfies them automatically.

### Within a Story

- Models/types before pure logic before reducer before UI.
- Backend command before its frontend wrapper before the UI that calls it.
- `Timeline.tsx` tasks within US2 (T021→T022→T023→T024) are sequential (same file).

### Parallel Opportunities

- Setup: T001 ∥ T002.
- Foundational: T004 ∥ (its test) T005; reducer test T007 in parallel with other-file work; T003 must precede T004/T006.
- US1: T016 (TransportControls) ∥ T018 (i18n) while the engine (T012→T013→T014) progresses.
- US2: T019 (backend) ∥ T020 (wrapper) ∥ T028 (i18n); T026 (cargo test) after T025.
- US3: T029 (panel) ∥ T035 (i18n).
- Polish: T036 ∥ T037 ∥ T039.

---

## Parallel Example: User Story 1

```bash
# After the engine hook (T014) and Preview (T015) land, these are independent files:
Task: "T016 [US1] Create src/components/TransportControls.tsx"
Task: "T018 [US1] Add transport/preview i18n keys in src/locales/en.json and sr.json"
```

## Parallel Example: User Story 2

```bash
# Independent files at the start of US2:
Task: "T019 [US2] Backend generate_waveform + generate_thumbnail in src-tauri/src/ffmpeg.rs + lib.rs"
Task: "T020 [US2] api.ts wrappers generateThumbnail/generateWaveform"
Task: "T028 [US2] Track/volume/export i18n keys in src/locales/en.json and sr.json"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 (Setup) → 2. Phase 2 (Foundational, blocks everything) → 3. Phase 3 (US1).
4. **STOP and VALIDATE**: import a clip, play it back with sound, seek, pause/stop — the
   editor now previews edits in real time. This is a demoable MVP.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. **US1** → realtime preview with audio (MVP) → validate/demo.
3. **US2** → multi-track + volume/mixing + multi-track export → validate/demo.
4. **US3** → media library + drag + linking + codec handling → validate/demo.
5. Polish → docs, parity, build gates.

### Notes

- `[P]` = different files, no incomplete-task dependency.
- The preview/export **parity** invariant (Constitution III) is verified in T038 and must
  hold for every output-affecting change.
- Commit after each task or logical group; stop at any checkpoint to validate a story.
