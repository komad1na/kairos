mod ffmpeg;
mod session_log;

use ffmpeg::{ExportProject, PreviewCacheStats, VideoInfo};
use session_log::SessionLogSnapshot;
use std::fs;
use tauri::{AppHandle, Emitter, Manager};

/// Reads metadata (duration, dimensions, fps, codecs, audio) of the chosen file.
#[tauri::command]
async fn probe_video(path: String) -> Result<VideoInfo, String> {
    log_info(format!("probe_video:start path={path}"));
    let log_path = path.clone();
    let result = tauri::async_runtime::spawn_blocking(move || ffmpeg::probe(&path))
        .await
        .map_err(|e| e.to_string())?;
    match &result {
        Ok(info) => log_info(format!(
            "probe_video:ok path={} duration={:.3}s video={} audio={} vcodec={:?} acodec={:?} size={}x{} fps={:.3}",
            log_path,
            info.duration,
            info.has_video,
            info.has_audio,
            info.video_codec,
            info.audio_codec,
            info.width,
            info.height,
            info.fps,
        )),
        Err(err) => log_error(format!("probe_video:error path={log_path} error={err}")),
    }
    result
}

/// Returns a single representative frame at the given time as raw JPEG bytes.
/// Used for library/timeline thumbnails — never for realtime playback.
#[tauri::command]
async fn generate_thumbnail(
    path: String,
    time: f64,
    max_width: u32,
) -> Result<tauri::ipc::Response, String> {
    log_debug(format!(
        "generate_thumbnail:start path={path} time={time:.3} max_width={max_width}"
    ));
    let log_path = path.clone();
    let bytes =
        tauri::async_runtime::spawn_blocking(move || ffmpeg::extract_frame(&path, time, max_width))
            .await
            .map_err(|e| e.to_string())?;
    match &bytes {
        Ok(bytes) => log_debug(format!(
            "generate_thumbnail:ok path={} bytes={}",
            log_path,
            bytes.len()
        )),
        Err(err) => log_error(format!(
            "generate_thumbnail:error path={log_path} error={err}"
        )),
    }
    let bytes = bytes?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// Returns downsampled audio peaks (0..1) for rendering a clip's waveform.
#[tauri::command]
async fn generate_waveform(path: String, buckets: u32) -> Result<Vec<f32>, String> {
    log_debug(format!(
        "generate_waveform:start path={path} buckets={buckets}"
    ));
    let log_path = path.clone();
    let result = tauri::async_runtime::spawn_blocking(move || ffmpeg::waveform(&path, buckets))
        .await
        .map_err(|e| e.to_string())?;
    match &result {
        Ok(peaks) => log_debug(format!(
            "generate_waveform:ok path={} peaks={}",
            log_path,
            peaks.len()
        )),
        Err(err) => log_error(format!(
            "generate_waveform:error path={log_path} error={err}"
        )),
    }
    result
}

/// Reads a media file into a browser Blob for native preview fallback.
/// This is not transcoding: WebKit still decodes the original bytes.
#[tauri::command]
async fn read_media_file(path: String) -> Result<tauri::ipc::Response, String> {
    log_debug(format!("read_media_file:start path={path}"));
    let log_path = path.clone();
    let bytes = tauri::async_runtime::spawn_blocking(move || {
        fs::read(&path).map_err(|e| format!("failed to read media file: {e}"))
    })
    .await
    .map_err(|e| e.to_string())?;
    match &bytes {
        Ok(bytes) => log_debug(format!(
            "read_media_file:ok path={} bytes={}",
            log_path,
            bytes.len()
        )),
        Err(err) => log_error(format!("read_media_file:error path={log_path} error={err}")),
    }
    let bytes = bytes?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// Creates or reuses an editor-friendly local media file for smooth preview.
#[tauri::command]
async fn ensure_preview_cache(path: String, proxy_height: Option<u32>) -> Result<String, String> {
    log_info(format!(
        "ensure_preview_cache:start path={path} proxy_height={}",
        proxy_height.unwrap_or(ffmpeg::DEFAULT_PREVIEW_PROXY_HEIGHT)
    ));
    let log_path = path.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        ffmpeg::ensure_preview_cache(&path, proxy_height)
    })
    .await
    .map_err(|e| e.to_string())?;
    match &result {
        Ok(preview) => log_info(format!(
            "ensure_preview_cache:ok path={} preview={}",
            log_path, preview
        )),
        Err(err) => log_error(format!(
            "ensure_preview_cache:error path={log_path} error={err}"
        )),
    }
    result
}

