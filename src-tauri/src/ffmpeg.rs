//! Thin wrapper around the `ffmpeg`/`ffprobe` CLI tools.
//!
//! We deliberately use the system CLI binaries instead of the `ffmpeg-next`
//! bindings: far simpler to build, with no native linking. Every function spawns
//! a separate process and returns `Result<_, String>` so errors flow easily to
//! the frontend.

use serde::{Deserialize, Serialize};
use std::process::Command;

/// Video file metadata, obtained from `ffprobe`.
#[derive(Debug, Clone, Serialize)]
pub struct VideoInfo {
    pub duration: f64,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub codec: String,
    pub has_audio: bool,
}

/// A single clip on the timeline that goes into an export.
#[derive(Debug, Clone, Deserialize)]
pub struct ExportClip {
    /// Path to the source file.
    pub path: String,
    /// Start (in-point) in seconds within the source.
    pub start: f64,
    /// End (out-point) in seconds within the source.
    pub end: f64,
}

/// Hides the console window on Windows; does nothing on other platforms.
fn command(program: &str) -> Command {
    let cmd = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let mut cmd = cmd;
        cmd.creation_flags(CREATE_NO_WINDOW);
        return cmd;
    }
    #[allow(unreachable_code)]
    cmd
}

/// Turns "30000/1001" or "30/1" into a floating point number.
fn parse_rational(s: &str) -> f64 {
    let mut parts = s.split('/');
    let num: f64 = parts.next().and_then(|n| n.parse().ok()).unwrap_or(0.0);
    let den: f64 = parts.next().and_then(|d| d.parse().ok()).unwrap_or(1.0);
    if den == 0.0 {
        0.0
    } else {
        num / den
    }
}

/// Reads video file metadata via `ffprobe -print_format json`.
pub fn probe(path: &str) -> Result<VideoInfo, String> {
    let output = command("ffprobe")
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            path,
        ])
        .output()
        .map_err(|e| format!("Failed to run ffprobe: {e}. Is ffmpeg installed?"))?;

    if !output.status.success() {
        return Err(format!(
            "ffprobe failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let json: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse ffprobe output: {e}"))?;

    let streams = json["streams"]
        .as_array()
        .ok_or("ffprobe: missing 'streams' field")?;

    let video = streams
        .iter()
        .find(|s| s["codec_type"] == "video")
        .ok_or("File has no video stream")?;

    let has_audio = streams.iter().any(|s| s["codec_type"] == "audio");

    let width = video["width"].as_u64().unwrap_or(0) as u32;
    let height = video["height"].as_u64().unwrap_or(0) as u32;
    let codec = video["codec_name"]
        .as_str()
        .unwrap_or("unknown")
        .to_string();

    let fps = video["avg_frame_rate"]
        .as_str()
        .map(parse_rational)
        .filter(|&f| f > 0.0)
        .or_else(|| video["r_frame_rate"].as_str().map(parse_rational))
        .unwrap_or(0.0);

    // Duration: prefer the format section, fall back to the video stream.
    let duration = json["format"]["duration"]
        .as_str()
        .and_then(|d| d.parse::<f64>().ok())
        .or_else(|| video["duration"].as_str().and_then(|d| d.parse().ok()))
        .unwrap_or(0.0);

    Ok(VideoInfo {
        duration,
        width,
        height,
        fps,
        codec,
        has_audio,
    })
}

/// Extracts a single frame at the given time and returns it as JPEG bytes.
///
/// `-ss` before `-i` does a fast (keyframe) seek, which is plenty for
/// preview/scrubbing. The frame is scaled so its width does not exceed
/// `max_width` (no upscaling) for speed and lower memory use.
pub fn extract_frame(path: &str, time: f64, max_width: u32) -> Result<Vec<u8>, String> {
    let time = time.max(0.0);
    // min(iw, max_width): never upscale; -2 keeps aspect and even dimensions.
    let scale = format!("scale=min(iw\\,{max_width}):-2");

    let output = command("ffmpeg")
        .args([
            "-nostdin",
            "-loglevel",
            "error",
            "-ss",
            &format!("{time}"),
            "-i",
            path,
            "-frames:v",
            "1",
            "-vf",
            &scale,
            "-q:v",
            "4",
            "-f",
            "image2pipe",
            "-vcodec",
            "mjpeg",
            "pipe:1",
        ])
        .output()
        .map_err(|e| format!("Failed to run ffmpeg: {e}. Is ffmpeg installed?"))?;

    if !output.status.success() {
        return Err(format!(
            "ffmpeg (frame) failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    if output.stdout.is_empty() {
        return Err("ffmpeg returned no frame (time out of range?)".into());
    }

    Ok(output.stdout)
}

/// Renders a list of clips into a single output file.
///
/// Uses one `filter_complex` that trims + resets PTS for each clip, then joins
/// them with the `concat` filter. Audio is included only if ALL sources have
/// audio (otherwise concat would fail due to mismatched streams).
pub fn export(clips: &[ExportClip], output_path: &str) -> Result<(), String> {
    if clips.is_empty() {
        return Err("No clips to export.".into());
    }

    // Include audio only if every source has it.
    let include_audio = clips
        .iter()
        .all(|c| probe(&c.path).map(|i| i.has_audio).unwrap_or(false));

    let mut args: Vec<String> = vec!["-y".into(), "-loglevel".into(), "error".into()];
    for clip in clips {
        args.push("-i".into());
        args.push(clip.path.clone());
    }

    // Build the filtergraph.
    let mut filter = String::new();
    let mut concat_inputs = String::new();
    for (i, clip) in clips.iter().enumerate() {
        filter.push_str(&format!(
            "[{i}:v]trim=start={s}:end={e},setpts=PTS-STARTPTS[v{i}];",
            s = clip.start,
            e = clip.end
        ));
        concat_inputs.push_str(&format!("[v{i}]"));
        if include_audio {
            filter.push_str(&format!(
                "[{i}:a]atrim=start={s}:end={e},asetpts=PTS-STARTPTS[a{i}];",
                s = clip.start,
                e = clip.end
            ));
            concat_inputs.push_str(&format!("[a{i}]"));
        }
    }
    let n = clips.len();
    if include_audio {
        filter.push_str(&format!("{concat_inputs}concat=n={n}:v=1:a=1[outv][outa]"));
    } else {
        filter.push_str(&format!("{concat_inputs}concat=n={n}:v=1:a=0[outv]"));
    }

    args.push("-filter_complex".into());
    args.push(filter);
    args.push("-map".into());
    args.push("[outv]".into());
    if include_audio {
        args.push("-map".into());
        args.push("[outa]".into());
        args.push("-c:a".into());
        args.push("aac".into());
    }
    args.extend([
        "-c:v".into(),
        "libx264".into(),
        "-preset".into(),
        "fast".into(),
        "-crf".into(),
        "20".into(),
        "-pix_fmt".into(),
        "yuv420p".into(),
        output_path.into(),
    ]);

    let output = command("ffmpeg")
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to run ffmpeg: {e}"))?;

    if !output.status.success() {
        return Err(format!(
            "Export failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(())
}
