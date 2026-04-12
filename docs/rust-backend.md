# Rust 后端参考

## 主要依赖

```toml
tauri = { version = "2" }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rusqlite = { version = "0.32", features = ["bundled"] }
tokio = { version = "1", features = ["full"] }
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1", features = ["v4", "serde"] }
anyhow = "1"
thiserror = "2"
dirs = "5"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
aes-gcm = "0.10"
base64 = "0.22"
reqwest = { version = "0.12", features = ["json", "rustls-tls"] }
regex = "1"
zip = "0.6"
flate2 = "1.1"
tar = "0.4"
```

## 标准错误类型

```rust
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Database error: {0}")]      Database(#[from] rusqlite::Error),
    #[error("IO error: {0}")]            Io(#[from] std::io::Error),
    #[error("Serialization error: {0}")] Serialization(#[from] serde_json::Error),
    #[error("Not found: {0}")]           NotFound(String),
    #[error("Validation error: {0}")]    Validation(String),
}
```
