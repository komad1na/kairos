use super::preview_cache::{build_preview_cache_args, build_preview_cache_attempts};
use super::*;
use std::path::Path;

fn clip(path: &str, start: f64, in_: f64, out: f64, volume: f64, muted: bool) -> ExportClip {
    ExportClip {
        path: path.into(),
        start,
        in_,
        out_: out,
        volume,
        muted,
        transform: ClipTransform::default(),
        effects: ClipEffects::default(),
        transitions: ClipTransitions::default(),
    }
}

fn project(video: Vec<VideoTrack>, audio: Vec<AudioTrack>) -> ExportProject {
    ExportProject {
        output: "/tmp/out.mp4".into(),
        width: 1920,
        height: 1080,
        fps: 30.0,
        rate_control: ExportRateControl::Crf,
        crf: 20,
        video_bitrate_kbps: None,
        audio_bitrate_kbps: 192,
        preset: "fast".into(),
        encoder: ExportEncoder::X264,
        video_tracks: video,
        audio_tracks: audio,
    }
}

fn joined(args: &[String]) -> String {
    args.join(" ")
}

fn video_info(width: u32, height: u32) -> VideoInfo {
    VideoInfo {
        duration: 10.0,
        width,
        height,
        fps: 30.0,
        video_codec: Some("h264".into()),
        audio_codec: Some("aac".into()),
        has_video: true,
        has_audio: true,
    }
}

#[test]
fn empty_project_errors() {
    let p = project(vec![], vec![]);
    assert!(build_export_args(&p).is_err());
}

#[test]
fn preview_cache_resolution_uses_landscape_bounds() {
    let args = build_preview_cache_args(
        "/tmp/in.mp4",
        Path::new("/tmp/out.mp4"),
        &video_info(1920, 1080),
        720,
    )
    .unwrap();
    let s = joined(&args);
    assert!(s.contains("min(iw,1280)"));
    assert!(s.contains("min(ih,720)"));
}

#[test]
fn preview_cache_resolution_uses_vertical_bounds() {
    let args = build_preview_cache_args(
        "/tmp/in.mp4",
        Path::new("/tmp/out.mp4"),
        &video_info(1080, 1920),
        720,
    )
    .unwrap();
    let s = joined(&args);
    assert!(s.contains("min(iw,720)"));
    assert!(s.contains("min(ih,1280)"));
}

#[test]
fn preview_cache_prefers_nvenc_then_x264_fallback() {
    let attempts = build_preview_cache_attempts(
        "/tmp/in.mp4",
        Path::new("/tmp/out.mp4"),
        &video_info(1920, 1080),
        720,
    )
    .unwrap();
    assert_eq!(attempts.len(), 2);
    assert!(joined(&attempts[0].args).contains("-c:v h264_nvenc"));
    assert!(joined(&attempts[1].args).contains("-c:v libx264"));
}

#[test]
fn single_video_clip() {
    let p = project(
        vec![VideoTrack {
            clips: vec![clip("/a.mp4", 0.0, 0.0, 5.0, 1.0, false)],
        }],
        vec![],
    );
    let args = build_export_args(&p).unwrap();
    let s = joined(&args);
    assert_eq!(args.iter().filter(|a| *a == "-i").count(), 1);
    assert!(s.contains("[0:v]trim=start=0:end=5"));
    assert!(s.contains("overlay=x='(W-w)/2+0':y='(H-h)/2+0':enable='between(t,0,5)'"));
    assert!(s.contains("color=c=black:s=1920x1080"));
    assert!(s.contains("-c:v libx264"));
    assert!(s.contains("-crf 20"));
}

#[test]
fn bitrate_export_sets_video_and_audio_bitrates() {
    let mut p = project(
        vec![VideoTrack {
            clips: vec![clip("/a.mp4", 0.0, 0.0, 5.0, 1.0, false)],
        }],
        vec![AudioTrack {
            volume: 1.0,
            muted: false,
            clips: vec![clip("/a.mp4", 0.0, 0.0, 5.0, 1.0, false)],
        }],
    );
    p.rate_control = ExportRateControl::Bitrate;
    p.video_bitrate_kbps = Some(12_000);
    p.audio_bitrate_kbps = 256;
    p.preset = "slow".into();

    let s = joined(&build_export_args(&p).unwrap());
    assert!(s.contains("-preset slow"));
    assert!(s.contains("-b:v 12000k"));
    assert!(s.contains("-maxrate 12000k"));
    assert!(s.contains("-bufsize 24000k"));
    assert!(s.contains("-b:a 256k"));
    assert!(!s.contains("-crf "));
}

