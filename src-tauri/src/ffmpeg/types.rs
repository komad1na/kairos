use serde::{Deserialize, Serialize};

/// Media file metadata, obtained from `ffprobe`. Serialized to the frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoInfo {
    pub duration: f64,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    pub has_video: bool,
    pub has_audio: bool,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportProgress {
    pub percent: f64,
    pub seconds: f64,
    pub total: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewCacheStats {
    pub path: String,
    pub size_bytes: u64,
    pub file_count: u64,
}

/// A clip as sent from the frontend for export (flattened from the timeline model).
#[derive(Debug, Clone, Deserialize)]
pub struct ExportClip {
    pub path: String,
    pub start: f64,
    #[serde(rename = "in")]
    pub in_: f64,
    #[serde(rename = "out")]
    pub out_: f64,
    #[serde(default = "default_volume")]
    pub volume: f64,
    #[serde(default)]
    pub muted: bool,
    #[serde(default)]
    pub transform: ClipTransform,
    #[serde(default)]
    pub effects: ClipEffects,
    #[serde(default)]
    pub transitions: ClipTransitions,
}

fn default_volume() -> f64 {
    1.0
}

#[derive(Debug, Clone, Copy, Deserialize)]
pub struct ClipTransform {
    #[serde(default)]
    pub x: f64,
    #[serde(default)]
    pub y: f64,
    #[serde(default = "default_transform_scale")]
    pub scale: f64,
    #[serde(default)]
    pub rotation: f64,
}

impl Default for ClipTransform {
    fn default() -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            scale: 1.0,
            rotation: 0.0,
        }
    }
}

fn default_transform_scale() -> f64 {
    1.0
}

#[derive(Debug, Clone, Copy, Deserialize)]
pub struct ClipEffects {
    #[serde(default = "default_effect_opacity")]
    pub opacity: f64,
    #[serde(default)]
    pub blur: f64,
    #[serde(default = "default_effect_multiplier")]
    pub brightness: f64,
    #[serde(default = "default_effect_multiplier")]
    pub contrast: f64,
    #[serde(default = "default_effect_multiplier")]
    pub saturation: f64,
    #[serde(default)]
    pub hue: f64,
    #[serde(default)]
    pub grayscale: f64,
    #[serde(default)]
    pub sepia: f64,
    #[serde(default)]
    pub invert: f64,
}

impl Default for ClipEffects {
    fn default() -> Self {
        Self {
            opacity: 1.0,
            blur: 0.0,
            brightness: 1.0,
            contrast: 1.0,
            saturation: 1.0,
            hue: 0.0,
            grayscale: 0.0,
            sepia: 0.0,
            invert: 0.0,
        }
    }
}

fn default_effect_opacity() -> f64 {
    1.0
}

fn default_effect_multiplier() -> f64 {
    1.0
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipTransitions {
    #[serde(default)]
    pub fade_in: f64,
    #[serde(default)]
    pub fade_out: f64,
    #[serde(default)]
    pub in_style: ClipTransitionStyle,
    #[serde(default)]
    pub out_style: ClipTransitionStyle,
}

impl Default for ClipTransitions {
    fn default() -> Self {
        Self {
            fade_in: 0.0,
            fade_out: 0.0,
            in_style: ClipTransitionStyle::Fade,
            out_style: ClipTransitionStyle::Fade,
        }
    }
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ClipTransitionStyle {
    Fade,
    DipBlack,
    DipWhite,
    SlideLeft,
    SlideRight,
    SlideUp,
    SlideDown,
}

impl Default for ClipTransitionStyle {
    fn default() -> Self {
        Self::Fade
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct VideoTrack {
    pub clips: Vec<ExportClip>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AudioTrack {
    pub volume: f64,
    pub muted: bool,
    pub clips: Vec<ExportClip>,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ExportRateControl {
    Crf,
    Bitrate,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ExportEncoder {
    X264,
    H264Nvenc,
    H264Amf,
}

/// The whole timeline as sent for rendering.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportProject {
    pub output: String,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    #[serde(default = "default_rate_control")]
    pub rate_control: ExportRateControl,
    #[serde(default = "default_crf")]
    pub crf: u32,
    #[serde(default)]
    pub video_bitrate_kbps: Option<u32>,
    #[serde(default = "default_audio_bitrate_kbps")]
    pub audio_bitrate_kbps: u32,
    #[serde(default = "default_preset")]
    pub preset: String,
    #[serde(default = "default_encoder")]
    pub encoder: ExportEncoder,
    /// Bottom->top order; the top track occludes lower ones (FR-024a).
    pub video_tracks: Vec<VideoTrack>,
    pub audio_tracks: Vec<AudioTrack>,
}

fn default_rate_control() -> ExportRateControl {
    ExportRateControl::Crf
}

fn default_crf() -> u32 {
    20
}

fn default_audio_bitrate_kbps() -> u32 {
    192
}

fn default_preset() -> String {
    "fast".to_string()
}

fn default_encoder() -> ExportEncoder {
    ExportEncoder::X264
}
