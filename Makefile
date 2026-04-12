.PHONY: help \
	daemon-linux-x64 daemon-linux-arm64 daemon-macos-arm64 daemon-macos-x64 daemon-all \
	tauri-macos-arm64 tauri-macos-x64 tauri-linux-x64 tauri-linux-arm64 \
	build-all release clean

# ── Versions (read from Cargo.toml / tauri.conf.json) ────────────────────────
DAEMON_VERSION := $(shell grep '^version' daemon/Cargo.toml | head -1 | sed 's/.*"\(.*\)"/\1/')
APP_VERSION    := $(shell grep '"version"' src-tauri/tauri.conf.json | head -1 | sed 's/.*"\([0-9][^"]*\)".*/\1/')

# ── Paths ─────────────────────────────────────────────────────────────────────
DAEMON    := daemon
RESOURCES := src-tauri/resources
DIST      := dist-release
PROFILE   := release
FEATURES  := --features bundled-sqlite
GH_REPO   := hashibit/clawpilot-releases

help: ## 显示可用命令
	@grep -E '^[a-zA-Z_0-9-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-28s\033[0m %s\n", $$1, $$2}'

# ══════════════════════════════════════════════════════════════════════════════
# Daemon builds
# ══════════════════════════════════════════════════════════════════════════════

daemon-linux-x64: ## 编译 daemon: Linux x86_64
	cd $(DAEMON) && cargo build --profile $(PROFILE) --target x86_64-unknown-linux-gnu $(FEATURES)
	mkdir -p $(DIST)
	cp $(DAEMON)/target/x86_64-unknown-linux-gnu/$(PROFILE)/clawpilot-daemon \
	   $(DIST)/clawpilot-daemon-v$(DAEMON_VERSION)-linux-x64
	chmod +x $(DIST)/clawpilot-daemon-v$(DAEMON_VERSION)-linux-x64
	@# Also copy to resources for dev/bundling
	cp $(DIST)/clawpilot-daemon-v$(DAEMON_VERSION)-linux-x64 $(RESOURCES)/clawpilot-daemon-linux-x64
	chmod +x $(RESOURCES)/clawpilot-daemon-linux-x64

daemon-linux-arm64: ## 编译 daemon: Linux aarch64
	cd $(DAEMON) && cargo build --profile $(PROFILE) --target aarch64-unknown-linux-gnu $(FEATURES)
	mkdir -p $(DIST)
	cp $(DAEMON)/target/aarch64-unknown-linux-gnu/$(PROFILE)/clawpilot-daemon \
	   $(DIST)/clawpilot-daemon-v$(DAEMON_VERSION)-linux-arm64
	chmod +x $(DIST)/clawpilot-daemon-v$(DAEMON_VERSION)-linux-arm64
	cp $(DIST)/clawpilot-daemon-v$(DAEMON_VERSION)-linux-arm64 $(RESOURCES)/clawpilot-daemon-linux-arm64
	chmod +x $(RESOURCES)/clawpilot-daemon-linux-arm64

daemon-macos-arm64: ## 编译 daemon: macOS arm64
	cd $(DAEMON) && cargo build --profile $(PROFILE) --target aarch64-apple-darwin $(FEATURES)
	mkdir -p $(DIST)
	cp $(DAEMON)/target/aarch64-apple-darwin/$(PROFILE)/clawpilot-daemon \
	   $(DIST)/clawpilot-daemon-v$(DAEMON_VERSION)-macos-arm64
	chmod +x $(DIST)/clawpilot-daemon-v$(DAEMON_VERSION)-macos-arm64
	cp $(DIST)/clawpilot-daemon-v$(DAEMON_VERSION)-macos-arm64 $(RESOURCES)/clawpilot-daemon-macos-arm64
	chmod +x $(RESOURCES)/clawpilot-daemon-macos-arm64

