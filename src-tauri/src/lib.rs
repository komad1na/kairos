mod ffmpeg;

use ffmpeg::{ExportClip, VideoInfo};

/// Reads metadata (duration, dimensions, fps, codec, audio) of the chosen video.
#[tauri::command]
async fn probe_video(path: String) -> Result<VideoInfo, String> {
    tauri::async_runtime::spawn_blocking(move || ffmpeg::probe(&path))
        .await
        .map_err(|e| e.to_string())?
}

/// Returns a single frame at the given time as raw JPEG bytes.
/// The frontend turns this into a `Blob` -> `ImageBitmap` and draws it on a canvas.
#[tauri::command]
async fn get_frame(
    path: String,
    time: f64,
    max_width: u32,
) -> Result<tauri::ipc::Response, String> {
    let bytes =
        tauri::async_runtime::spawn_blocking(move || ffmpeg::extract_frame(&path, time, max_width))
            .await
            .map_err(|e| e.to_string())??;
    Ok(tauri::ipc::Response::new(bytes))
}

/// Renders the timeline clips into a single output file via ffmpeg.
#[tauri::command]
async fn export_timeline(clips: Vec<ExportClip>, output: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || ffmpeg::export(&clips, &output))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Workaround for WebKitGTK + Wayland (Hyprland/wlroots): crash with
    // "Error 71 (Protocol error) dispatching to Wayland display".
    // The DMABUF renderer breaks on some compositors; disable it.
    // Set before the WebView initializes; the user can override it.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            probe_video,
            get_frame,
            export_timeline
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