#[test]
fn nvenc_export_uses_hardware_encoder_options() {
    let mut p = project(
        vec![VideoTrack {
            clips: vec![clip("/a.mp4", 0.0, 0.0, 5.0, 1.0, false)],
        }],
        vec![],
    );
    p.encoder = ExportEncoder::H264Nvenc;
    p.preset = "veryfast".into();

    let s = joined(&build_export_args(&p).unwrap());
    assert!(s.contains("-c:v h264_nvenc"));
    assert!(s.contains("-preset p2"));
    assert!(s.contains("-rc vbr"));
    assert!(s.contains("-cq 20"));
}

#[test]
fn amf_export_uses_hardware_encoder_options() {
    let mut p = project(
        vec![VideoTrack {
            clips: vec![clip("/a.mp4", 0.0, 0.0, 5.0, 1.0, false)],
        }],
        vec![],
    );
    p.encoder = ExportEncoder::H264Amf;
    p.preset = "slow".into();

    let s = joined(&build_export_args(&p).unwrap());
    assert!(s.contains("-c:v h264_amf"));
    assert!(s.contains("-quality quality"));
    assert!(s.contains("-rc cqp"));
    assert!(s.contains("-qp_i 20"));
    assert!(s.contains("-qp_p 20"));
    assert!(s.contains("-qp_b 20"));
}

#[test]
fn parses_ffmpeg_progress_time() {
    assert_eq!(parse_progress_seconds("out_time_ms=2500000"), Some(2.5));
    assert_eq!(
        parse_progress_seconds("out_time=00:01:02.500000"),
        Some(62.5)
    );
    assert_eq!(parse_progress_seconds("progress=continue"), None);
}

#[test]
fn video_clip_transform_is_applied_before_overlay() {
    let mut c = clip("/a.mp4", 0.0, 0.0, 5.0, 1.0, false);
    c.transform = ClipTransform {
        x: 120.0,
        y: -80.0,
        scale: 1.5,
        rotation: 90.0,
    };
    let p = project(vec![VideoTrack { clips: vec![c] }], vec![]);

    let s = joined(&build_export_args(&p).unwrap());
    assert!(s.contains("scale=w='max(2,trunc(iw*1.5/2)*2)'"));
    assert!(s.contains("rotate=1.570796"));
    assert!(s.contains("overlay=x='(W-w)/2+120':y='(H-h)/2+-80'"));
}

#[test]
fn video_clip_effects_are_exported_as_filters() {
    let mut c = clip("/a.mp4", 0.0, 0.0, 5.0, 1.0, false);
    c.effects = ClipEffects {
        opacity: 0.5,
        blur: 3.0,
        brightness: 1.2,
        contrast: 1.3,
        saturation: 0.4,
        hue: 45.0,
        grayscale: 0.25,
        sepia: 0.5,
        invert: 0.75,
    };
    let p = project(vec![VideoTrack { clips: vec![c] }], vec![]);

    let s = joined(&build_export_args(&p).unwrap());
    assert!(s.contains("hue=h=45"));
    // Brightness is a multiply (matches the CSS-based preview), contrast/saturation stay in eq.
    assert!(s.contains("colorchannelmixer=rr=1.2:gg=1.2:bb=1.2"));
    assert!(s.contains("eq=contrast=1.3:saturation=0.4"));
    assert!(s.contains("gblur=sigma=3"));
    assert!(s.contains("colorchannelmixer=rr="));
    assert!(s.contains("lutrgb=r='val*-0.5+191.25'"));
    assert!(s.contains("colorchannelmixer=aa=0.5"));
}

#[test]
fn clip_transitions_are_exported_as_video_and_audio_fades() {
    let mut video = clip("/a.mp4", 2.0, 0.0, 5.0, 1.0, false);
    video.transitions = ClipTransitions {
        fade_in: 0.5,
        fade_out: 1.0,
        ..ClipTransitions::default()
    };
    let mut audio = clip("/a.mp4", 2.0, 0.0, 5.0, 1.0, false);
    audio.transitions = video.transitions;
    let p = project(
        vec![VideoTrack { clips: vec![video] }],
        vec![AudioTrack {
            volume: 1.0,
            muted: false,
            clips: vec![audio],
        }],
    );

    let s = joined(&build_export_args(&p).unwrap());
    assert!(s.contains("fade=t=in:st=2:d=0.5:alpha=1"));
    assert!(s.contains("fade=t=out:st=6:d=1:alpha=1"));
    assert!(s.contains("afade=t=in:st=0:d=0.5"));
    assert!(s.contains("afade=t=out:st=4:d=1"));
}

