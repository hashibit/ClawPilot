pub mod commands;
pub mod database;
pub mod models;
pub mod openclaw;
pub mod services;
pub mod utils;

pub mod error;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
