mod auth;
mod deploy;
mod error;
mod routes;
mod state;

use axum::{
    middleware,
    routing::{get, post},
    Router,
};
use clap::Parser;
use state::AppState;
use std::{fs, net::SocketAddr, path::PathBuf};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

/// ClawPilot Deploy Daemon
#[derive(Parser, Debug)]
#[command(name = "clawpilot-daemon", version, about)]
struct Args {
    /// Listen address (e.g. 127.0.0.1:8443 or 0.0.0.0:8443)
    #[arg(long, default_value = "127.0.0.1:8443")]
    listen: SocketAddr,

    /// Path to API key file (one line, plain text)
    /// If not provided, reads from ~/.clawpilot/daemon.key
    #[arg(long)]
    key_file: Option<PathBuf>,
}

fn load_api_key(key_file: Option<PathBuf>) -> String {
    let path = key_file.unwrap_or_else(|| {
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("/tmp"))
            .join(".clawpilot")
            .join("daemon.key")
    });

    if let Ok(content) = fs::read_to_string(&path) {
        let key = content.trim().to_string();
        if !key.is_empty() {
            tracing::info!("API Key loaded from {}", path.display());
            return key;
        }
    }

    // Generate a new key and save it
    let key = uuid::Uuid::new_v4().to_string().replace("-", "");
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::write(&path, &key);
    tracing::warn!(
        "Generated new API Key → {} (copy this key into ClawPilot Office config)",
        path.display()
    );
    tracing::warn!("API Key: {}", key);
    key
}

#[tokio::main]
async fn main() {
    // Init tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "clawpilot_daemon=info,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let args = Args::parse();
    let api_key = load_api_key(args.key_file);
    let state = AppState::new(api_key);

    // Authenticated routes
    let protected = Router::new()
        .route("/deploy", post(routes::deploy))
        .route("/deploy/:task_id", get(routes::deploy_status))
        .route("/rollback", post(routes::rollback))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth::require_auth,
        ));

    let app = Router::new()
        .route("/health", get(routes::health))
        .merge(protected)
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    tracing::info!("ClawPilot Daemon listening on {}", args.listen);
    let listener = tokio::net::TcpListener::bind(args.listen).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
