#!/bin/bash
# ClawPilot 统一构建脚本
# 用法: ./scripts/build-all.sh [target] [--cross] [--clean]
#
# Targets:
#   all       - 构建所有产物（默认）
#   frontend  - 仅构建前端
#   daemon    - 仅构建 daemon（多架构）
#   tauri     - 仅构建 Tauri 应用
#   server    - 仅构建 server
#   release   - 发布构建（包含所有平台）
#
# Options:
#   --cross   - 启用交叉编译（需要 cross 工具）
#   --clean   - 清理后重新构建

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1" }
log_success() { echo -e "${GREEN}[OK]${NC} $1" }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1" }
log_error() { echo -e "${RED}[ERROR]${NC} $1" }

# Parse arguments
TARGET="all"
CROSS_COMPILE=false
CLEAN_FIRST=false

for arg in "$@"; do
    case $arg in
        --cross) CROSS_COMPILE=true ;;
        --clean) CLEAN_FIRST=true ;;
        frontend|daemon|tauri|server|all|release) TARGET="$arg" ;;
    esac
done

# Detect current platform
CURRENT_OS="$(uname -s)"
CURRENT_ARCH="$(uname -m)"

log_info "Platform: $CURRENT_OS $CURRENT_ARCH"
log_info "Target: $TARGET"
log_info "Cross compile: $CROSS_COMPILE"

# ─────────────────────────────────────────────────────────────────────────────
# Helper functions
# ─────────────────────────────────────────────────────────────────────────────

check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "Required command '$1' not found"
        return 1
    fi
    log_info "Found: $1 ($(command -v "$1"))"
}

clean_frontend() {
    log_info "Cleaning frontend..."
    rm -rf "$PROJECT_ROOT/dist"
    rm -rf "$PROJECT_ROOT/node_modules/.vite"
}

clean_daemon() {
    log_info "Cleaning daemon..."
    rm -rf "$PROJECT_ROOT/daemon/target"
    rm -f "$PROJECT_ROOT/src-tauri/resources/clawpilot-daemon-*"
}

clean_tauri() {
    log_info "Cleaning Tauri..."
    rm -rf "$PROJECT_ROOT/src-tauri/target"
}

clean_server() {
    log_info "Cleaning server..."
    rm -rf "$PROJECT_ROOT/server/dist"
}

clean_all() {
    clean_frontend
    clean_daemon
    clean_tauri
    clean_server
    log_success "All build artifacts cleaned"
}

# ─────────────────────────────────────────────────────────────────────────────
# Build functions
# ─────────────────────────────────────────────────────────────────────────────

build_frontend() {
    log_info "Building frontend..."
    cd "$PROJECT_ROOT"

    check_command npm || return 1

    # Ensure dependencies
    if [ ! -d "node_modules" ]; then
        log_info "Installing frontend dependencies..."
        npm install
    fi

    npm run build

    if [ -d "dist" ]; then
        log_success "Frontend built: dist/ ($(du -sh dist | cut -f1))"
    else
        log_error "Frontend build failed"
        return 1
    fi
}

build_daemon_local() {
    log_info "Building daemon for current platform ($CURRENT_OS $CURRENT_ARCH)..."
    cd "$PROJECT_ROOT/daemon"

    check_command cargo || return 1

    cargo build --release

    # Copy to resources with platform suffix
    mkdir -p "$PROJECT_ROOT/src-tauri/resources"

    if [ "$CURRENT_OS" = "Darwin" ]; then
        cp "target/release/clawpilot-daemon" "$PROJECT_ROOT/src-tauri/resources/clawpilot-daemon-macos"
        log_success "Daemon built: src-tauri/resources/clawpilot-daemon-macos"
    elif [ "$CURRENT_OS" = "Linux" ]; then
        cp "target/release/clawpilot-daemon" "$PROJECT_ROOT/src-tauri/resources/clawpilot-daemon-linux"
        log_success "Daemon built: src-tauri/resources/clawpilot-daemon-linux"
    else
        log_warn "Unsupported OS for daemon: $CURRENT_OS"
    fi
}

build_daemon_cross() {
    log_info "Building daemon for multiple platforms (cross compile)..."
    cd "$PROJECT_ROOT/daemon"

    check_command cross || {
        log_warn "'cross' not found, falling back to cargo with targets"
        check_command cargo || return 1
    }

    mkdir -p "$PROJECT_ROOT/src-tauri/resources"

    # macOS targets (requires macOS SDK)
    if [ "$CURRENT_OS" = "Darwin" ]; then
        log_info "Building for macOS aarch64..."
        cargo build --release --target aarch64-apple-darwin
        cp "target/aarch64-apple-darwin/release/clawpilot-daemon" \
           "$PROJECT_ROOT/src-tauri/resources/clawpilot-daemon-macos-aarch64"

        log_info "Building for macOS x86_64..."
        cargo build --release --target x86_64-apple-darwin
        cp "target/x86_64-apple-darwin/release/clawpilot-daemon" \
           "$PROJECT_ROOT/src-tauri/resources/clawpilot-daemon-macos-x86_64"

        # Create universal binary
        lipo create \
            "$PROJECT_ROOT/src-tauri/resources/clawpilot-daemon-macos-aarch64" \
            "$PROJECT_ROOT/src-tauri/resources/clawpilot-daemon-macos-x86_64" \
            -output "$PROJECT_ROOT/src-tauri/resources/clawpilot-daemon-macos"
        log_success "Universal macOS daemon created"
    fi

    # Linux targets (using cross)
    if command -v cross &> /dev/null; then
        log_info "Building for Linux aarch64..."
        cross build --release --target aarch64-unknown-linux-gnu
        cp "target/aarch64-unknown-linux-gnu/release/clawpilot-daemon" \
           "$PROJECT_ROOT/src-tauri/resources/clawpilot-daemon-linux-aarch64"

        log_info "Building for Linux x86_64..."
        cross build --release --target x86_64-unknown-linux-gnu
        cp "target/x86_64-unknown-linux-gnu/release/clawpilot-daemon" \
           "$PROJECT_ROOT/src-tauri/resources/clawpilot-daemon-linux-x86_64"

        # Default Linux binary (aarch64 for cloud servers)
        cp "$PROJECT_ROOT/src-tauri/resources/clawpilot-daemon-linux-aarch64" \
           "$PROJECT_ROOT/src-tauri/resources/clawpilot-daemon-linux"
    else
        log_warn "'cross' not installed, skipping Linux cross-compile"
        log_warn "Install with: cargo install cross"
    fi

    log_success "Daemon cross-compile complete"
}

