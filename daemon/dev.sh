#!/bin/bash
cd "$(dirname "$0")"
cargo watch -x "run -- --listen 127.0.0.1:16668"
