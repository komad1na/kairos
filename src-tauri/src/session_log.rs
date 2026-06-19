use serde::Serialize;
use std::{
    env,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::PathBuf,
    process,
    sync::{Mutex, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionLogSnapshot {
    pub directory: String,
    pub path: String,
    pub content: String,
}

#[derive(Debug, Clone)]
struct SessionLog {
    directory: PathBuf,
    path: PathBuf,
}

static SESSION_LOG: OnceLock<Mutex<Option<SessionLog>>> = OnceLock::new();

pub fn init() -> Result<(), String> {
    let mut slot = session_slot().lock().map_err(|e| e.to_string())?;
    if slot.is_none() {
        *slot = Some(create_session_log()?);
    }
    drop(slot);
    append("info", "application session started")
}

pub fn append(level: &str, message: &str) -> Result<(), String> {
    let mut slot = session_slot().lock().map_err(|e| e.to_string())?;
    if slot.is_none() {
        *slot = Some(create_session_log()?);
    }
    let session = slot.as_ref().ok_or("session log not initialized")?;
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&session.path)
        .map_err(|e| format!("failed to open session log: {e}"))?;
    writeln!(
        file,
        "[{}] {:<5} {}",
        timestamp_label(),
        level.to_uppercase(),
        message
    )
    .map_err(|e| format!("failed to write session log: {e}"))
}

pub fn snapshot() -> Result<SessionLogSnapshot, String> {
    let mut slot = session_slot().lock().map_err(|e| e.to_string())?;
    if slot.is_none() {
        *slot = Some(create_session_log()?);
    }
    let session = slot.as_ref().ok_or("session log not initialized")?.clone();
    drop(slot);

    let mut content = String::new();
    File::open(&session.path)
        .and_then(|mut file| file.read_to_string(&mut content))
        .map_err(|e| format!("failed to read session log: {e}"))?;

    Ok(SessionLogSnapshot {
        directory: session.directory.to_string_lossy().to_string(),
        path: session.path.to_string_lossy().to_string(),
        content,
    })
}

fn session_slot() -> &'static Mutex<Option<SessionLog>> {
    SESSION_LOG.get_or_init(|| Mutex::new(None))
}

fn create_session_log() -> Result<SessionLog, String> {
    let directory = logs_dir();
    fs::create_dir_all(&directory).map_err(|e| format!("failed to create log directory: {e}"))?;
    let path = directory.join(format!(
        "session-{}-{}.log",
        timestamp_millis(),
        process::id()
    ));
    let mut file = File::create(&path).map_err(|e| format!("failed to create session log: {e}"))?;
    writeln!(file, "Kairos session log").map_err(|e| e.to_string())?;
    writeln!(file, "path: {}", path.to_string_lossy()).map_err(|e| e.to_string())?;
    writeln!(file, "started: {}", timestamp_label()).map_err(|e| e.to_string())?;
    writeln!(file).map_err(|e| e.to_string())?;
    Ok(SessionLog { directory, path })
}

fn logs_dir() -> PathBuf {
    if cfg!(target_os = "windows") {
        if let Some(base) = env::var_os("LOCALAPPDATA").or_else(|| env::var_os("APPDATA")) {
            return PathBuf::from(base).join("Kairos").join("logs");
        }
    }

    if cfg!(target_os = "macos") {
        if let Some(home) = env::var_os("HOME") {
            return PathBuf::from(home)
                .join("Library")
                .join("Logs")
                .join("Kairos");
        }
    }

    if let Some(base) = env::var_os("XDG_STATE_HOME") {
        return PathBuf::from(base).join("kairos").join("logs");
    }
    if let Some(home) = env::var_os("HOME") {
        return PathBuf::from(home)
            .join(".local")
            .join("state")
            .join("kairos")
            .join("logs");
    }

    env::temp_dir().join("kairos-logs")
}

fn timestamp_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn timestamp_label() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}.{:03}s", now.as_secs(), now.subsec_millis())
}