build_daemon() {
    if [ "$CROSS_COMPILE" = true ]; then
        build_daemon_cross
    else
        build_daemon_local
    fi
}

build_tauri_local() {
    log_info "Building Tauri application..."
    cd "$PROJECT_ROOT"

    check_command npm || return 1

    # Ensure frontend and daemon are built first
    if [ ! -d "dist" ]; then
        log_warn "Frontend not built, building now..."
        build_frontend
    fi

    if [ ! -f "src-tauri/resources/clawpilot-daemon-macos" ] && \
       [ ! -f "src-tauri/resources/clawpilot-daemon-linux" ]; then
        log_warn "Daemon not built, building now..."
        build_daemon_local
    fi

    npm run tauri:build

    # Show output location
    if [ "$CURRENT_OS" = "Darwin" ]; then
        APP_PATH="$PROJECT_ROOT/src-tauri/target/release/bundle/macos/ClawPilot.app"
        DMG_PATH="$PROJECT_ROOT/src-tauri/target/release/bundle/dmg/ClawPilot_0.1.0_aarch64.dmg"
        if [ -d "$APP_PATH" ]; then
            log_success "Tauri app: $APP_PATH ($(du -sh "$APP_PATH" | cut -f1))"
        fi
        if [ -f "$DMG_PATH" ]; then
            log_success "DMG: $DMG_PATH ($(du -sh "$DMG_PATH" | cut -f1))"
        fi
    elif [ "$CURRENT_OS" = "Linux" ]; then
        DEB_PATH="$PROJECT_ROOT/src-tauri/target/release/bundle/deb/clawpilot_0.1.0_amd64.deb"
        APPIMAGE_PATH="$PROJECT_ROOT/src-tauri/target/release/bundle/appimage/clawpilot_0.1.0_amd64.AppImage"
        if [ -f "$DEB_PATH" ]; then
            log_success "DEB: $DEB_PATH ($(du -sh "$DEB_PATH" | cut -f1))"
        fi
        if [ -f "$APPIMAGE_PATH" ]; then
            log_success "AppImage: $APPIMAGE_PATH ($(du -sh "$APPIMAGE_PATH" | cut -f1))"
        fi
    fi
}

build_tauri_cross() {
    log_info "Building Tauri for multiple platforms..."
    log_warn "Tauri cross-compilation is complex and platform-specific"
    log_warn "For full release builds, consider using CI/CD (GitHub Actions)"

    if [ "$CURRENT_OS" = "Darwin" ]; then
        log_info "Building macOS universal binary..."
        cd "$PROJECT_ROOT"

        # Build for aarch64
        npm run tauri build -- --target aarch64-apple-darwin

        # Build for x86_64
        npm run tauri build -- --target x86_64-apple-darwin

        log_success "MacOS builds complete"
    else
        log_error "Cross-compilation only supported on macOS host"
        return 1
    fi
}

build_tauri() {
    if [ "$CROSS_COMPILE" = true ]; then
        build_tauri_cross
    else
        build_tauri_local
    fi
}

build_server() {
    log_info "Building server..."
    cd "$PROJECT_ROOT/server"

    check_command npm || return 1

    # Ensure dependencies
    if [ ! -d "node_modules" ]; then
        log_info "Installing server dependencies..."
        npm install
    fi

    # Server doesn't need compilation, but we can create a production bundle
    # For now, just validate it can start
    log_success "Server ready (no build step required for Node.js)"
    log_info "Production deployment: copy server/ directory and run npm install --production"
}

build_all() {
    log_info "===== Building all ClawPilot components ====="

    build_frontend
    build_daemon
    build_tauri

    log_success "===== All components built successfully ====="
}

build_release() {
    log_info "===== Release build (all platforms) ====="

    # Force cross compile for release
    CROSS_COMPILE=true

    build_frontend
    build_daemon_cross
    build_tauri_cross

    log_success "===== Release build complete ====="
}

# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

if [ "$CLEAN_FIRST" = true ]; then
    clean_all
fi

cd "$PROJECT_ROOT"

case "$TARGET" in
    frontend) build_frontend ;;
    daemon)   build_daemon ;;
    tauri)    build_tauri ;;
    server)   build_server ;;
    all)      build_all ;;
    release)  build_release ;;
    clean)    clean_all ;;
    *)
        log_error "Unknown target: $TARGET"
        echo "Usage: $0 [all|frontend|daemon|tauri|server|release|clean] [--cross] [--clean]"
        exit 1
        ;;
esac