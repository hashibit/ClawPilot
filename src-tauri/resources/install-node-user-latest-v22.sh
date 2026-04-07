#!/bin/bash
# Install latest Node.js v22 LTS to ~/.local (no sudo required)
# Usage: bash install-node-user.sh
set -euo pipefail

ARCH=$(uname -m)
case "$ARCH" in
  x86_64|amd64)   NODE_ARCH="x64"   ;;
  aarch64|arm64)  NODE_ARCH="arm64" ;;
  *)
    echo "Unsupported arch: $ARCH" >&2
    exit 1
    ;;
esac

NODE_ARCHIVE=$(curl -fsSL https://nodejs.org/dist/latest-v22.x/ \
  | grep -oE "node-v22\.[0-9]+\.[0-9]+-linux-${NODE_ARCH}\.tar\.gz" \
  | head -1)

if [[ -z "$NODE_ARCHIVE" ]]; then
  echo "Failed to detect latest Node.js v22 version" >&2
  exit 1
fi

NODE_VERSION=${NODE_ARCHIVE#node-v}
NODE_VERSION=${NODE_VERSION%-linux-*}

echo "Installing Node.js v${NODE_VERSION} (${NODE_ARCH}) to ~/.local ..."
mkdir -p "$HOME/.local"
curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_ARCHIVE}" \
  | tar -xz -C "$HOME/.local" --strip-components=1

echo "Node.js installed: $(~/.local/bin/node --version)"
