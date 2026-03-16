use std::path::{Path, PathBuf};

use crate::error::AppError;

/// Returns `~/.clawpilot/` as the application data directory.
pub fn app_data_dir() -> crate::error::Result<PathBuf> {
    let home = dirs::home_dir()
        .ok_or_else(|| AppError::Internal("Cannot determine home directory".to_string()))?;
    Ok(home.join(".clawpilot"))
}

/// Returns `~/.clawpilot/clawpilot.db` as the SQLite database path.
pub fn db_path() -> crate::error::Result<PathBuf> {
    Ok(app_data_dir()?.join("clawpilot.db"))
}

/// Returns `~/.openclaw/<opc_name>/` as the directory for a given OPC.
pub fn opc_dir(opc_name: &str) -> crate::error::Result<PathBuf> {
    let home = dirs::home_dir()
        .ok_or_else(|| AppError::Internal("Cannot determine home directory".to_string()))?;
    Ok(home.join(".openclaw").join(opc_name))
}

/// Ensures that the given directory (and all parent directories) exist.
pub fn ensure_dir(path: &Path) -> crate::error::Result<()> {
    std::fs::create_dir_all(path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::OsStr;

    #[test]
    fn test_app_data_dir_contains_clawpilot() {
        let path = app_data_dir().expect("app_data_dir should succeed");
        assert!(
            path.components()
                .any(|c| c.as_os_str() == OsStr::new(".clawpilot")),
            "app_data_dir() should contain '.clawpilot', got: {}",
            path.display()
        );
    }

    #[test]
    fn test_db_path_ends_with_db_extension() {
        let path = db_path().expect("db_path should succeed");
        assert_eq!(
            path.extension().and_then(|e| e.to_str()),
            Some("db"),
            "db_path() should end with '.db', got: {}",
            path.display()
        );
    }

    #[test]
    fn test_opc_dir_contains_opc_name() {
        let path = opc_dir("test_opc").expect("opc_dir should succeed");
        assert!(
            path.components()
                .any(|c| c.as_os_str() == OsStr::new("test_opc")),
            "opc_dir('test_opc') should contain 'test_opc', got: {}",
            path.display()
        );
    }

    #[test]
    fn test_ensure_dir_creates_nested_directories() {
        let base = std::env::temp_dir()
            .join("clawpilot_test")
            .join("nested")
            .join("deep");
        // Clean up any prior run so the test is idempotent.
        let _ = std::fs::remove_dir_all(std::env::temp_dir().join("clawpilot_test"));

        ensure_dir(&base).expect("ensure_dir should create nested directories");
        assert!(base.is_dir(), "directory should exist after ensure_dir");

        // Clean up.
        let _ = std::fs::remove_dir_all(std::env::temp_dir().join("clawpilot_test"));
    }
}
