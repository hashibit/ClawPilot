# ClawPilot Makefile
# 统一构建入口
#
# 用法:
#   make              # 构建所有本地产物
#   make release      # 发布构建（多平台）
#   make clean        # 清理构建产物
#   make daemon       # 仅构建 daemon
#   make tauri        # 仅构建 Tauri 应用
#
# 选项:
#   CROSS=1           # 启用交叉编译
#   CLEAN=1           # 构建前先清理

.PHONY: all frontend daemon daemon-local daemon-cross tauri tauri-local tauri-cross server release clean help check

# 默认目标
all: frontend daemon-local tauri-local

# ─────────────────────────────────────────────────────────────
# 检查依赖
# ─────────────────────────────────────────────────────────────

check:
	@echo "🔍 Checking build dependencies..."
	@command -v npm >/dev/null 2>&1 || { echo "❌ npm not found"; exit 1; }
	@command -v cargo >/dev/null 2>&1 || { echo "❌ cargo not found"; exit 1; }
	@command -v node >/dev/null 2>&1 && echo "✅ node: $$(node --version)"
	@command -v npm >/dev/null 2>&1 && echo "✅ npm: $$(npm --version)"
	@command -v cargo >/dev/null 2>&1 && echo "✅ cargo: $$(cargo --version | head -1)"
	@command -v rustc >/dev/null 2>&1 && echo "✅ rustc: $$(rustc --version)"
	@echo "✅ All dependencies satisfied"

# ─────────────────────────────────────────────────────────────
# 前端构建
# ─────────────────────────────────────────────────────────────

frontend:
	@echo "📦 Building frontend..."
	@if [ ! -d node_modules ]; then npm install; fi
	@echo "  → TypeScript check..."
	@npx tsc --noEmit
	@echo "  → Vite build..."
	@npx vite build
	@echo "✅ Frontend: dist/"

# ─────────────────────────────────────────────────────────────
# Daemon 构建
# ─────────────────────────────────────────────────────────────

# 检测当前平台
UNAME_S := $(shell uname -s)
UNAME_M := $(shell uname -m)

daemon-local:
	@echo "🔧 Building daemon for $(UNAME_S) $(UNAME_M)..."
	cd daemon && cargo build --release
	@mkdir -p src-tauri/resources
	@if [ "$(UNAME_S)" = "Darwin" ]; then \
		cp daemon/target/release/clawpilot-daemon src-tauri/resources/clawpilot-daemon-macos; \
		echo "✅ Daemon: src-tauri/resources/clawpilot-daemon-macos"; \
	fi
	@if [ "$(UNAME_S)" = "Darwin" ] && [ ! -s src-tauri/resources/clawpilot-daemon-linux ]; then \
		printf '#!/bin/bash\necho "ERROR: Linux placeholder. Run make daemon CROSS=1"\nexit 1\n' > src-tauri/resources/clawpilot-daemon-linux; \
		chmod +x src-tauri/resources/clawpilot-daemon-linux; \
		echo "⚠️  Linux placeholder created"; \
	fi
	@if [ "$(UNAME_S)" = "Linux" ]; then \
		cp daemon/target/release/clawpilot-daemon src-tauri/resources/clawpilot-daemon-linux; \
		echo "✅ Daemon: src-tauri/resources/clawpilot-daemon-linux"; \
	fi

daemon-cross:
	@echo "🔧 Building daemon for multiple platforms..."
	@command -v cross >/dev/null 2>&1 || { \
		echo "⚠️  'cross' not found, install with: cargo install cross"; \
		exit 1; \
	}
	cd daemon && cross build --release --target aarch64-unknown-linux-gnu
	cd daemon && cross build --release --target x86_64-unknown-linux-gnu
	@mkdir -p src-tauri/resources
	@cp daemon/target/aarch64-unknown-linux-gnu/release/clawpilot-daemon \
		src-tauri/resources/clawpilot-daemon-linux-aarch64
	@cp daemon/target/x86_64-unknown-linux-gnu/release/clawpilot-daemon \
		src-tauri/resources/clawpilot-daemon-linux-x86_64
	@echo "✅ Daemon: src-tauri/resources/clawpilot-daemon-linux-*"

# macOS 多架构
daemon-macos-universal:
	@echo "🔧 Building daemon for macOS universal..."
	cd daemon && cargo build --release --target aarch64-apple-darwin
	cd daemon && cargo build --release --target x86_64-apple-darwin
	@mkdir -p src-tauri/resources
	@lipo create \
		daemon/target/aarch64-apple-darwin/release/clawpilot-daemon \
		daemon/target/x86_64-apple-darwin/release/clawpilot-daemon \
		-output src-tauri/resources/clawpilot-daemon-macos
	@echo "✅ Daemon: src-tauri/resources/clawpilot-daemon-macos (universal)"

# 根据是否启用交叉编译选择目标
daemon:
	@if [ "$(CROSS)" = "1" ]; then \
		$(MAKE) daemon-cross; \
	else \
		$(MAKE) daemon-local; \
	fi

