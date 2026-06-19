//! Thin wrapper around the `ffmpeg`/`ffprobe` CLI tools.
//!
//! We deliberately use the system CLI binaries instead of the `ffmpeg-next`
//! bindings: far simpler to build, with no native linking. ffmpeg is used ONLY
//! for metadata, thumbnails, waveforms, and the final export — never in the
//! realtime preview loop (that lives in the webview). The export filtergraph is
//! built by a pure function (`build_export_args`) so it can be unit-tested.

use std::{
    f64::consts::PI,
    io::{BufRead, BufReader, Read},
    process::{Command, Stdio},
};

mod preview_cache;
mod types;

pub use preview_cache::{
    clear_preview_cache, ensure_preview_cache, preview_cache_stats, DEFAULT_PREVIEW_PROXY_HEIGHT,
};
pub use types::*;

struct PreparedVideoClip {
    label: String,
    start: f64,
    end: f64,
    transform: ClipTransform,
    transitions: ClipTransitions,
}

/// Hides the console window on Windows; does nothing on other platforms.
fn command(program: &str) -> Command {
    let cmd = Command::new(resolve_program(program));
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

/// On Windows, prefer an `ffmpeg.exe`/`ffprobe.exe` shipped next to our own
/// executable (bundled via Tauri resources, or placed beside a portable build);
/// otherwise fall back to the one on `PATH`. Other platforms always use `PATH`.
fn resolve_program(program: &str) -> std::ffi::OsString {
    #[cfg(windows)]
    {
        if let Some(dir) = std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(|d| d.to_path_buf()))
        {
            let candidate = dir.join(format!("{program}.exe"));
            if candidate.is_file() {
                return candidate.into_os_string();
            }
        }
    }
    std::ffi::OsString::from(program)
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

/// Reads media metadata via `ffprobe -print_format json`. Handles audio-only files.
pub fn probe(path: &str) -> Result<VideoInfo, String> {
    let output = command("ffprobe")
        .args([
            "-v",
            "error",
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

    let video = streams.iter().find(|s| s["codec_type"] == "video");
    let audio = streams.iter().find(|s| s["codec_type"] == "audio");

    if video.is_none() && audio.is_none() {
        return Err("File has no video or audio stream".into());
    }

    let (width, height, fps, video_codec) = match video {
        Some(v) => {
            let width = v["width"].as_u64().unwrap_or(0) as u32;
            let height = v["height"].as_u64().unwrap_or(0) as u32;
            let codec = v["codec_name"].as_str().map(|s| s.to_string());
            let fps = v["avg_frame_rate"]
                .as_str()
                .map(parse_rational)
                .filter(|&f| f > 0.0)
                .or_else(|| v["r_frame_rate"].as_str().map(parse_rational))
                .unwrap_or(0.0);
            (width, height, fps, codec)
        }
        None => (0, 0, 0.0, None),
    };

    let audio_codec = audio.and_then(|a| a["codec_name"].as_str().map(|s| s.to_string()));

    // Duration: prefer the format section, fall back to the first stream.
    let duration = json["format"]["duration"]
        .as_str()
        .and_then(|d| d.parse::<f64>().ok())
        .or_else(|| {
            streams
                .iter()
                .find_map(|s| s["duration"].as_str().and_then(|d| d.parse::<f64>().ok()))
        })
        .unwrap_or(0.0);

    Ok(VideoInfo {
        duration,
        width,
        height,
        fps,
        video_codec,
        audio_codec,
        has_video: video.is_some(),
        has_audio: audio.is_some(),
    })
}

/// Extracts a single frame at the given time and returns it as JPEG bytes.
/// Used for library + timeline thumbnails (NOT for realtime playback).
pub fn extract_frame(path: &str, time: f64, max_width: u32) -> Result<Vec<u8>, String> {
    let time = time.max(0.0);
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

/// Decodes audio to mono PCM and returns `buckets` peak values (0.0–1.0) for a
/// resolution-independent waveform. Returns an error if the source has no audio.
pub fn waveform(path: &str, buckets: u32) -> Result<Vec<f32>, String> {
    let output = command("ffmpeg")
        .args([
            "-nostdin",
            "-loglevel",
            "error",
            "-i",
            path,
            "-vn",
            "-ac",
            "1",
            "-ar",
            "8000",
            "-f",
            "s16le",
            "pipe:1",
        ])
        .output()
        .map_err(|e| format!("Failed to run ffmpeg: {e}. Is ffmpeg installed?"))?;

    if !output.status.success() {
        return Err(format!(
            "ffmpeg (waveform) failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let bytes = &output.stdout;
    let n = bytes.len() / 2;
    if n == 0 {
        return Err("No audio in file.".into());
    }
    let buckets = buckets.max(1) as usize;
    let bucket_size = ((n as f64) / (buckets as f64)).ceil() as usize;
    let bucket_size = bucket_size.max(1);

    let mut peaks: Vec<f32> = Vec::with_capacity(buckets);
    let mut i = 0;
    while i < n {
        let end = (i + bucket_size).min(n);
        let mut peak = 0f32;
        for j in i..end {
            let sample = i16::from_le_bytes([bytes[2 * j], bytes[2 * j + 1]]);
            let v = (sample as f32).abs() / 32768.0;
            if v > peak {
                peak = v;
            }
        }
        peaks.push(peak);
        i = end;
    }
    Ok(peaks)
}

/// Builds the ffmpeg argument vector (excluding the program name) that renders
/// the timeline. Pure — no process spawned — so it is unit-tested below.
///
/// Video: a black canvas the size of the project, with each clip trimmed,
/// PTS-shifted to its timeline position, scaled+letterboxed, and `overlay`ed
/// bottom→top so upper tracks can cover or blend with lower tracks. Audio: each clip trimmed,
/// volume-scaled, delayed to its position, then `amix`ed.
pub fn build_export_args(project: &ExportProject) -> Result<Vec<String>, String> {
    let w = project.width.max(2);
    let h = project.height.max(2);
    let fps = if project.fps > 0.0 { project.fps } else { 30.0 };

    let mut total = 0f64;
    for t in &project.video_tracks {
        for c in &t.clips {
            total = total.max(c.start + (c.out_ - c.in_).max(0.0));
        }
    }
    for t in &project.audio_tracks {
        for c in &t.clips {
            total = total.max(c.start + (c.out_ - c.in_).max(0.0));
        }
    }
    if total <= 0.0 {
        return Err("Nothing to export.".into());
    }

    let has_video = project.video_tracks.iter().any(|t| !t.clips.is_empty());
    let has_audio = project.audio_tracks.iter().any(|t| !t.clips.is_empty());

    let mut inputs: Vec<String> = Vec::new();
    let mut filter = String::new();

    // ---- Video clip chains ----
    let mut video_clips: Vec<PreparedVideoClip> = Vec::new();
    if has_video {
        for vt in &project.video_tracks {
            for c in &vt.clips {
                let idx = inputs.len();
                inputs.push(c.path.clone());
                let end = c.start + (c.out_ - c.in_);
                let label = format!("vc{idx}");
                let transform = sanitized_clip_transform(c.transform);
                let effects = sanitized_clip_effects(c.effects);
                let transitions = sanitized_clip_transitions(c.transitions);
                let scale = ffmpeg_number(transform.scale);
                filter.push_str(&format!(
                    "[{idx}:v]trim=start={}:end={},setpts=PTS-STARTPTS+{}/TB,\
                     scale={w}:{h}:force_original_aspect_ratio=decrease,\
                     scale=w='max(2,trunc(iw*{scale}/2)*2)':h='max(2,trunc(ih*{scale}/2)*2)',\
                     format=rgba",
                    c.in_, c.out_, c.start
                ));
                if transform.rotation.abs() > 0.001 {
                    filter.push_str(&format!(
                        ",rotate={}:c=black@0:ow=rotw(iw):oh=roth(ih)",
                        ffmpeg_number(degrees_to_radians(transform.rotation))
                    ));
                }
                append_video_effect_filters(&mut filter, effects);
                append_video_transition_filters(&mut filter, transitions, c.start, end);
                filter.push_str(&format!("[{label}];"));
                video_clips.push(PreparedVideoClip {
                    label,
                    start: c.start,
                    end,
                    transform,
                    transitions,
                });
            }
        }
    }

    // ---- Audio clip chains ----
    let mut audio_clips: Vec<String> = Vec::new();
    if has_audio {
        for at in &project.audio_tracks {
            for c in &at.clips {
                let idx = inputs.len();
                inputs.push(c.path.clone());
                let eff = if at.muted || c.muted {
                    0.0
                } else {
                    (c.volume * at.volume).clamp(0.0, 2.0)
                };
                let ms = (c.start * 1000.0).round() as i64;
                let label = format!("ac{idx}");
                let transitions = sanitized_clip_transitions(c.transitions);
                let duration = (c.out_ - c.in_).max(0.0);
                filter.push_str(&format!(
                    "[{idx}:a]atrim=start={}:end={},asetpts=PTS-STARTPTS",
                    c.in_, c.out_
                ));
                append_audio_transition_filters(&mut filter, transitions, duration);
                filter.push_str(&format!(",volume={eff},adelay={ms}:all=1[{label}];"));
                audio_clips.push(label);
            }
        }
    }

    // ---- Video overlay chain (bottom→top) ----
    let mut out_v: Option<String> = None;
    if has_video {
        filter.push_str(&format!(
            "color=c=black:s={w}x{h}:r={fps}:d={total}[vbase];"
        ));
        let mut prev = "vbase".to_string();
        for (i, clip) in video_clips.iter().enumerate() {
            let next = format!("vo{i}");
            let (x_expr, y_expr) = overlay_position_expr(clip);
            filter.push_str(&format!(
                "[{prev}][{}]overlay=x='{}':y='{}':enable='between(t,{},{})':eof_action=pass[{next}];",
                clip.label,
                x_expr,
                y_expr,
                ffmpeg_number(clip.start),
                ffmpeg_number(clip.end),
            ));
            prev = next;
        }
        out_v = Some(prev);
    }

    // ---- Audio mix ----
    let mut out_a: Option<String> = None;
    if has_audio {
        let k = audio_clips.len();
        if k == 1 {
            out_a = Some(audio_clips[0].clone());
        } else {
            for l in &audio_clips {
                filter.push_str(&format!("[{l}]"));
            }
            filter.push_str(&format!("amix=inputs={k}:normalize=0[outa];"));
            out_a = Some("outa".to_string());
        }
    }

    if filter.ends_with(';') {
        filter.pop();
    }

    // ---- Assemble args ----
    let mut args: Vec<String> = vec!["-y".into(), "-loglevel".into(), "error".into()];
    for p in &inputs {
        args.push("-i".into());
        args.push(p.clone());
    }
    args.push("-filter_complex".into());
    args.push(filter);
    if let Some(v) = &out_v {
        args.push("-map".into());
        args.push(format!("[{v}]"));
    }
    if let Some(a) = &out_a {
        args.push("-map".into());
        args.push(format!("[{a}]"));
    }
    if out_v.is_some() {
        args.push("-c:v".into());
        args.push(video_encoder_name(project.encoder).into());
        push_video_encoder_options(&mut args, project);
        args.push("-pix_fmt".into());
        args.push("yuv420p".into());
    }
    if out_a.is_some() {
        args.push("-c:a".into());
        args.push("aac".into());
        args.push("-b:a".into());
        args.push(format!("{}k", project.audio_bitrate_kbps.clamp(64, 512)));
    }
    args.extend(["-movflags".into(), "+faststart".into()]);
    args.extend(["-t".into(), format!("{total}")]);
    args.push(project.output.clone());
    Ok(args)
}

fn sanitized_x264_preset(preset: &str) -> &str {
    match preset {
        "ultrafast" | "superfast" | "veryfast" | "faster" | "fast" | "medium" | "slow"
        | "slower" | "veryslow" => preset,
        _ => "fast",
    }
}

fn video_encoder_name(encoder: ExportEncoder) -> &'static str {
    match encoder {
        ExportEncoder::X264 => "libx264",
        ExportEncoder::H264Nvenc => "h264_nvenc",
    }
}

fn push_video_encoder_options(args: &mut Vec<String>, project: &ExportProject) {
    match project.encoder {
        ExportEncoder::X264 => {
            args.push("-preset".into());
            args.push(sanitized_x264_preset(&project.preset).into());
            match project.rate_control {
                ExportRateControl::Bitrate => {
                    push_video_bitrate_args(args, export_video_bitrate_kbps(project))
                }
                ExportRateControl::Crf => {
                    args.push("-crf".into());
                    args.push(project.crf.clamp(0, 51).to_string());
                }
            }
        }
        ExportEncoder::H264Nvenc => {
            args.push("-preset".into());
            args.push(nvenc_preset_for_x264_preset(&project.preset).into());
            match project.rate_control {
                ExportRateControl::Bitrate => {
                    push_video_bitrate_args(args, export_video_bitrate_kbps(project))
                }
                ExportRateControl::Crf => {
                    args.push("-rc".into());
                    args.push("vbr".into());
                    args.push("-cq".into());
                    args.push(project.crf.clamp(0, 51).to_string());
                    let kbps = export_video_bitrate_kbps(project);
                    args.push("-b:v".into());
                    args.push(format!("{kbps}k"));
                    args.push("-maxrate".into());
                    args.push(format!("{kbps}k"));
                    args.push("-bufsize".into());
                    args.push(format!("{}k", kbps.saturating_mul(2)));
                }
            }
        }
    }
}

fn push_video_bitrate_args(args: &mut Vec<String>, kbps: u32) {
    args.push("-b:v".into());
    args.push(format!("{kbps}k"));
    args.push("-maxrate".into());
    args.push(format!("{kbps}k"));
    args.push("-bufsize".into());
    args.push(format!("{}k", kbps.saturating_mul(2)));
}

fn nvenc_preset_for_x264_preset(preset: &str) -> &'static str {
    match preset {
        "ultrafast" | "superfast" => "p1",
        "veryfast" => "p2",
        "faster" => "p3",
        "medium" => "p5",
        "slow" | "slower" | "veryslow" => "p6",
        _ => "p4",
    }
}

fn export_video_bitrate_kbps(project: &ExportProject) -> u32 {
    project
        .video_bitrate_kbps
        .unwrap_or(8000)
        .clamp(250, 200000)
}

fn sanitized_clip_transform(transform: ClipTransform) -> ClipTransform {
    ClipTransform {
        x: finite_or(transform.x, 0.0),
        y: finite_or(transform.y, 0.0),
        scale: finite_or(transform.scale, 1.0).clamp(0.05, 20.0),
        rotation: finite_or(transform.rotation, 0.0).clamp(-360.0, 360.0),
    }
}

fn sanitized_clip_effects(effects: ClipEffects) -> ClipEffects {
    ClipEffects {
        opacity: finite_or(effects.opacity, 1.0).clamp(0.0, 1.0),
        blur: finite_or(effects.blur, 0.0).clamp(0.0, 40.0),
        brightness: finite_or(effects.brightness, 1.0).clamp(0.0, 2.0),
        contrast: finite_or(effects.contrast, 1.0).clamp(0.0, 2.0),
        saturation: finite_or(effects.saturation, 1.0).clamp(0.0, 2.0),
        hue: finite_or(effects.hue, 0.0).clamp(-180.0, 180.0),
        grayscale: finite_or(effects.grayscale, 0.0).clamp(0.0, 1.0),
        sepia: finite_or(effects.sepia, 0.0).clamp(0.0, 1.0),
        invert: finite_or(effects.invert, 0.0).clamp(0.0, 1.0),
    }
}

fn sanitized_clip_transitions(transitions: ClipTransitions) -> ClipTransitions {
    ClipTransitions {
        fade_in: finite_or(transitions.fade_in, 0.0).clamp(0.0, 30.0),
        fade_out: finite_or(transitions.fade_out, 0.0).clamp(0.0, 30.0),
        in_style: transitions.in_style,
        out_style: transitions.out_style,
    }
}

fn append_video_effect_filters(filter: &mut String, effects: ClipEffects) {
    if (effects.hue).abs() > 0.001 {
        filter.push_str(&format!(",hue=h={}", ffmpeg_number(effects.hue)));
    }
    // CSS `brightness()` (used by the realtime preview) is a per-channel multiply,
    // but ffmpeg's `eq` brightness is additive. Match the preview by doing the
    // multiply with colorchannelmixer; keep contrast/saturation in `eq`, which
    // already mirror their CSS counterparts.
    if (effects.brightness - 1.0).abs() > 0.001 {
        let b = ffmpeg_number(effects.brightness);
        filter.push_str(&format!(",colorchannelmixer=rr={b}:gg={b}:bb={b}"));
    }
    if (effects.contrast - 1.0).abs() > 0.001 || (effects.saturation - 1.0).abs() > 0.001 {
        filter.push_str(&format!(
            ",eq=contrast={}:saturation={}",
            ffmpeg_number(effects.contrast),
            ffmpeg_number(effects.saturation)
        ));
    }
    if effects.blur > 0.001 {
        filter.push_str(&format!(",gblur=sigma={}", ffmpeg_number(effects.blur)));
    }
    append_grayscale_filter(filter, effects.grayscale);
    append_sepia_filter(filter, effects.sepia);
    append_invert_filter(filter, effects.invert);
    if effects.opacity < 0.999 {
        filter.push_str(&format!(
            ",colorchannelmixer=aa={}",
            ffmpeg_number(effects.opacity)
        ));
    }
}

fn append_video_transition_filters(
    filter: &mut String,
    transitions: ClipTransitions,
    start: f64,
    end: f64,
) {
    let duration = (end - start).max(0.0);
    let fade_in = transitions.fade_in.min(duration);
    let fade_out = transitions.fade_out.min(duration);
    if fade_in > 0.001 {
        append_video_edge_transition(filter, transitions.in_style, "in", start, fade_in);
    }
    if fade_out > 0.001 {
        append_video_edge_transition(
            filter,
            transitions.out_style,
            "out",
            (end - fade_out).max(start),
            fade_out,
        );
    }
}

fn append_video_edge_transition(
    filter: &mut String,
    style: ClipTransitionStyle,
    direction: &str,
    start: f64,
    duration: f64,
) {
    match style {
        ClipTransitionStyle::DipBlack => filter.push_str(&format!(
            ",fade=t={direction}:st={}:d={}:color=black",
            ffmpeg_number(start),
            ffmpeg_number(duration)
        )),
        ClipTransitionStyle::DipWhite => filter.push_str(&format!(
            ",fade=t={direction}:st={}:d={}:color=white",
            ffmpeg_number(start),
            ffmpeg_number(duration)
        )),
        ClipTransitionStyle::SlideLeft
        | ClipTransitionStyle::SlideRight
        | ClipTransitionStyle::SlideUp
        | ClipTransitionStyle::SlideDown => {}
        ClipTransitionStyle::Fade => filter.push_str(&format!(
            ",fade=t={direction}:st={}:d={}:alpha=1",
            ffmpeg_number(start),
            ffmpeg_number(duration)
        )),
    }
}

fn overlay_position_expr(clip: &PreparedVideoClip) -> (String, String) {
    let mut x = format!("(W-w)/2+{}", ffmpeg_number(clip.transform.x));
    let mut y = format!("(H-h)/2+{}", ffmpeg_number(clip.transform.y));
    let duration = (clip.end - clip.start).max(0.0);
    let fade_in = clip.transitions.fade_in.min(duration);
    let fade_out = clip.transitions.fade_out.min(duration);

    if fade_in > 0.001 {
        apply_slide_position_expr(
            &mut x,
            &mut y,
            clip.transitions.in_style,
            TransitionEdge::In,
            clip.start,
            fade_in,
        );
    }
    if fade_out > 0.001 {
        apply_slide_position_expr(
            &mut x,
            &mut y,
            clip.transitions.out_style,
            TransitionEdge::Out,
            (clip.end - fade_out).max(clip.start),
            fade_out,
        );
    }

    (x, y)
}

#[derive(Debug, Clone, Copy)]
enum TransitionEdge {
    In,
    Out,
}

fn apply_slide_position_expr(
    x: &mut String,
    y: &mut String,
    style: ClipTransitionStyle,
    edge: TransitionEdge,
    start: f64,
    duration: f64,
) {
    let end = start + duration;
    let progress = match edge {
        TransitionEdge::In => format!("((t-{})/{})", ffmpeg_number(start), ffmpeg_number(duration)),
        TransitionEdge::Out => format!("(({}-t)/{})", ffmpeg_number(end), ffmpeg_number(duration)),
    };

    match style {
        ClipTransitionStyle::SlideLeft => {
            let active = format!("(-w)+(({})-(-w))*({progress})", x);
            let fallback = x.clone();
            *x = ffmpeg_if_between(start, end, &active, &fallback);
        }
        ClipTransitionStyle::SlideRight => {
            let active = format!("W+(({})-W)*({progress})", x);
            let fallback = x.clone();
            *x = ffmpeg_if_between(start, end, &active, &fallback);
        }
        ClipTransitionStyle::SlideUp => {
            let active = format!("(-h)+(({})-(-h))*({progress})", y);
            let fallback = y.clone();
            *y = ffmpeg_if_between(start, end, &active, &fallback);
        }
        ClipTransitionStyle::SlideDown => {
            let active = format!("H+(({})-H)*({progress})", y);
            let fallback = y.clone();
            *y = ffmpeg_if_between(start, end, &active, &fallback);
        }
        ClipTransitionStyle::Fade
        | ClipTransitionStyle::DipBlack
        | ClipTransitionStyle::DipWhite => {}
    }
}

fn ffmpeg_if_between(start: f64, end: f64, active: &str, fallback: &str) -> String {
    format!(
        "if(between(t\\,{}\\,{})\\,{}\\,{})",
        ffmpeg_number(start),
        ffmpeg_number(end),
        active,
        fallback
    )
}

fn append_audio_transition_filters(
    filter: &mut String,
    transitions: ClipTransitions,
    duration: f64,
) {
    let duration = duration.max(0.0);
    let fade_in = transitions.fade_in.min(duration);
    let fade_out = transitions.fade_out.min(duration);
    if fade_in > 0.001 {
        filter.push_str(&format!(",afade=t=in:st=0:d={}", ffmpeg_number(fade_in)));
    }
    if fade_out > 0.001 {
        filter.push_str(&format!(
            ",afade=t=out:st={}:d={}",
            ffmpeg_number((duration - fade_out).max(0.0)),
            ffmpeg_number(fade_out)
        ));
    }
}

fn append_grayscale_filter(filter: &mut String, amount: f64) {
    if amount <= 0.001 {
        return;
    }
    let keep = 1.0 - amount;
    filter.push_str(&format!(
        ",colorchannelmixer=rr={}:rg={}:rb={}:gr={}:gg={}:gb={}:br={}:bg={}:bb={}",
        ffmpeg_number(keep + 0.2126 * amount),
        ffmpeg_number(0.7152 * amount),
        ffmpeg_number(0.0722 * amount),
        ffmpeg_number(0.2126 * amount),
        ffmpeg_number(keep + 0.7152 * amount),
        ffmpeg_number(0.0722 * amount),
        ffmpeg_number(0.2126 * amount),
        ffmpeg_number(0.7152 * amount),
        ffmpeg_number(keep + 0.0722 * amount),
    ));
}

fn append_sepia_filter(filter: &mut String, amount: f64) {
    if amount <= 0.001 {
        return;
    }
    let keep = 1.0 - amount;
    filter.push_str(&format!(
        ",colorchannelmixer=rr={}:rg={}:rb={}:gr={}:gg={}:gb={}:br={}:bg={}:bb={}",
        ffmpeg_number(keep + 0.393 * amount),
        ffmpeg_number(0.769 * amount),
        ffmpeg_number(0.189 * amount),
        ffmpeg_number(0.349 * amount),
        ffmpeg_number(keep + 0.686 * amount),
        ffmpeg_number(0.168 * amount),
        ffmpeg_number(0.272 * amount),
        ffmpeg_number(0.534 * amount),
        ffmpeg_number(keep + 0.131 * amount),
    ));
}

fn append_invert_filter(filter: &mut String, amount: f64) {
    if amount <= 0.001 {
        return;
    }
    let multiplier = 1.0 - 2.0 * amount;
    let offset = 255.0 * amount;
    filter.push_str(&format!(
        ",lutrgb=r='val*{}+{}':g='val*{}+{}':b='val*{}+{}'",
        ffmpeg_number(multiplier),
        ffmpeg_number(offset),
        ffmpeg_number(multiplier),
        ffmpeg_number(offset),
        ffmpeg_number(multiplier),
        ffmpeg_number(offset),
    ));
}

fn finite_or(value: f64, fallback: f64) -> f64 {
    if value.is_finite() {
        value
    } else {
        fallback
    }
}

fn degrees_to_radians(degrees: f64) -> f64 {
    degrees * PI / 180.0
}

fn ffmpeg_number(value: f64) -> String {
    let rounded = format!("{value:.6}");
    rounded
        .trim_end_matches('0')
        .trim_end_matches('.')
        .to_string()
}

pub fn export_with_progress<F>(project: &ExportProject, mut on_progress: F) -> Result<(), String>
where
    F: FnMut(ExportProgress),
{
    let args = build_export_args(project)?;
    run_ffmpeg_export(args, export_total_seconds(project), &mut on_progress)
}

fn run_ffmpeg_export<F>(
    mut args: Vec<String>,
    total: f64,
    on_progress: &mut F,
) -> Result<(), String>
where
    F: FnMut(ExportProgress),
{
    let progress_at = args
        .iter()
        .position(|arg| arg == "-i")
        .unwrap_or(args.len().saturating_sub(1));
    args.splice(
        progress_at..progress_at,
        ["-nostats".into(), "-progress".into(), "pipe:1".into()],
    );

    let mut child = command("ffmpeg")
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to run ffmpeg: {e}"))?;

    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Failed to capture ffmpeg stderr".to_string())?;
    let stderr_reader = std::thread::spawn(move || {
        let mut text = String::new();
        let mut reader = BufReader::new(stderr);
        let _ = reader.read_to_string(&mut text);
        text
    });

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture ffmpeg progress".to_string())?;
    let reader = BufReader::new(stdout);
    let total = total.max(0.001);
    on_progress(ExportProgress {
        percent: 0.0,
        seconds: 0.0,
        total,
    });
    for line in reader.lines() {
        let line = line.map_err(|e| format!("Failed to read ffmpeg progress: {e}"))?;
        if let Some(seconds) = parse_progress_seconds(&line) {
            let seconds = seconds.clamp(0.0, total);
            on_progress(ExportProgress {
                percent: (seconds / total * 100.0).clamp(0.0, 99.9),
                seconds,
                total,
            });
        }
    }

    let status = child
        .wait()
        .map_err(|e| format!("Failed to wait for ffmpeg: {e}"))?;
    let stderr = stderr_reader
        .join()
        .unwrap_or_else(|_| "Failed to read ffmpeg stderr".to_string());

    if !status.success() {
        return Err(format!("Export failed: {}", stderr));
    }
    on_progress(ExportProgress {
        percent: 100.0,
        seconds: total,
        total,
    });
    Ok(())
}

fn export_total_seconds(project: &ExportProject) -> f64 {
    let mut total = 0f64;
    for t in &project.video_tracks {
        for c in &t.clips {
            total = total.max(c.start + (c.out_ - c.in_).max(0.0));
        }
    }
    for t in &project.audio_tracks {
        for c in &t.clips {
            total = total.max(c.start + (c.out_ - c.in_).max(0.0));
        }
    }
    total
}

fn parse_progress_seconds(line: &str) -> Option<f64> {
    let (key, value) = line.split_once('=')?;
    match key {
        "out_time_us" | "out_time_ms" => value.parse::<f64>().ok().map(|us| us / 1_000_000.0),
        "out_time" => parse_progress_time(value),
        _ => None,
    }
}

fn parse_progress_time(value: &str) -> Option<f64> {
    let mut parts = value.split(':');
    let hours = parts.next()?.parse::<f64>().ok()?;
    let minutes = parts.next()?.parse::<f64>().ok()?;
    let seconds = parts.next()?.parse::<f64>().ok()?;
    Some(hours * 3600.0 + minutes * 60.0 + seconds)
}

#[cfg(test)]
mod tests;
