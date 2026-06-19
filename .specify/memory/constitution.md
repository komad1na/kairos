<!--
SYNC IMPACT REPORT
==================
Version change: 1.0.0 → 2.0.0
Rationale: Backward-incompatible redefinition of the playback model. The original
constitution (Principle III) deferred realtime playback, audio-in-preview, and
multiple tracks as speculative and prescribed single-frame fetch
(`ffmpeg -ss … -frames:v 1`) as the playback model. Those features are now core,
ratified requirements, and the single-frame-fetch model is replaced by a
webview-based realtime preview. Two new principles formalize the non-destructive
timeline data model and the preview architecture that the original document lacked.

Modified principles:
  - II. System ffmpeg, Not Native Bindings
        → II. System ffmpeg for Probe & Render — Never in the Preview Path
  - III. Simplicity First (YAGNI)
        → V. Simplicity & Scoped Growth (YAGNI) — feature bans removed, ethos kept

Added principles:
  - III. Non-Destructive, Single-Source-of-Truth Timeline (NEW)
  - IV. Realtime Preview Lives in the Webview (NEW)

Renumbered / unchanged in substance:
  - I.   English-First & Internationalized (unchanged)
  - VI.  Clear Frontend/Backend Boundary (was IV)
  - VII. Cross-Platform Desktop Reliability (was V; preview-codec clause added)

Added/updated sections:
  - Technology & Platform Constraints (preview model, thumbnail/waveform pipeline)
  - Development Workflow & Quality Gates (preview/export parity gate, timeline tests)

Removed sections: none

Templates requiring updates:
  - .specify/templates/plan-template.md ✅ no change (generic constitution reference)
  - .specify/templates/spec-template.md ✅ no constitution-specific references
  - .specify/templates/tasks-template.md ✅ no constitution-specific references
  - .specify/templates/checklist-template.md ✅ no constitution-specific references

Follow-up TODOs:
  - Fix the v1 track ceiling (recommended: 1 video + 1 audio) and record it in the spec.
  - Decide the proxy/transcode policy for codecs WebKitGTK cannot decode (defer until hit).
-->

# Kairos Constitution

## Core Principles

### I. English-First & Internationalized

All project artifacts MUST be written in English: source code, identifiers, comments,
commit messages, documentation, and default user-facing strings. User-facing text MUST NOT
be hardcoded in components; it MUST go through i18n (`react-i18next`, `useTranslation()` →
`t("key")`) with translation files in `src/locales/*.json`. English (`en.json`) is the
canonical source of truth; every key present in `en.json` MUST exist in all other locale
files. Adding a language MUST be a drop-in: a new JSON file in `locales/`, registered in
`src/i18n.ts` and added to the `LANGUAGES` list — no code changes elsewhere.

**Rationale:** The maintainer works in Serbian but the codebase is English so it stays
contributable and readable; routing every string through i18n keeps translation a data
concern, never a code change.

### II. System ffmpeg for Probe & Render — Never in the Preview Path

The Rust backend MUST drive media work by shelling out to the system `ffmpeg` and `ffprobe`
CLIs. Native bindings (e.g. `ffmpeg-next`) are PROHIBITED unless this principle is formally
amended, because they reintroduce the native-build pain this project deliberately avoids.
All process invocation, argument construction, and output parsing MUST be isolated in
`src-tauri/src/ffmpeg.rs`; no other module shells out to media tools directly.

ffprobe is the single source of truth for media metadata (duration, streams, fps,
resolution, codecs, sample rate). ffmpeg is used for, and only for: generating timeline
thumbnails, generating audio waveform data, the final export/render, and — only if and when
a concrete need arises (Principle V) — proxy/transcode of sources the webview cannot decode.

ffmpeg MUST NOT be in the realtime preview loop. Per-frame fetch for playback is forbidden;
realtime preview is the webview's responsibility (Principle IV). `ffmpeg` and `ffprobe` are
assumed to be on `PATH`; their absence MUST surface as a clear, user-facing error rather than
a silent failure.

