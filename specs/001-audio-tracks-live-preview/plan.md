# Implementation Plan: Audio, Multi-Track Timeline, Live Preview & Media Library

**Branch**: `001-audio-tracks-live-preview` | **Date**: 2026-06-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-audio-tracks-live-preview/spec.md`

## Summary

Turn the current single-track, frame-fetch clip arranger into a real editor: a left **media
library** (import once, drag clips onto the timeline), a **multi-track timeline** split into
video and audio lanes with add/remove track, **audio** with per-clip and per-track
volume/mute, and a **real-time preview** with transport controls directly beneath the
preview panel.

The decisive architectural change required by the constitution (Principle IV): the preview
stops fetching single JPEG frames from Rust and instead plays **webview-native `<video>` /
`<audio>` elements driven by a JS playback clock**, with audio routed through the Web Audio
API for gain. ffmpeg/ffprobe stay confined to `ffmpeg.rs` and are used only for metadata,
thumbnails, waveforms, and the final export — never in the realtime loop. Both preview and
export are derived from one non-destructive timeline model (Principle III).

## Technical Context

**Language/Version**: TypeScript ~5.8 (React 19) frontend; Rust (edition 2021) backend.

**Primary Dependencies**: Tauri 2, React 19, react-i18next; system `ffmpeg`/`ffprobe` CLIs.
New: **Web Audio API** (browser-native, no package) for per-clip/track gain incl. >100%;
**Vitest** (devDependency) for pure-logic unit tests (mandated by the constitution).
No new runtime npm or crate dependency is planned. State stays in React via `useReducer`
(no store library) — see research.

**Storage**: In-memory session state (library + timeline); source files are read-only on
disk. Generated thumbnails and waveform peak data are cached in memory keyed by
source+time/params (Technology & Platform Constraints).

**Testing**: Vitest for `src/timeline.ts` and reducer pure logic; `cargo test` for the pure
ffmpeg filtergraph/args builder extracted from `ffmpeg.rs`.

**Target Platform**: Linux desktop (Wayland/Hyprland a first-class target), cross-platform
Tauri desktop.

**Project Type**: Desktop app — Tauri 2 (Rust backend) + React/TS webview frontend.

**Performance Goals**: Real-time 1× playback; A/V sync drift ≤ 50 ms (SC-002); transport
actions take effect ≤ ~200 ms (SC-006); volume/mute change audible ≤ ~200 ms (SC-007);
preview of typical HD footage plays without stalls (SC-003).

**Constraints**: ffmpeg MUST NOT be in the realtime path (Principle II/IV); preview/export
parity from one model (Principle III); non-destructive sources; offline; codecs the webview
cannot decode MUST degrade gracefully, not silently (Principle VII).

**Scale/Scope**: Small personal editor — a handful of tracks, tens of clips, single user,
session-scoped (no project save/load this feature).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Plan compliance |
|-----------|-----------------|
| I. English-First & i18n | All new UI strings (library, transport, track controls, errors) added to `src/locales/en.json` + `sr.json`; no hardcoded text. |
| II. System ffmpeg for probe & render — never in preview | Thumbnails, waveform peaks, and export run in `ffmpeg.rs`; the realtime preview uses webview media elements only. `extract_frame` is repurposed to thumbnail generation, removed from the playback loop. |
| III. Non-destructive, single-source-of-truth timeline | One typed model (`src/types.ts`) + pure logic (`src/timeline.ts`); preview and export both interpret it; sources never written. |
| IV. Realtime preview lives in the webview | New `<video>`/`<audio>` + JS-clock playback engine; Web Audio gain; WebCodecs NOT adopted (baseline `<video>` per constitution). |
| V. Simplicity & scoped growth (YAGNI) | Multi-track is in-scope because the **requirement demands it** (FR-011) — within the constitution's "expand when a requirement demands it" allowance. No new runtime deps. Deferred: transitions, effects, blending, keyframing (out of scope in spec). |
| VI. Clear frontend/backend boundary | New `invoke` calls only through `src/api.ts`; shared types only in `src/types.ts`; pure logic in `src/timeline.ts`. |
| VII. Cross-platform reliability | Wayland `WEBKIT_DISABLE_DMABUF_RENDERER` workaround retained; codecs WebKitGTK can't decode surface a clear message (FR + Edge Case), not a silent black frame. |

**Quality gates**: Constitution Check (this table) ✅ · Boundaries (II/IV/VI) honored in the
module layout below · Preview/export parity is the central design invariant · Pure logic
gets unit tests (Vitest + cargo test) · README updated for the new model, codec limits, and
the enabled asset protocol · `npm run build` + `npm run tauri build` are the done gates.

**Result**: PASS — no unjustified violations. See Complexity Tracking.

**Post-design re-check (after Phase 1)**: PASS — research.md, data-model.md, and
contracts/ipc-commands.md keep the preview in the webview (R2), ffmpeg confined to
`ffmpeg.rs` (R5/R6), one model driving preview+export (data-model), and all IPC through
`api.ts` (contracts). No principle regressed.

## Project Structure

### Documentation (this feature)

```text
specs/001-audio-tracks-live-preview/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── ipc-commands.md  # Phase 1 output — Tauri command (UI↔backend) contracts
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/                              # React + TS frontend
├── types.ts                      # EXTEND: Asset, Track, Clip(+trackId,start,volume,mute,linkId),
│                                 #         TimelineState, PlaybackState
├── timeline.ts                   # EXTEND: per-track active-clip resolution at time, effective
│                                 #         volume, snapping, drop placement, total duration w/ gaps
├── timelineReducer.ts            # NEW: pure reducer + actions for timeline/library state
├── api.ts                        # EXTEND: generateThumbnail, generateWaveform, new exportTimeline
│                                 #         payload, mediaUrl(convertFileSrc) helper
├── playback/
│   ├── playbackEngine.ts         # NEW: media-element-per-track + JS master clock + Web Audio gain
│   └── usePlaybackEngine.ts      # NEW: React hook wiring engine to the timeline model + transport
├── components/
│   ├── MediaLibrary.tsx          # NEW: left panel — import, list (name/thumb/duration), drag source
│   ├── Preview.tsx               # REWRITE: hosts per-track <video>/<audio>; shows top video track
│   ├── TransportControls.tsx     # NEW: play/pause/stop/seek/jump-to-start + time readout (below preview)
│   ├── Timeline.tsx              # REWRITE: multi-lane tracks, drop target, move/trim+snap,
│   │                             #          thumbnail/waveform rendering, add/remove track
│   └── Toolbar.tsx               # SLIM: export, zoom, language (import moves to library)
├── locales/{en,sr}.json          # EXTEND: new keys
└── *.test.ts                     # NEW: Vitest unit tests for pure logic

