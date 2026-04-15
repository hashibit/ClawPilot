//! Standalone axum HTTP server for development.
//!
//! Replaces the Node.js server — run with:
//!   cargo run --bin dev-server -- --port 16667
//! Or with hot reload:
//!   cargo watch -x 'run --bin dev-server'

use std::net::SocketAddr;
use std::sync::Arc;

use clap::Parser;

use clawpilot_lib::database::{migrations, pool::DbPool};
use clawpilot_lib::http::{routes, AppState};
use clawpilot_lib::commands::office::TunnelPool;
use clawpilot_lib::services::skill_service;
use clawpilot_lib::utils;

#[derive(Parser, Debug)]
#[command(name = "dev-server", about = "ClawPilot development API server")]
struct Args {
    /// Listen port
    #[arg(long, default_value = "16667")]
    port: u16,

    /// Custom database path (default: ~/.clawpilot/clawpilot.db)
    #[arg(long)]
    db: Option<String>,
}

#[tokio::main]
async fn main() {
    // Initialize logging
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::DEBUG)
        .init();

    let args = Args::parse();

    // Resolve database path
    let db_path = if let Some(ref p) = args.db {
        std::path::PathBuf::from(p)
    } else {
        utils::path::db_path().expect("failed to resolve db path")
    };

    utils::path::ensure_dir(db_path.parent().unwrap()).expect("failed to create app data dir");
    let pool = DbPool::new(&db_path).expect("failed to open database");
    migrations::run_migrations(&pool).expect("failed to run migrations");

    // Register bundle skills
    skill_service::register_bundle_skills(&pool).expect("failed to register bundle skills");

    let state = AppState {
        pool,
        tunnel_pool: Arc::new(TunnelPool::new()),
    };

    let app = routes(state);
    let addr = SocketAddr::from(([127, 0, 0, 1], args.port));

    tracing::info!("ClawPilot dev-server listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("failed to bind");

    axum::serve(listener, app).await.expect("server error");
}
