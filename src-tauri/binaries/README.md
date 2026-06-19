# Bundled Windows binaries

Place `ffmpeg.exe` and `ffprobe.exe` here **before a Windows build**. They are
copied next to the app by `tauri.windows.conf.json` (`bundle.resources`) and the
app prefers them over any `ffmpeg` on `PATH` (see `resolve_program` in
`src/ffmpeg.rs`).

The `.exe` files are git-ignored (large); download them per machine / in CI:

- https://www.gyan.dev/ffmpeg/builds/ (ffmpeg-release-essentials.zip)
- https://github.com/BtbN/FFmpeg-Builds/releases

Copy `ffmpeg.exe` and `ffprobe.exe` from the archive's `bin/` folder into this
directory. Only needed for Windows; Linux/Arch use the system ffmpeg.