**Rationale:** Treating ffmpeg as an external CLI keeps the build trivial across machines and
confines the one "messy" dependency to a single, replaceable wrapper module. Keeping it out
of the realtime path is what makes smooth, audio-synced preview achievable at all.

### III. Non-Destructive, Single-Source-of-Truth Timeline

The project is a declarative description of edits, never a mutation of media. The timeline
MUST be a typed model of tracks and clips — each clip carries its source path, source in/out
points, timeline position, and gain/volume and mute state; tracks carry their own
volume/mute. Source files MUST NEVER be modified.

This timeline model is the single source of truth from which BOTH realtime preview AND the
export render are derived. What the user sees in preview MUST be what the export produces; the
two paths interpret the same model and MUST NOT diverge. The model MUST live in shared types
(`src/types.ts`) and dependency-free pure logic (`src/timeline.ts`) so it is unit-testable
without React or Tauri. Export is "bake the model to a file via ffmpeg"; preview is "interpret
the model live in the webview."

**Rationale:** One declarative model driving both playback and render is what keeps a
non-destructive editor correct, predictable, and refactorable; it eliminates an entire class
of "preview looks different from the export" bugs by construction.

### IV. Realtime Preview Lives in the Webview

Realtime preview — transport controls (play, pause, stop, seek, rewind), audio/video sync, and
audible volume — MUST be implemented in the frontend using the webview's native media playback
(HTML `<video>`/`<audio>` elements driven by a JS playback clock), NOT by streaming frames from
the backend. A frontend playback engine MUST map playhead time to the active clip(s) per track,
position/swap sources at clip boundaries, apply per-clip and per-track volume, and keep audio in
sync with video.

