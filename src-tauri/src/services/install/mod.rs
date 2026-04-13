pub mod daemon;
pub mod decoration;
pub mod platform;
pub mod types;

pub use self::daemon::{install_daemon, install_daemon_binary, is_daemon_running};
pub use self::platform::{
    get_daemon_bin_dir, get_daemon_binary_path, get_daemon_logs_dir, Arch, OsType,
};
pub use self::types::DaemonInstallResult;

#[cfg(test)]
mod tests {
    use super::*;
    use super::decoration::{generate_launchd_plist, generate_systemd_service};

    #[test]
    fn test_generate_launchd_plist() {
        let daemon_path = dirs::home_dir().unwrap().join(".clawpilot/bin/clawpilot-daemon");
        let plist = generate_launchd_plist(&daemon_path.display().to_string(), 16668);
        assert!(plist.contains("com.clawpilot.daemon"));
        assert!(plist.contains("127.0.0.1:16668"));
        assert!(plist.contains(".clawpilot/bin/clawpilot-daemon"));
    }

    #[test]
    fn test_generate_systemd_service() {
        let daemon_path = dirs::home_dir().unwrap().join(".clawpilot/bin/clawpilot-daemon");
        let service = generate_systemd_service(&daemon_path.display().to_string(), 16668);
        assert!(service.contains("ClawPilot Daemon"));
        assert!(service.contains("127.0.0.1:16668"));
        assert!(service.contains("WantedBy=default.target"));
        assert!(service.contains(".clawpilot/bin/clawpilot-daemon"));
    }

    #[test]
    fn test_arch_from_uname() {
        assert_eq!(platform::Arch::from_uname("arm64"), Arch::Arm64);
        assert_eq!(platform::Arch::from_uname("aarch64"), Arch::Arm64);
        assert_eq!(platform::Arch::from_uname("x86_64"), Arch::X64);
        assert_eq!(platform::Arch::from_uname("amd64"), Arch::X64);
    }

    #[test]
    fn test_os_resource_suffix() {
        assert_eq!(OsType::MacOS.resource_suffix(), "macos");
        assert_eq!(OsType::Linux.resource_suffix(), "linux");
    }

    #[test]
    fn test_arch_resource_suffix() {
        assert_eq!(Arch::Arm64.resource_suffix(), "arm64");
        assert_eq!(Arch::X64.resource_suffix(), "x64");
    }
}
