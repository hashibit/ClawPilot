#!/bin/bash
# Build daemon for macOS and Linux (aarch64)

set -e

cd "$(dirname "$0")/daemon"

echo "🔨 Building clawpilot-daemon for macOS..."
cargo build --release --target aarch64-apple-darwin

echo "🔨 Building clawpilot-daemon for Linux (aarch64)..."
cargo build --release --target aarch64-unknown-linux-gnu

echo "✅ Daemon build complete!"

# Copy binaries to src-tauri/resources for bundling
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$SCRIPT_DIR/src-tauri/resources"

cp "target/aarch64-apple-darwin/release/clawpilot-daemon" "$SCRIPT_DIR/src-tauri/resources/clawpilot-daemon-macos"
cp "target/aarch64-unknown-linux-gnu/release/clawpilot-daemon" "$SCRIPT_DIR/src-tauri/resources/clawpilot-daemon-linux"

echo "  macOS: src-tauri/resources/clawpilot-daemon-macos"
echo "  Linux: src-tauri/resources/clawpilot-daemon-linux"