#[test]
fn dip_transitions_are_exported_as_color_fades() {
    let mut video = clip("/a.mp4", 0.0, 0.0, 4.0, 1.0, false);
    video.transitions = ClipTransitions {
        fade_in: 0.5,
        fade_out: 0.75,
        in_style: ClipTransitionStyle::DipBlack,
        out_style: ClipTransitionStyle::DipWhite,
    };
    let p = project(vec![VideoTrack { clips: vec![video] }], vec![]);

    let s = joined(&build_export_args(&p).unwrap());
    assert!(s.contains("fade=t=in:st=0:d=0.5:color=black"));
    assert!(s.contains("fade=t=out:st=3.25:d=0.75:color=white"));
}

#[test]
fn slide_transitions_are_exported_as_overlay_motion() {
    let mut video = clip("/a.mp4", 2.0, 0.0, 4.0, 1.0, false);
    video.transitions = ClipTransitions {
        fade_in: 0.5,
        fade_out: 1.0,
        in_style: ClipTransitionStyle::SlideLeft,
        out_style: ClipTransitionStyle::SlideDown,
    };
    let p = project(vec![VideoTrack { clips: vec![video] }], vec![]);

    let s = joined(&build_export_args(&p).unwrap());
    assert!(s.contains("overlay=x='if(between(t\\,2\\,2.5)"));
    assert!(s.contains("(-w)+(((W-w)/2+0)-(-w))*(((t-2)/0.5))"));
    assert!(s.contains("overlay=x='"));
    assert!(s.contains("y='if(between(t\\,5\\,6)"));
    assert!(s.contains("H+(((H-h)/2+0)-H)*(((6-t)/1))"));
}

#[test]
fn clip_with_leading_gap_is_offset() {
    let p = project(
        vec![VideoTrack {
            clips: vec![clip("/a.mp4", 2.0, 0.0, 5.0, 1.0, false)],
        }],
        vec![],
    );
    let s = joined(&build_export_args(&p).unwrap());
    assert!(s.contains("setpts=PTS-STARTPTS+2/TB"));
    assert!(s.contains("between(t,2,7)"));
}

#[test]
fn two_audio_tracks_are_mixed_with_volume() {
    let p = project(
        vec![],
        vec![
            AudioTrack {
                volume: 1.0,
                muted: false,
                clips: vec![clip("/a.mp3", 0.0, 0.0, 5.0, 1.5, false)],
            },
            AudioTrack {
                volume: 0.5,
                muted: false,
                clips: vec![clip("/b.mp3", 0.0, 0.0, 5.0, 1.0, false)],
            },
        ],
    );
    let s = joined(&build_export_args(&p).unwrap());
    assert!(s.contains("amix=inputs=2:normalize=0"));
    assert!(s.contains("volume=1.5"));
    assert!(s.contains("volume=0.5"));
    assert!(s.contains("-c:a aac"));
}

#[test]
fn muted_audio_clip_has_zero_gain() {
    let p = project(
        vec![],
        vec![AudioTrack {
            volume: 1.0,
            muted: false,
            clips: vec![clip("/a.mp3", 0.0, 0.0, 5.0, 1.0, true)],
        }],
    );
    let s = joined(&build_export_args(&p).unwrap());
    assert!(s.contains("volume=0"));
}

#[test]
fn two_video_tracks_overlap_top_wins_order() {
    // Bottom track first in the vec -> overlaid first -> top track drawn last.
    let p = project(
        vec![
            VideoTrack {
                clips: vec![clip("/bottom.mp4", 0.0, 0.0, 5.0, 1.0, false)],
            },
            VideoTrack {
                clips: vec![clip("/top.mp4", 0.0, 0.0, 5.0, 1.0, false)],
            },
        ],
        vec![],
    );
    let s = joined(&build_export_args(&p).unwrap());
    assert_eq!(s.matches("overlay=").count(), 2);
    let bottom_pos = s.find("[vbase][vc0]overlay").unwrap();
    let top_pos = s.find("[vo0][vc1]overlay").unwrap();
    assert!(bottom_pos < top_pos);
}