# ─────────────────────────────────────────────────────────────
# Tauri 应用构建
# ─────────────────────────────────────────────────────────────

tauri-local: frontend daemon-local
	@echo "🖥️  Building Tauri application..."
	npm run tauri:build
	@if [ "$(UNAME_S)" = "Darwin" ]; then \
		echo "✅ Tauri: src-tauri/target/release/bundle/macos/ClawPilot.app"; \
		echo "✅ DMG: src-tauri/target/release/bundle/dmg/"; \
	elif [ "$(UNAME_S)" = "Linux" ]; then \
		echo "✅ Tauri: src-tauri/target/release/bundle/deb/"; \
		echo "✅ Tauri: src-tauri/target/release/bundle/appimage/"; \
	fi

tauri-cross: frontend daemon-cross
	@echo "🖥️  Building Tauri for multiple platforms..."
	@if [ "$(UNAME_S)" != "Darwin" ]; then \
		echo "❌ Tauri cross-compile only supported on macOS"; \
		exit 1; \
	fi
	npm run tauri build -- --target aarch64-apple-darwin
	npm run tauri build -- --target x86_64-apple-darwin
	@echo "✅ Tauri: macOS universal build complete"

tauri:
	@if [ "$(CROSS)" = "1" ]; then \
		$(MAKE) tauri-cross; \
	else \
		$(MAKE) tauri-local; \
	fi

# ─────────────────────────────────────────────────────────────
# Server 构建
# ─────────────────────────────────────────────────────────────

server:
	@echo "🌐 Server (Node.js) - no build step required"
	@if [ ! -d server/node_modules ]; then cd server && npm install; fi
	@echo "✅ Server ready: cd server && npm start"

# ─────────────────────────────────────────────────────────────
# 发布构建（完整）
# ─────────────────────────────────────────────────────────────

release: check
	@echo "🚀 Release build for all platforms..."
	$(MAKE) frontend
	$(MAKE) daemon-macos-universal
	$(MAKE) daemon-cross
	$(MAKE) tauri-cross
	@echo "✅ Release build complete!"
	@ls -la src-tauri/resources/
	@ls -la src-tauri/target/release/bundle/

# ─────────────────────────────────────────────────────────────
# 清理
# ─────────────────────────────────────────────────────────────

clean:
	@echo "🧹 Cleaning build artifacts..."
	rm -rf dist
	rm -rf node_modules/.vite
	rm -rf daemon/target
	rm -rf src-tauri/target
	rm -f src-tauri/resources/clawpilot-daemon-*
	# Keep install scripts (they are source files, not build artifacts)
	@echo "✅ Clean complete (install scripts preserved)"

clean-frontend:
	rm -rf dist node_modules/.vite

clean-daemon:
	rm -rf daemon/target
	rm -f src-tauri/resources/clawpilot-daemon-*
	# Keep install scripts

clean-tauri:
	rm -rf src-tauri/target

# ─────────────────────────────────────────────────────────────
# 开发辅助
# ─────────────────────────────────────────────────────────────

dev:
	@echo "Starting development servers..."
	bash scripts/dev.sh

test:
	npm run test

install-deps:
	@echo "Installing all dependencies..."
	npm install
	cd server && npm install
	cd daemon && cargo fetch
	@echo "✅ Dependencies installed"

# ─────────────────────────────────────────────────────────────
# 帮助
# ─────────────────────────────────────────────────────────────

help:
	@echo "ClawPilot Build System"
	@echo ""
	@echo "Targets:"
	@echo "  make              - 构建所有本地产物"
	@echo "  make all          - 同上"
	@echo "  make frontend     - 仅构建前端 (dist/)"
	@echo "  make daemon       - 仅构建 daemon"
	@echo "  make tauri        - 仅构建 Tauri 应用"
	@echo "  make server       - 检查 server 依赖"
	@echo "  make release      - 发布构建（多平台）"
	@echo "  make clean        - 清理构建产物"
	@echo "  make dev          - 启动开发服务器"
	@echo "  make test         - 运行测试"
	@echo "  make check        - 检查构建依赖"
	@echo ""
	@echo "Bundle contents (src-tauri/resources/):"
	@echo "  clawpilot-daemon-macos  - macOS daemon binary"
	@echo "  clawpilot-daemon-linux  - Linux daemon binary"
	@echo "  install-node-user-latest-v22.sh   - Node.js 安装脚本"
	@echo "  openclaw-install-*.sh            - OpenClaw 安装脚本"
	@echo ""
	@echo "Options:"
	@echo "  CROSS=1           - 启用交叉编译（需要 cross 工具）"
	@echo "  CLEAN=1           - 构建前先清理"
	@echo ""
	@echo "Examples:"
	@echo "  make                    # 本地构建"
	@echo "  make daemon CROSS=1     # 交叉编译 daemon"
	@echo "  make release            # 完整发布构建"
	@echo "  make clean && make      # 清理后重新构建"