Smooth playback is prioritized in preview; exactness is guaranteed at export by ffmpeg
(Principle III parity still holds — the model is identical, only the renderer differs).
WebCodecs MAY be adopted later if the `<video>`-element approach proves insufficient, but it is
NOT the baseline (WebKitGTK's WebCodecs support is uneven); any such move is a Principle V
complexity decision recorded in the plan.

**Rationale:** The webview already ships a hardware-accelerated decoder and audio stack. Using
it gives realtime preview with synchronized audio essentially for free, keeps ffmpeg out of the
hot path, and keeps the backend simple.

### V. Simplicity & Scoped Growth (YAGNI)

The simplest approach that satisfies the CURRENT requirement MUST be chosen, even when it is
not the most capable. Any added complexity (new dependency, new abstraction layer, new
architectural pattern) MUST be justified against a concrete present need; "might need it later"
is NOT justification.

In scope for the current generation, and therefore explicitly NOT deferred: media import,
drag-to-timeline placement, separate video and audio tracks, per-clip and per-track volume
control, realtime preview with transport controls, and export via ffmpeg.

Deferred until a concrete need arises, and MUST NOT be built speculatively: transitions and
crossfades, clip overlap/blending, video effects/filters/color grading, keyframed parameters,
title/text layers, GPU effect pipelines, and any track count beyond the agreed v1 ceiling. The
v1 track ceiling SHOULD be fixed and minimal (recommended: one video track + one audio track)
and expanded only when a requirement demands it.

**Rationale:** This is a small, evolving editor; keeping each step minimal preserves velocity
and keeps the architecture legible while still permitting the editor to become genuinely
capable along a deliberate path.

### VI. Clear Frontend/Backend Boundary

The React + TypeScript frontend and the Rust backend MUST communicate only through Tauri
commands, and all `invoke` calls MUST be wrapped in `src/api.ts` — components MUST NOT call
`invoke` directly. Shared data shapes (e.g. `Clip`, `Track`, `VideoInfo`, the timeline model)
MUST be defined once in `src/types.ts`. Time mapping, formatting, clip lookup at a given
playhead, and other pure logic MUST live in dependency-free helper modules (e.g.
`src/timeline.ts`) so it is unit-testable without React or Tauri. Frontend components stay
presentational; media probing, thumbnail/waveform generation, and export stay in the backend.

**Rationale:** A single, typed seam between the web layer and the OS layer keeps the app
testable, refactorable, and easy to reason about — and it is exactly where the shared timeline
model lives.

### VII. Cross-Platform Desktop Reliability

The application MUST launch and run on Linux, including Wayland compositors (Hyprland is a
supported target). Known platform incompatibilities MUST be handled in code with a documented
reason, not left to the user — e.g. the app sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` in
`src-tauri/src/lib.rs` to avoid the WebKitGTK "Error 71 (Protocol error)" crash. Because
preview relies on the webview decoder (Principle IV), source codecs that WebKitGTK cannot
decode MUST degrade gracefully — a clear message or an ffmpeg-generated proxy — never a silent
black frame or muted track. Any new platform workaround MUST be commented at the call site,
reflected in the README, and MUST NOT degrade behavior on platforms that do not need it.

**Rationale:** A desktop tool that crashes on the maintainer's own compositor, or silently
fails to preview a common codec, is unusable; platform quirks belong in the code, recorded, not
in tribal knowledge.

## Technology & Platform Constraints

- **Stack:** Tauri 2 (Rust backend) + React 19 + TypeScript (Vite) frontend.
- **Media engine:** system `ffmpeg` / `ffprobe` CLIs on `PATH` for probe, thumbnails,
  waveforms, and export (see Principle II).
- **Preview engine:** webview-native HTML media elements driven by a frontend playback clock
  (see Principle IV); ffmpeg is never in the realtime path.
- **Timeline state:** a typed, non-destructive model in `src/types.ts` with pure logic in
  `src/timeline.ts` (see Principle III). Frontend state MAY use a lightweight store if
  component state proves insufficient — that adoption is a Principle V decision, not a default.
- **Timeline display assets:** filmstrip thumbnails for video clips and waveform data for audio
  clips are generated by ffmpeg/ffprobe and cached; regenerated on source change.
- **i18n:** `i18next` + `react-i18next`, English default (see Principle I).
- **Build toolchain:** stable Rust; Node.js with the scripts in `package.json`
  (`npm run tauri dev`, `npm run tauri build`). System deps: `webkit2gtk-4.1`, `gtk3`,
  `libsoup3`.
- Adding a runtime dependency (npm or crate) is a complexity decision governed by Principle V
  and MUST be justified in the change that introduces it.

## Development Workflow & Quality Gates

- **Constitution Check:** every `/speckit-plan` MUST pass the Constitution Check gate;
  violations MUST be recorded in the plan's Complexity Tracking table with the simpler
  alternative that was rejected and why.
- **Boundaries enforced in review:** changes MUST preserve the seams in Principles II, IV, and
  VI (ffmpeg only via `ffmpeg.rs` and never in the preview loop; `invoke` only via `api.ts`;
  shared types and timeline model in `types.ts`/`timeline.ts`).
- **Preview/export parity:** preview and export MUST be derived from the same timeline model
  (Principle III); any feature that affects output MUST be implemented for both paths in the
  same change, or explicitly scoped as preview-only / export-only with a recorded reason.
- **Pure logic is tested logic:** the timeline model and helpers (e.g. `timeline.ts` — clip
  lookup at playhead, time mapping, volume resolution) MUST ship with unit tests; logic that
  needs React or Tauri to exercise is a sign it belongs in a pure module instead.
- **Docs track behavior:** user-visible features, platform workarounds, codec limitations, and
  known limits MUST be reflected in the README in the same change that introduces them.
- **Build must be green:** `npm run build` (`tsc` + Vite) and a successful `npm run tauri build`
  are the baseline gates before a change is considered done.

## Governance

This constitution supersedes other practices and conventions for this project. Amendments MUST
be made by editing this file, accompanied by a Sync Impact Report (prepended as an HTML comment)
and a semantic version bump: MAJOR for removing or redefining a principle in a
backward-incompatible way, MINOR for adding a principle or materially expanding guidance, and
PATCH for clarifications and wording. When an amendment changes a rule that templates or command
docs depend on, those artifacts MUST be updated in the same change. Every plan and review MUST
verify compliance with these principles; any deviation MUST be justified in writing (the plan's
Complexity Tracking table) or the change MUST be revised to comply.

**Version**: 2.0.0 | **Ratified**: 2026-06-18 | **Last Amended**: 2026-06-18