daemon-macos-x64: ## 编译 daemon: macOS x86_64
	cd $(DAEMON) && cargo build --profile $(PROFILE) --target x86_64-apple-darwin $(FEATURES)
	mkdir -p $(DIST)
	cp $(DAEMON)/target/x86_64-apple-darwin/$(PROFILE)/clawpilot-daemon \
	   $(DIST)/clawpilot-daemon-v$(DAEMON_VERSION)-macos-x64
	chmod +x $(DIST)/clawpilot-daemon-v$(DAEMON_VERSION)-macos-x64
	cp $(DIST)/clawpilot-daemon-v$(DAEMON_VERSION)-macos-x64 $(RESOURCES)/clawpilot-daemon-macos-x64
	chmod +x $(RESOURCES)/clawpilot-daemon-macos-x64

daemon-all: daemon-linux-x64 daemon-linux-arm64 daemon-macos-arm64 daemon-macos-x64 ## 编译全部 daemon 目标

# ══════════════════════════════════════════════════════════════════════════════
# Tauri app builds (produces .dmg / .deb / .AppImage)
# ══════════════════════════════════════════════════════════════════════════════

tauri-macos-arm64: ## 构建 Tauri app: macOS arm64 (.dmg)
	npx tauri build --target aarch64-apple-darwin
	mkdir -p $(DIST)
	cp src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/*.dmg \
	   $(DIST)/clawpilot-v$(APP_VERSION)-macos-arm64.dmg

tauri-macos-x64: ## 构建 Tauri app: macOS x86_64 (.dmg)
	npx tauri build --target x86_64-apple-darwin
	mkdir -p $(DIST)
	cp src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/*.dmg \
	   $(DIST)/clawpilot-v$(APP_VERSION)-macos-x64.dmg

tauri-linux-x64: ## 构建 Tauri app: Linux x86_64 (.deb + .AppImage)
	npx tauri build --target x86_64-unknown-linux-gnu
	mkdir -p $(DIST)
	-cp src-tauri/target/x86_64-unknown-linux-gnu/release/bundle/deb/*.deb \
	   $(DIST)/clawpilot-v$(APP_VERSION)-linux-x64.deb
	-cp src-tauri/target/x86_64-unknown-linux-gnu/release/bundle/appimage/*.AppImage \
	   $(DIST)/clawpilot-v$(APP_VERSION)-linux-x64.AppImage

tauri-linux-arm64: ## 构建 Tauri app: Linux aarch64 (.deb + .AppImage)
	npx tauri build --target aarch64-unknown-linux-gnu
	mkdir -p $(DIST)
	-cp src-tauri/target/aarch64-unknown-linux-gnu/release/bundle/deb/*.deb \
	   $(DIST)/clawpilot-v$(APP_VERSION)-linux-arm64.deb
	-cp src-tauri/target/aarch64-unknown-linux-gnu/release/bundle/appimage/*.AppImage \
	   $(DIST)/clawpilot-v$(APP_VERSION)-linux-arm64.AppImage

# ══════════════════════════════════════════════════════════════════════════════
# Aggregate & Publish
# ══════════════════════════════════════════════════════════════════════════════

build-all: daemon-all ## 编译所有 daemon 目标 (Tauri 需在对应平台单独构建)
	@echo "✅ All daemon binaries built in $(DIST)/"
	@ls -lh $(DIST)/

release: ## 发布到 GitHub Releases (用法: make release [TAG=v0.1.0])
	$(eval TAG := $(or $(TAG),v$(APP_VERSION)))
	@echo "📦 Publishing release $(TAG) to $(GH_REPO)..."
	@test -d $(DIST) || (echo "❌ $(DIST)/ not found. Run 'make build-all' first." && exit 1)
	@ls $(DIST)/ | grep -q . || (echo "❌ $(DIST)/ is empty. Run 'make build-all' first." && exit 1)
	gh release create $(TAG) \
		--repo $(GH_REPO) \
		--title "ClawPilot $(TAG)" \
		--generate-notes \
		$(DIST)/*
	@echo "✅ Published: https://github.com/$(GH_REPO)/releases/tag/$(TAG)"

clean: ## 清理构建产物
	rm -rf $(DIST)
	rm -f $(RESOURCES)/clawpilot-daemon-*