src-tauri/src/
├── ffmpeg.rs                     # EXTEND: thumbnail (reuse extract_frame), waveform peaks,
│                                 #         multi-track export filtergraph; pure args-builder fn
└── lib.rs                        # EXTEND: register generate_thumbnail, generate_waveform,
                                  #         updated export_timeline commands

src-tauri/tauri.conf.json         # EXTEND: enable assetProtocol (scoped) + CSP media-src so
                                  #         <video>/<audio> can load imported files
src-tauri/capabilities/default.json # EXTEND: asset protocol permission if required
vitest.config.ts / package.json   # NEW devDep + script: vitest
README.md                         # UPDATE: new architecture, codec limits, asset protocol
```

**Structure Decision**: Keep the established single-project Tauri layout (frontend `src/`,
backend `src-tauri/src/`). The boundary stays exactly where the constitution puts it: shared
types in `types.ts`, pure timeline logic in `timeline.ts` (+ `timelineReducer.ts`), all IPC
in `api.ts`, all ffmpeg in `ffmpeg.rs`. The realtime preview is a new frontend-only
`playback/` subsystem so it never reaches into the backend.

## Complexity Tracking

> No constitution violations to justify. The items below are notable decisions, recorded for
> transparency, each compliant with the named principle.

| Decision | Why needed | Why it is not a violation |
|----------|------------|---------------------------|
| Add Vitest (devDependency) | Constitution requires pure logic to ship with unit tests | Test-only tooling; the testing gate mandates it, so it is required rather than speculative (Principle V). |
| Web Audio API gain graph | FR-018/019 require 0–200% volume; HTML media `.volume` caps at 1.0 | Browser-native, no package; the simplest way to meet a concrete requirement (Principle V). |
| Enable Tauri asset protocol (scoped) | `<video>`/`<audio>` must load user-imported local files for realtime preview | Configuration, not a dependency; required to satisfy Principle IV; scoped + CSP-limited for safety. |
| Multi-track (add/remove tracks) | FR-011 — user explicitly requested it | Constitution V permits expanding the track ceiling "when a requirement demands it"; recorded here and in the spec. |
