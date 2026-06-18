# Video Editor (Tauri + React + ffmpeg)

A small video editor: import videos, a multi-clip timeline, scrub/playback,
trimming by dragging clip edges, and export to a single file. The frontend is
React + TypeScript; the backend is Rust calling the system `ffmpeg`/`ffprobe`.

## Prerequisites

- **Rust** (stable) and **Node.js**
- **ffmpeg** and **ffprobe** on `PATH` (e.g. `pacman -S ffmpeg`)
- Tauri system dependencies: `webkit2gtk-4.1`, `gtk3`, `libsoup3`

## Running

```bash
npm install
npm run tauri dev
```

Production build: `npm run tauri build`.

### Wayland (Hyprland) note

On some Wayland compositors WebKitGTK crashes with
`Error 71 (Protocol error) dispatching to Wayland display`. The app therefore
sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` itself on Linux (see `src-tauri/src/lib.rs`).
If it still crashes, try manually:

```bash
WEBKIT_DISABLE_COMPOSITING_MODE=1 npm run tauri dev
```

## How to use

- **+ Import video** — pick a file; it appears as a block on the timeline.
- Click the ruler or a block = **seek** (move the playhead).
- **Space** = play/pause. The **Play** / **Pause** buttons do the same.
- Drag a block's left/right edge = **trim** (in/out point).
- Multiple imported videos are placed one after another on the same track.
- Select a block, then **Delete clip** / `Delete` to remove it.
- **Export** — renders all clips (with trims) into a single `.mp4`.
- The language switcher (top right) toggles the UI language (English / Serbian).

## Architecture

```
src/                  React + TS frontend
  api.ts              invoke wrappers + file dialogs
  types.ts            Clip / VideoInfo models
  timeline.ts         pure helpers (time mapping, formatting)
  useFrameRenderer.ts hook: requests a frame from Rust and draws it (with cache)
  i18n.ts             i18next setup
  locales/            translation files (en.json, sr.json)
  components/         Toolbar, Preview, Timeline
src-tauri/src/
  ffmpeg.rs           wrapper around ffmpeg/ffprobe (probe, extract_frame, export)
  lib.rs              Tauri commands + plugin registration
```

**Playback model:** frames are fetched _on demand_ (`ffmpeg -ss ... -frames:v 1`).
The playhead advances in real time, while frames are requested as fast as
possible — with heavier material playback may skip a frame here and there, but
the timing stays accurate. This is the intentionally simplest approach to start.

## Internationalization (i18n)

UI strings live in `src/locales/*.json` and are accessed via `react-i18next`
(`useTranslation()` → `t("key")`). English is the default; Serbian is included
as a second language. To add a language, drop a new JSON file in `locales/`,
register it in `src/i18n.ts`, and add it to the `LANGUAGES` list.

## Known limitations (next steps)

- **No audio in the preview** — only the picture is shown. Audio comes out only on export.
- Playback is not frame-accurate in real time (see above). For smooth playback
  later: a streaming decoder over a pipe + a Tauri `Channel`, or WebCodecs.
- Single video track. Multiple tracks / overlaps / transitions are not here yet.
```
