fn main() {
    // Copy known-providers.json from project root bundle/ to OUT_DIR
    let src = std::path::PathBuf::from("../bundle/known-providers.json");
    let dst = std::path::PathBuf::from(std::env::var("OUT_DIR").unwrap())
        .join("known-providers.json");
    std::fs::copy(&src, &dst).expect("Failed to copy known-providers.json");
    println!("cargo:rerun-if-changed=../bundle/known-providers.json");

    tauri_build::build()
}
