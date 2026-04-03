#!/bin/bash
# Build daemon for macOS and Linux (aarch64)

set -e

cd "$(dirname "$0")/daemon"

echo "🔨 Building clawpilot-daemon for macOS..."
cargo build --release --target aarch64-apple-darwin

echo "🔨 Building clawpilot-daemon for Linux (aarch64)..."
cargo build --release --target aarch64-unknown-linux-gnu

echo "✅ Daemon build complete!"
echo "  macOS: daemon/target/aarch64-apple-darwin/release/clawpilot-daemon"
echo "  Linux: daemon/target/aarch64-unknown-linux-gnu/release/clawpilot-daemon"
