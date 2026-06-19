<div align="center">

# 🎬 Kairos

**A local, non-destructive video editor built with Tauri + React.**

The name comes from the idea of the *right moment* — montage as catching the
right frame at exactly the right time.

[![Tauri](https://img.shields.io/badge/Tauri-v2-24C8DB?logo=tauri&logoColor=white)](https://tauri.app)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Rust](https://img.shields.io/badge/Rust-stable-000000?logo=rust&logoColor=white)](https://www.rust-lang.org)
[![Ant Design](https://img.shields.io/badge/Ant%20Design-6-0170FE?logo=antdesign&logoColor=white)](https://ant.design)
[![FFmpeg](https://img.shields.io/badge/FFmpeg-required-007808?logo=ffmpeg&logoColor=white)](https://ffmpeg.org)

</div>

---

## ✨ Overview

Kairos provides a media library, a multi-track timeline, native preview
playback, basic transforms, a preview proxy cache, export profiles, project
files, and H.264/AAC export through the system `ffmpeg`.

| Feature | Description |
| --- | --- |
| 🎞️ **Media library** | Import and organize source clips |
| 🧱 **Multi-track timeline** | Layer video and audio non-destructively |
| ▶️ **Native preview** | Webview `<video>` / `<audio>` playback |
| 🎛️ **Transforms** | Position, scale, rotation, and fill per clip |
| ⚡ **Proxy cache** | Lower-res proxies for smooth previewing |
| 📦 **Export profiles** | Reusable, saved export settings |
| 💾 **Project files** | Save and reopen work as `.veproj` |

## 📌 Current Status

- Preview uses native webview `<video>` / `<audio>` playback.
- Existing preview proxy/cache files are reused as-is.
- New video proxy/cache files try **NVIDIA NVENC** first, then fall back to CPU `libx264`.
- NVIDIA NVENC is also available for **export** when your ffmpeg build supports `h264_nvenc`.
- NVIDIA/NVDEC hardware decoding is **not** currently used for proxy generation.
- Source media files are **never** modified.

## 🧰 Requirements

Install these before running the app:

- **Node.js 20+** and **npm**
- **Rust** stable and **Cargo**
- **ffmpeg** and **ffprobe** available on `PATH`
- **Tauri v2** Linux system dependencies

<details>
<summary><strong>Arch / Manjaro</strong></summary>

```bash
sudo pacman -S nodejs npm rust ffmpeg webkit2gtk-4.1 gtk3 libsoup3 librsvg
```

</details>

<details>
<summary><strong>Ubuntu / Debian</strong></summary>

```bash
sudo apt install nodejs npm cargo rustc ffmpeg \
  libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev \
  libayatana-appindicator3-dev librsvg2-dev patchelf
```

</details>

NVIDIA proxy/export support is optional. To check your ffmpeg:

```bash
ffmpeg -hide_banner -encoders | grep h264_nvenc
ffmpeg -hide_banner -hwaccels
```

## 🚀 Getting Started

**Install dependencies:**

```bash
npm install
```

**Run in development:**

```bash
npm run tauri dev
```

> [!TIP]
> If WebKitGTK crashes on Wayland/Hyprland, try:
> ```bash
> WEBKIT_DISABLE_COMPOSITING_MODE=1 npm run tauri dev
> ```
> The app already sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` on Linux in
> [`src-tauri/src/lib.rs`](src-tauri/src/lib.rs).

## 📦 Building

| Target | Command | Output |
| --- | --- | --- |
| Linux `.deb` | `npm run build:linux` | `src-tauri/target/release/bundle/` |
| Windows `.exe` | `npm run build:windows` | NSIS installer bundle |
| Arch `.pkg.tar.zst` | `npm run build:arch` | `packaging/arch/` |

```bash
npm run build:linux:deb
npm run build:windows:exe
npm run build:arch
```

> [!NOTE]
> - Run the Windows build on a Windows machine or CI runner with the Tauri
>   Windows toolchain installed.
> - The Arch package uses `packaging/arch/PKGBUILD` and `makepkg`. Tauri has no
>   native Arch/pacman bundle target, so it is handled outside `tauri.conf.json`.
> - Default Tauri bundling is limited to `.deb` in `src-tauri/tauri.conf.json`,
>   so `npm run tauri -- build` no longer tries AppImage, RPM, or macOS bundles.
> - macOS bundles are intentionally not enabled right now.

## 🧪 Tests

```bash
npm run build          # type-check + bundle
npm test -- --run      # frontend unit tests
cd src-tauri && cargo test
```

## 📖 Basic Usage

1. Create a new project or open an existing `.veproj`.
2. Choose project resolution and FPS.
3. Import media from the left media panel.
4. Wait for the preview cache to finish.
5. Drag media onto the timeline.
6. Use the preview controls to play, pause, stop, seek, and step frames.
7. Select a video clip and use the **Transform** drawer for position, scale, rotation, and fill.
8. Open **Export**, choose a profile or advanced settings, then render to `.mp4`.

## ⚙️ Preferences

- Language selection
- Preview cache size and clear-cache button
- Proxy/cache resolution: 360p, 540p, 720p, 1080p
- Session logs
- Default export settings
- Export profile management

Proxy resolution is **orientation-aware**:

- `720p` horizontal proxy means up to `1280x720`
- `720p` vertical proxy means up to `720x1280`

> [!IMPORTANT]
> - Changing proxy resolution resets current preview paths so cache files can be
>   rebuilt with the new setting.
> - Existing cache files are not regenerated automatically just because NVIDIA
>   support was added. Use **Preferences → Cache → Clear cache** if you want old
>   CPU-made proxies recreated with the NVIDIA-first path.

## 🎥 Export

Export uses ffmpeg and supports:

- Project or preset output resolution
- CRF or manual bitrate
- AAC audio bitrate
- x264 software encoding
- NVIDIA NVENC H.264 encoding when available
- Export progress with percentage and ETA
- Saved export profiles

## 🗂️ Project Structure

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

## 📝 Notes

- The realtime preview is native webview playback, not an ffmpeg render loop.
- ffmpeg is used for metadata, thumbnails, waveforms, proxy cache, and final export.
- Multi-track video preview displays active video layers top-to-bottom.
- If the top layer fully covers the canvas, hidden lower video layers are paused to reduce decoder load.
- Logs are saved per session and can be viewed from Preferences.
