# Kairos

Kairos is a Tauri + React video editor for local, non-destructive editing.
The name comes from the idea of the right moment: montage as catching the
right frame at exactly the right time.

The app has a media library, multi-track timeline, native preview playback,
basic transforms, preview proxy cache, export profiles, project files, and
H.264/AAC export through the system `ffmpeg`.

## Current Status

- Preview uses native webview `<video>` / `<audio>` playback.
- Existing preview proxy/cache files are reused as-is.
- New video proxy/cache files try NVIDIA NVENC first, then fall back to CPU `libx264`.
- NVIDIA NVENC is also available for export when your ffmpeg build supports `h264_nvenc`.
- NVIDIA/NVDEC hardware decoding is not currently used for proxy generation.
- Source media files are never modified.

## Requirements

Install these before running the app:

- Node.js 20+ and npm
- Rust stable and Cargo
- ffmpeg and ffprobe available on `PATH`
- Tauri v2 Linux system dependencies

Arch/Manjaro example:

```bash
sudo pacman -S nodejs npm rust ffmpeg webkit2gtk-4.1 gtk3 libsoup3 librsvg
```

Ubuntu/Debian example:

```bash
sudo apt install nodejs npm cargo rustc ffmpeg \
  libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev \
  libayatana-appindicator3-dev librsvg2-dev patchelf
```

NVIDIA proxy/export support is optional. To check your ffmpeg:

```bash
ffmpeg -hide_banner -encoders | grep h264_nvenc
ffmpeg -hide_banner -hwaccels
```

## Install

```bash
npm install
```

## Run In Development

```bash
npm run tauri dev
```

If WebKitGTK crashes on Wayland/Hyprland, try:

```bash
WEBKIT_DISABLE_COMPOSITING_MODE=1 npm run tauri dev
```

The app already sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` on Linux in
`src-tauri/src/lib.rs`.

## Build

```bash
npm run tauri build
```

The built app is created under `src-tauri/target/release/bundle/`.

## Tests

```bash
npm run build
npm test -- --run
cd src-tauri && cargo test
```

## Basic Usage

1. Create a new project or open an existing `.veproj`.
2. Choose project resolution and FPS.
3. Import media from the left media panel.
4. Wait for preview cache to finish.
5. Drag media onto the timeline.
6. Use the preview controls to play, pause, stop, seek, and step frames.
7. Select a video clip and use the Transform drawer for position, scale, rotation, and fill.
8. Open Export, choose a profile or advanced settings, then render to `.mp4`.

## Preferences

Preferences include:

- language selection
- preview cache size and clear-cache button
- proxy/cache resolution: 360p, 540p, 720p, 1080p
- session logs
- default export settings
- export profile management

Proxy resolution is orientation-aware:

- `720p` horizontal proxy means up to `1280x720`
- `720p` vertical proxy means up to `720x1280`

Changing proxy resolution resets current preview paths so cache files can be
rebuilt with the new setting.

Existing cache files are not regenerated automatically just because NVIDIA
support was added. Use **Preferences > Cache > Clear cache** if you want old
CPU-made proxies to be recreated with the NVIDIA-first path.

## Export

Export uses ffmpeg and supports:

- project or preset output resolution
- CRF or manual bitrate
- AAC audio bitrate
- x264 software encoding
- NVIDIA NVENC H.264 encoding when available
- export progress with percentage and ETA
- saved export profiles

## Project Structure

```text
src/
  App.tsx                    main app shell and project/export/cache flow
  api.ts                     Tauri invoke wrappers
  types.ts                   shared editor data model
  timeline.ts                pure timeline helpers
  timelineReducer.ts         model mutations
  playback/                  native preview engine
  components/                UI components
  locales/                   English and Serbian translations

src-tauri/src/
  ffmpeg.rs                  probe, thumbnails, waveform, proxy cache, export
  lib.rs                     Tauri commands, logging, app setup
  session_log.rs             session log files
```

## Notes

- The realtime preview is native webview playback, not an ffmpeg render loop.
- ffmpeg is used for metadata, thumbnails, waveforms, proxy cache, and final export.
- Multi-track video preview displays active video layers top-to-bottom.
- If the top layer fully covers the canvas, hidden lower video layers are paused to reduce decoder load.
- Logs are saved per session and can be viewed from Preferences.
