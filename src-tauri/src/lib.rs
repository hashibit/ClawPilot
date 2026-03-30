pub mod commands;
pub mod database;
pub mod error;
pub mod models;
pub mod openclaw;
pub mod services;
pub mod utils;

#[cfg(test)]
mod integration_tests;

use database::{migrations, pool::DbPool};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize DB pool
    let db_path = utils::path::db_path().expect("failed to resolve db path");
    utils::path::ensure_dir(db_path.parent().unwrap()).expect("failed to create app data dir");
    let pool = DbPool::new(&db_path).expect("failed to open database");
    migrations::run_migrations(&pool).expect("failed to run migrations");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(pool)
        .invoke_handler(tauri::generate_handler![
            // OPC
            commands::opc::get_all_opcs,
            commands::opc::get_opc,
            commands::opc::create_opc,
            commands::opc::update_opc,
            commands::opc::delete_opc,
            commands::opc::set_current_opc,
            commands::opc::get_current_opc,
            commands::opc::get_opc_stats,
            commands::opc::export_opc,
            commands::opc::import_opc,
            // Agent
            commands::agent::get_agents,
            commands::agent::get_agent,
            commands::agent::create_agent,
            commands::agent::update_agent,
            commands::agent::delete_agent,
            commands::agent::reorder_agents,
            commands::agent::get_agent_document,
            commands::agent::update_agent_document,
            // Model
            commands::model::get_providers,
            commands::model::get_provider,
            commands::model::update_provider,
            commands::model::create_provider,
            commands::model::delete_provider,
            commands::model::get_models,
            commands::model::set_models,
            commands::model::test_provider,
            commands::model::get_known_providers,
            commands::model::suggest_provider,
            // Channel
            commands::channel::get_channels,
            commands::channel::get_channel,
            commands::channel::upsert_channel,
            commands::channel::delete_channel,
            commands::channel::test_feishu_connection,
            // Binding
            commands::binding::get_bindings,
            commands::binding::get_binding,
            commands::binding::create_binding,
            commands::binding::update_binding,
            commands::binding::delete_binding,
            commands::binding::toggle_binding,
            commands::binding::get_feishu_channels,
            // Tool & Skill
            commands::tool::get_tools,
            commands::tool::sync_tools_from_clawhub,
            commands::skill::get_skills,
            commands::skill::sync_skills_from_clawhub,
            // Snapshot
            commands::snapshot::create_snapshot,
            commands::snapshot::get_snapshots,
            commands::snapshot::get_snapshot,
            commands::snapshot::restore_snapshot,
            commands::snapshot::delete_snapshot,
            // Office
            commands::office::get_offices,
            commands::office::get_office,
            commands::office::create_office,
            commands::office::update_office,
            commands::office::delete_office,
            commands::office::assign_office,
            commands::office::get_opc_office,
            commands::office::get_office_deployments,
            commands::office::check_daemon_health,
            // Deployment
            commands::deployment::start_deployment,
            commands::deployment::get_deployment_status,
            commands::deployment::cancel_deployment,
            commands::deployment::get_recent_deployments,
            commands::deployment::undeploy,
            // Log
            commands::log::get_logs,
            commands::log::write_log,
            // AI
            commands::ai::ai_generate_agent,
            commands::ai::chat_with_agent,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
