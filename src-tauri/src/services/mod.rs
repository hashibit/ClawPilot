pub mod agent_service;
pub mod binding_service;
pub mod channel_service;
pub mod install;
pub mod deployment;
pub mod log_service;
pub mod model_service;
pub mod office;
pub mod opc_service;
pub mod skill_service;
pub mod snapshot_service;
pub mod tool_service;
pub mod ssh_service;

// Keep old module names as aliases for backward compatibility during transition
pub use self::install as daemon_install_service;
pub use self::deployment as deployment_service;
pub use self::office as office_service;
