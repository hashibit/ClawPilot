//! Bearer-token authentication for the daemon HTTP API.
//!
//! The token lives at `~/.clawpilot/daemon.key` (file mode 0600). It is
//! generated on first daemon startup and shared with the local server
//! process, which runs on the same host and can therefore read the same
//! file. Any other local process that does not own the user account is
//! denied access to the daemon.

use std::fs;
use std::path::PathBuf;

use axum::{
    body::Body,
    extract::Request,
    http::{header, StatusCode},
    middleware::Next,
    response::Response,
};

const TOKEN_BYTES: usize = 32;

fn token_path() -> Option<PathBuf> {
    Some(dirs::home_dir()?.join(".clawpilot").join("daemon.key"))
}

/// Load the daemon bearer token, generating one if it does not exist.
///
/// On first call after a fresh install this writes `~/.clawpilot/daemon.key`
/// with mode 0600. The token is a 32-byte random value, hex-encoded.
pub fn load_or_create_token() -> String {
    let path = match token_path() {
        Some(p) => p,
        None => {
            tracing::error!("[auth] cannot locate home directory; daemon will refuse all requests");
            return String::new();
        }
    };

    // Try existing file first.
    if let Ok(existing) = fs::read_to_string(&path) {
        let trimmed = existing.trim();
        if trimmed.len() == TOKEN_BYTES * 2 && trimmed.chars().all(|c| c.is_ascii_hexdigit()) {
            return trimmed.to_string();
        }
        tracing::warn!("[auth] daemon.key exists but is malformed; regenerating");
    }

    // Generate new token.
    let mut bytes = [0u8; TOKEN_BYTES];
    use rand_core::{OsRng, RngCore};
    OsRng.fill_bytes(&mut bytes);
    let token = hex::encode(bytes);

    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Err(e) = fs::write(&path, &token) {
        tracing::error!("[auth] failed to persist daemon.key: {e}");
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if fs::metadata(&path).is_ok() {
            let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
        }
    }

    tracing::info!("[auth] generated new daemon bearer token at {}", path.display());
    token
}

/// Bearer-token middleware. Rejects any request that does not present a
/// matching `Authorization: Bearer <token>` header.
///
/// The expected token is captured by the closure caller; this function is the
/// concrete `from_fn_with_state`-style middleware used by axum.
pub async fn require_bearer(
    expected: axum::extract::State<String>,
    req: Request<Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    let header_value = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let presented = header_value
        .strip_prefix("Bearer ")
        .or_else(|| header_value.strip_prefix("bearer "))
        .unwrap_or("");

    // constant-time comparison
    if !constant_time_eq(presented.as_bytes(), expected.0.as_bytes()) {
        return Err(StatusCode::UNAUTHORIZED);
    }

    Ok(next.run(req).await)
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff: u8 = 0;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_constant_time_eq() {
        assert!(constant_time_eq(b"abc", b"abc"));
        assert!(!constant_time_eq(b"abc", b"abd"));
        assert!(!constant_time_eq(b"abc", b"ab"));
    }
}
