mod auth;
mod deploy;
mod error;
mod routes;
mod scheduler;
mod state;
mod utils;
#[cfg(test)]
mod tests;

use axum::{
    middleware,
    routing::{get, post},
    Router,
};
use clap::Parser;
use state::AppState;
use std::{fs, net::SocketAddr, path::PathBuf, time::Duration};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use scheduler::{Db, DagScheduler, Worker, Recovery, artifacts};

/// ClawPilot Deploy Daemon
#[derive(Parser, Debug)]
#[command(name = "clawpilot-daemon", version, about)]
struct Args {
    /// Listen address (e.g. 127.0.0.1:16668 or 0.0.0.0:16668)
    #[arg(long, default_value = "127.0.0.1:16668")]
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
    // Prepare log directory: ~/.clawpilot/logs/
    let log_dir = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".clawpilot")
        .join("logs");
    let _ = fs::create_dir_all(&log_dir);

    // File appender: daily rotation → ~/.clawpilot/logs/daemon.YYYY-MM-DD
    let file_appender = tracing_appender::rolling::daily(&log_dir, "daemon");
    let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);

    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| "clawpilot_daemon=info,tower_http=info".into());

    tracing_subscriber::registry()
        .with(filter)
        // stdout (with color)
        .with(tracing_subscriber::fmt::layer().with_writer(std::io::stdout))
        // file (no ANSI escape codes)
        .with(
            tracing_subscriber::fmt::layer()
                .with_writer(non_blocking)
                .with_ansi(false),
        )
        .init();

    let args = Args::parse();
    let api_key = load_api_key(args.key_file);

    // Initialize scheduler DB
    let data_dir = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".clawpilot");
    let _ = fs::create_dir_all(&data_dir);

    let db_path = data_dir.join("scheduler.db");
    let db = Db::new(&db_path).expect("Failed to initialize scheduler database");
    tracing::info!("Scheduler database initialized at {}", db_path.display());

    // Initialize artifact directories
    let _ = artifacts::init_artifacts_root();
    tracing::info!("Artifact directories initialized");

    // Create scheduler components
    let worker = Worker::new();
    let dag = DagScheduler::new(db.clone(), worker.clone());
    let recovery = Recovery::new(db.clone(), worker.clone(), dag.clone());

    // Create app state with scheduler
    let state = AppState::new(api_key).with_scheduler(db, worker, dag);

    // Start recovery on startup
    let recovery_clone = recovery.clone();
    tokio::spawn(async move {
        recovery_clone.recover_on_startup().await;
    });

    // Start internal timer (runs every 60 seconds)
    let recovery_timer = recovery.clone();
    tokio::spawn(async move {
        loop {
            tracing::debug!("Running scheduler timer tasks");
            recovery_timer.handle_timeouts().await;
            recovery_timer.auto_approve_expired_plans(120).await; // 2 min auto-approve timeout
            recovery_timer.sync_agents_from_openclaw().await;
            recovery_timer.sweep_all_executing_plans().await;

            tokio::time::sleep(Duration::from_secs(60)).await;
        }
    });

    // Authenticated routes for deploy (existing)
    let protected_deploy = Router::new()
        .route("/restart_openclaw", post(routes::restart_openclaw))
        .route("/deploy", post(routes::deploy))
        .route("/deploy/:task_id", get(routes::deploy_status))
        .route("/rollback", post(routes::rollback))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth::require_auth,
        ));

    // Unprotected routes (health)
    let app = Router::new()
        .route("/health", get(routes::health));

    // Add protected deploy routes with auth middleware
    let app = app.merge(protected_deploy);

    // Add scheduler routes with authentication
    let scheduler_routes = scheduler::routes::scheduler_router()
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth::require_auth,
        ));

    let app = app.merge(scheduler_routes)
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    tracing::info!("ClawPilot Daemon listening on {}", args.listen);
    let listener = tokio::net::TcpListener::bind(args.listen).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
