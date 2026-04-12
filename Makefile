.PHONY: help build-linux-x64 build-linux-arm64 build-macos-arm64 build-linux-all clean

DAEMON    := daemon
RESOURCES := src-tauri/resources
PROFILE   := release
FEATURES  := --features bundled-sqlite

help: ## 显示可用命令
	@grep -E '^[a-zA-Z_0-9-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-24s\033[0m %s\n", $$1, $$2}'

build-linux-x64: ## 交叉编译 Linux x86_64
	cd $(DAEMON) && cargo build --profile $(PROFILE) --target x86_64-unknown-linux-gnu $(FEATURES)
	cp $(DAEMON)/target/x86_64-unknown-linux-gnu/$(PROFILE)/clawpilot-daemon \
	   $(RESOURCES)/clawpilot-daemon-linux-x64
	chmod +x $(RESOURCES)/clawpilot-daemon-linux-x64

build-linux-arm64: ## 交叉编译 Linux aarch64
	cd $(DAEMON) && cargo build --profile $(PROFILE) --target aarch64-unknown-linux-gnu $(FEATURES)
	cp $(DAEMON)/target/aarch64-unknown-linux-gnu/$(PROFILE)/clawpilot-daemon \
	   $(RESOURCES)/clawpilot-daemon-linux-arm64
	chmod +x $(RESOURCES)/clawpilot-daemon-linux-arm64

build-macos-arm64: ## 编译 macOS arm64 并放入 resources
	cd $(DAEMON) && cargo build --profile $(PROFILE) --target aarch64-apple-darwin $(FEATURES)
	cp $(DAEMON)/target/aarch64-apple-darwin/$(PROFILE)/clawpilot-daemon \
	   $(RESOURCES)/clawpilot-daemon-macos-arm64
	chmod +x $(RESOURCES)/clawpilot-daemon-macos-arm64

build-linux-all: build-linux-x64 build-linux-arm64 ## 交叉编译 Linux x64 + arm64

clean: ## 清理 resources 中的 daemon binary
	rm -f $(RESOURCES)/clawpilot-daemon-*