/// Lightweight existence check for paths previously returned from /tmp cache.
#[tauri::command]
async fn path_exists(path: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        Ok::<bool, String>(std::path::Path::new(&path).exists())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Returns preview cache directory usage.
#[tauri::command]
async fn preview_cache_stats() -> Result<PreviewCacheStats, String> {
    tauri::async_runtime::spawn_blocking(ffmpeg::preview_cache_stats)
        .await
        .map_err(|e| e.to_string())?
}

/// Clears all editor-generated preview cache files.
#[tauri::command]
async fn clear_preview_cache() -> Result<PreviewCacheStats, String> {
    log_info("clear_preview_cache:start");
    tauri::async_runtime::spawn_blocking(ffmpeg::clear_preview_cache)
        .await
        .map_err(|e| e.to_string())?
}

/// Renders the whole multi-track timeline into a single output file via ffmpeg.
#[tauri::command]
async fn export_timeline(app: AppHandle, project: ExportProject) -> Result<(), String> {
    log_info(format!(
        "export_timeline:start output={} size={}x{} fps={} video_tracks={} audio_tracks={} encoder={:?}",
        project.output,
        project.width,
        project.height,
        project.fps,
        project.video_tracks.len(),
        project.audio_tracks.len(),
        project.encoder,
    ));
    let log_output = project.output.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        ffmpeg::export_with_progress(&project, |progress| {
            let _ = app.emit("export-progress", progress);
        })
    })
    .await
    .map_err(|e| e.to_string())?;
    match &result {
        Ok(_) => log_info(format!("export_timeline:ok output={log_output}")),
        Err(err) => log_error(format!(
            "export_timeline:error output={log_output} error={err}"
        )),
    }
    result
}

/// Writes a project document (JSON) to disk.
#[tauri::command]
async fn save_project(path: String, data: String) -> Result<(), String> {
    log_info(format!("save_project path={path} bytes={}", data.len()));
    tauri::async_runtime::spawn_blocking(move || fs::write(&path, data).map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}

/// Reads a project document (JSON) from disk.
#[tauri::command]
async fn load_project(path: String) -> Result<String, String> {
    log_info(format!("load_project path={path}"));
    tauri::async_runtime::spawn_blocking(move || {
        fs::read_to_string(&path).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Appends a frontend/debug line to the current session log.
#[tauri::command]
async fn append_session_log(level: String, message: String) -> Result<(), String> {
    session_log::append(&level, &message)
}

/// Returns the current session log file metadata and content.
#[tauri::command]
async fn session_log_snapshot() -> Result<SessionLogSnapshot, String> {
    tauri::async_runtime::spawn_blocking(session_log::snapshot)
        .await
        .map_err(|e| e.to_string())?
}

/// Exits the app from the Rust side so closing does not depend on JS window destroy permissions.
#[tauri::command]
async fn request_app_exit(app: AppHandle) -> Result<(), String> {
    log_info("request_app_exit");
    app.exit(0);
    Ok(())
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    std::panic::set_hook(Box::new(|info| {
        let location = info
            .location()
            .map(|loc| format!("{}:{}:{}", loc.file(), loc.line(), loc.column()))
            .unwrap_or_else(|| "unknown location".to_string());
        let payload = info
            .payload()
            .downcast_ref::<&str>()
            .map(|s| (*s).to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "unknown panic payload".to_string());
        let message = format!("panic at {location}: {payload}");
        let _ = session_log::append("panic", &message);
        eprintln!("{message}");
    }));

    // Workaround for WebKitGTK + Wayland (Hyprland/wlroots): crash with
    // "Error 71 (Protocol error) dispatching to Wayland display".
    // The DMABUF renderer breaks on some compositors; disable it.
    // Set before the WebView initializes; the user can override it.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    tauri::Builder::default()
        .setup(|_| {
            if let Err(err) = session_log::init() {
                eprintln!("failed to initialize session log: {err}");
            }
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            probe_video,
            generate_thumbnail,
            generate_waveform,
            read_media_file,
            ensure_preview_cache,
            path_exists,
            preview_cache_stats,
            clear_preview_cache,
            export_timeline,
            save_project,
            load_project,
            append_session_log,
            session_log_snapshot,
            request_app_exit
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn log_debug(message: impl AsRef<str>) {
    let _ = session_log::append("debug", message.as_ref());
}

fn log_info(message: impl AsRef<str>) {
    let _ = session_log::append("info", message.as_ref());
}

fn log_error(message: impl AsRef<str>) {
    let _ = session_log::append("error", message.as_ref());
}
