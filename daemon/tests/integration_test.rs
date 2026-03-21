use std::process::Command;

/// 验证 daemon 二进制可以成功构建
#[test]
fn test_daemon_builds() {
    let output = Command::new("cargo")
        .args(["check", "--release"])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("Failed to execute cargo check");

    assert!(
        output.status.success(),
        "Daemon failed to build: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

/// 验证 daemon 版本输出
#[test]
fn test_daemon_version() {
    let output = Command::new("cargo")
        .args(["pkgid"])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("Failed to execute cargo pkgid");

    assert!(output.status.success());

    let pkgid = String::from_utf8_lossy(&output.stdout);
    assert!(pkgid.contains("clawpilot-daemon"));
}
