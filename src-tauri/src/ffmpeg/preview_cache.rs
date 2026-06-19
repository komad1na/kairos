use super::{command, probe, PreviewCacheStats, VideoInfo};
use std::{
    collections::hash_map::DefaultHasher,
    fs,
    hash::{Hash, Hasher},
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

pub const DEFAULT_PREVIEW_PROXY_HEIGHT: u32 = 720;
const MIN_PREVIEW_PROXY_HEIGHT: u32 = 144;
const MAX_PREVIEW_PROXY_HEIGHT: u32 = 2160;

/// Creates an editor-friendly local preview file and returns its path.
///
/// The original source remains the source of truth for export. This cache is
/// only used by the realtime webview preview so playback and seeking stay
/// smooth on WebKitGTK.
pub fn ensure_preview_cache(path: &str, proxy_height: Option<u32>) -> Result<String, String> {
    let info = probe(path)?;
    let proxy_height = sanitize_preview_proxy_height(proxy_height);
    let out_dir = preview_cache_dir();
    fs::create_dir_all(&out_dir).map_err(|e| format!("Failed to create preview cache: {e}"))?;

    let ext = if info.has_video { "mp4" } else { "m4a" };
    let out = out_dir.join(format!(
        "{}-{}p.{}",
        preview_cache_key(path)?,
        proxy_height,
        ext
    ));
    if is_nonempty_file(&out) {
        return Ok(out.to_string_lossy().to_string());
    }

    let tmp = out.with_extension(format!("{ext}.tmp"));
    let attempts = build_preview_cache_attempts(path, &tmp, &info, proxy_height)?;
    let mut errors: Vec<String> = Vec::new();
    for attempt in attempts {
        let _ = fs::remove_file(&tmp);
        let output = command("ffmpeg")
            .args(&attempt.args)
            .output()
            .map_err(|e| format!("Failed to run ffmpeg: {e}. Is ffmpeg installed?"))?;

        if output.status.success() {
            fs::rename(&tmp, &out).map_err(|e| format!("Failed to save preview cache: {e}"))?;
            return Ok(out.to_string_lossy().to_string());
        }

        errors.push(format!(
            "{} failed: {}",
            attempt.label,
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let _ = fs::remove_file(&tmp);
    Err(format!("Preview cache failed: {}", errors.join("\n")))
}

pub fn preview_cache_stats() -> Result<PreviewCacheStats, String> {
    let path = preview_cache_dir();
    let (size_bytes, file_count) = dir_usage(&path)?;
    Ok(PreviewCacheStats {
        path: path.to_string_lossy().to_string(),
        size_bytes,
        file_count,
    })
}

pub fn clear_preview_cache() -> Result<PreviewCacheStats, String> {
    let path = preview_cache_dir();
    if path.exists() {
        fs::remove_dir_all(&path).map_err(|e| format!("Failed to clear preview cache: {e}"))?;
    }
    fs::create_dir_all(&path).map_err(|e| format!("Failed to recreate preview cache: {e}"))?;
    preview_cache_stats()
}

#[cfg(test)]
pub(super) fn build_preview_cache_args(
    input: &str,
    output: &Path,
    info: &VideoInfo,
    proxy_height: u32,
) -> Result<Vec<String>, String> {
    build_preview_cache_args_for(
        input,
        output,
        info,
        proxy_height,
        PreviewCacheEncoder::Nvenc,
    )
}

pub(super) fn build_preview_cache_attempts(
    input: &str,
    output: &Path,
    info: &VideoInfo,
    proxy_height: u32,
) -> Result<Vec<PreviewCacheAttempt>, String> {
    if !info.has_video {
        return Ok(vec![PreviewCacheAttempt {
            label: "audio proxy",
            args: build_preview_cache_args_for(
                input,
                output,
                info,
                proxy_height,
                PreviewCacheEncoder::X264,
            )?,
        }]);
    }

    Ok(vec![
        PreviewCacheAttempt {
            label: "NVIDIA NVENC proxy",
            args: build_preview_cache_args_for(
                input,
                output,
                info,
                proxy_height,
                PreviewCacheEncoder::Nvenc,
            )?,
        },
        PreviewCacheAttempt {
            label: "CPU x264 proxy fallback",
            args: build_preview_cache_args_for(
                input,
                output,
                info,
                proxy_height,
                PreviewCacheEncoder::X264,
            )?,
        },
    ])
}

pub(super) struct PreviewCacheAttempt {
    pub(super) label: &'static str,
    pub(super) args: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PreviewCacheEncoder {
    Nvenc,
    X264,
}

fn build_preview_cache_args_for(
    input: &str,
    output: &Path,
    info: &VideoInfo,
    proxy_height: u32,
    encoder: PreviewCacheEncoder,
) -> Result<Vec<String>, String> {
    if !info.has_video && !info.has_audio {
        return Err("File has no previewable media streams.".into());
    }

    let mut args: Vec<String> = vec![
        "-y".into(),
        "-nostdin".into(),
        "-loglevel".into(),
        "error".into(),
        "-i".into(),
        input.into(),
    ];

    if info.has_video {
        let (max_width, max_height) = preview_proxy_bounds(info, proxy_height);
        args.extend([
            "-map".into(),
            "0:v:0".into(),
            "-map".into(),
            "0:a:0?".into(),
            "-vf".into(),
            format!(
                "scale=w='min(iw,{max_width})':h='min(ih,{max_height})':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1"
            ),
            "-r".into(),
            "30".into(),
            "-c:v".into(),
        ]);
        push_preview_video_encoder_args(&mut args, encoder, max_width, max_height);
        if info.has_audio {
            args.extend(preview_audio_args());
        } else {
            args.push("-an".into());
        }
        args.extend(["-movflags".into(), "+faststart".into()]);
    } else {
        args.extend(["-map".into(), "0:a:0".into(), "-vn".into()]);
        args.extend(preview_audio_args());
        args.extend(["-movflags".into(), "+faststart".into()]);
    }

    args.extend(["-f".into(), "mp4".into()]);
    args.push(output.to_string_lossy().to_string());
    Ok(args)
}

fn push_preview_video_encoder_args(
    args: &mut Vec<String>,
    encoder: PreviewCacheEncoder,
    max_width: u32,
    max_height: u32,
) {
    match encoder {
        PreviewCacheEncoder::Nvenc => {
            let kbps = preview_proxy_bitrate_kbps(max_width, max_height);
            args.extend([
                "h264_nvenc".into(),
                "-preset".into(),
                "p2".into(),
                "-rc".into(),
                "vbr".into(),
                "-cq".into(),
                "26".into(),
                "-b:v".into(),
                format!("{kbps}k"),
                "-maxrate".into(),
                format!("{kbps}k"),
                "-bufsize".into(),
                format!("{}k", kbps.saturating_mul(2)),
                "-profile:v".into(),
                "main".into(),
                "-pix_fmt".into(),
                "yuv420p".into(),
                "-g".into(),
                "30".into(),
                "-bf".into(),
                "0".into(),
            ]);
        }
        PreviewCacheEncoder::X264 => {
            args.extend([
                "libx264".into(),
                "-preset".into(),
                "veryfast".into(),
                "-crf".into(),
                "26".into(),
                "-profile:v".into(),
                "baseline".into(),
                "-level".into(),
                "3.1".into(),
                "-pix_fmt".into(),
                "yuv420p".into(),
                "-g".into(),
                "30".into(),
                "-keyint_min".into(),
                "30".into(),
                "-sc_threshold".into(),
                "0".into(),
                "-bf".into(),
                "0".into(),
            ]);
        }
    }
}

fn preview_proxy_bitrate_kbps(max_width: u32, max_height: u32) -> u32 {
    let pixels = u64::from(max_width) * u64::from(max_height);
    match pixels {
        0..=250_000 => 1_200,
        250_001..=600_000 => 2_000,
        600_001..=1_200_000 => 3_500,
        1_200_001..=2_400_000 => 6_500,
        _ => 10_000,
    }
}

fn sanitize_preview_proxy_height(value: Option<u32>) -> u32 {
    value
        .unwrap_or(DEFAULT_PREVIEW_PROXY_HEIGHT)
        .clamp(MIN_PREVIEW_PROXY_HEIGHT, MAX_PREVIEW_PROXY_HEIGHT)
}

fn preview_proxy_bounds(info: &VideoInfo, proxy_height: u32) -> (u32, u32) {
    let proxy_height = sanitize_preview_proxy_height(Some(proxy_height));
    let wide_side = even_u32(((proxy_height as f64) * 16.0 / 9.0).round() as u32);
    let short_side = even_u32(proxy_height);

    match info.width.cmp(&info.height) {
        std::cmp::Ordering::Less => (short_side, wide_side),
        std::cmp::Ordering::Equal => (short_side, short_side),
        std::cmp::Ordering::Greater => (wide_side, short_side),
    }
}

fn even_u32(value: u32) -> u32 {
    value.max(2) & !1
}

fn preview_audio_args() -> [String; 8] {
    [
        "-c:a".into(),
        "aac".into(),
        "-b:a".into(),
        "128k".into(),
        "-ac".into(),
        "2".into(),
        "-ar".into(),
        "48000".into(),
    ]
}

fn preview_cache_key(path: &str) -> Result<String, String> {
    let metadata = fs::metadata(path).map_err(|e| format!("Failed to stat media file: {e}"))?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_nanos())
        .unwrap_or(0);

    let mut hasher = DefaultHasher::new();
    path.hash(&mut hasher);
    metadata.len().hash(&mut hasher);
    modified.hash(&mut hasher);
    Ok(format!("{:016x}", hasher.finish()))
}

fn preview_cache_dir() -> PathBuf {
    std::env::temp_dir().join("kairos-preview-cache")
}

fn dir_usage(path: &Path) -> Result<(u64, u64), String> {
    if !path.exists() {
        return Ok((0, 0));
    }

    let mut size = 0u64;
    let mut files = 0u64;
    for entry in fs::read_dir(path).map_err(|e| format!("Failed to read cache directory: {e}"))? {
        let entry = entry.map_err(|e| format!("Failed to read cache entry: {e}"))?;
        let meta = entry
            .metadata()
            .map_err(|e| format!("Failed to read cache entry metadata: {e}"))?;
        if meta.is_dir() {
            let (child_size, child_files) = dir_usage(&entry.path())?;
            size += child_size;
            files += child_files;
        } else if meta.is_file() {
            size += meta.len();
            files += 1;
        }
    }
    Ok((size, files))
}

fn is_nonempty_file(path: &PathBuf) -> bool {
    fs::metadata(path)
        .map(|m| m.is_file() && m.len() > 0)
        .unwrap_or(false)
}
