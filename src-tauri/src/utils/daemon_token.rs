//! Read the local daemon's bearer token from `~/.clawpilot/daemon.key`.
//!
//! The daemon generates this token on first start (mode 0600). Both daemon
//! and server run on the same host as the same user, so reading the file is
//! the source of truth — no need to share via env or config.

use std::fs;
use std::path::PathBuf;

fn token_path() -> Option<PathBuf> {
    Some(dirs::home_dir()?.join(".clawpilot").join("daemon.key"))
}

/// Read the daemon bearer token. Returns `None` if the file does not yet
/// exist (e.g. daemon never started). Callers should treat that as
/// "no auth header" and let the request fail naturally with 401.
pub fn read_daemon_token() -> Option<String> {
    let path = token_path()?;
    let content = fs::read_to_string(&path).ok()?;
    let trimmed = content.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

/// Build an `Authorization: Bearer <token>` header value, if the token
/// file is readable. Returns `None` otherwise.
pub fn bearer_header_value() -> Option<String> {
    read_daemon_token().map(|t| format!("Bearer {t}"))
}
