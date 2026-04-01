#!/bin/bash
# dev.sh - Start all ClawPilot services with logging
# Usage: bash dev.sh [--start-port N]   (default: 16666)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# ── Parse --start-port ─────────────────────────────────────
START_PORT=16666
while [[ $# -gt 0 ]]; do
  case "$1" in
    --start-port) START_PORT="$2"; shift 2 ;;
    *) shift ;;
  esac
done

VITE_PORT=$START_PORT
SERVER_PORT=$((START_PORT + 1))
DAEMON_PORT=$((START_PORT + 2))

mkdir -p logs

# Unset proxy env vars (for Node.js services, not for Claude)
unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY no_proxy NO_PROXY

# Kill existing processes on ports
echo "Cleaning up existing processes..."
lsof -ti:"$VITE_PORT","$SERVER_PORT","$DAEMON_PORT" | xargs kill -9 2>/dev/null || true

# Clear old logs
> logs/vite.log 2>/dev/null || true
> logs/server.log 2>/dev/null || true
> logs/daemon.log 2>/dev/null || true

echo "Starting ClawPilot services..."
echo "  Ports: vite=$VITE_PORT  server=$SERVER_PORT  daemon=$DAEMON_PORT"
echo "Logs will be written to logs/ directory"
echo ""

# Kill all children on exit/Ctrl+C
trap 'echo ""; echo "Stopping services..."; kill $(jobs -p) 2>/dev/null; exit 0' INT TERM EXIT

# Start vite (inject server port so frontend knows where to call)
echo "Starting Vite..."
VITE_SERVER_PORT=$SERVER_PORT npx vite --port "$VITE_PORT" > logs/vite.log 2>&1 &
VITE_PID=$!
echo "  Vite started (PID: $VITE_PID) -> logs/vite.log"

# Start server
echo "Starting Server..."
(cd "$ROOT_DIR/server" && PORT=$SERVER_PORT node --watch index.js) > "$ROOT_DIR/logs/server.log" 2>&1 &
SERVER_PID=$!
echo "  Server started (PID: $SERVER_PID) -> logs/server.log"

# Start daemon
echo "Starting Daemon..."
cd "$ROOT_DIR/daemon"
cargo watch -x "run -- --listen 127.0.0.1:$DAEMON_PORT" > "$ROOT_DIR/logs/daemon.log" 2>&1 &
DAEMON_PID=$!
cd "$ROOT_DIR"
echo "  Daemon started (PID: $DAEMON_PID) -> logs/daemon.log"

echo ""
echo "Waiting for services to start..."
sleep 8

echo ""
echo "=========================================="
echo "Service Status"
echo "=========================================="
echo ""

# Check Vite
if curl -s -o /dev/null "http://localhost:$VITE_PORT/"; then
    echo "✓ Vite      - http://localhost:$VITE_PORT"
else
    echo "✗ Vite      - Failed to start"
fi

# Check Server
if curl -s -o /dev/null "http://127.0.0.1:$SERVER_PORT/api/process/status" 2>/dev/null; then
    echo "✓ Server    - http://127.0.0.1:$SERVER_PORT"
else
    echo "✓ Server    - http://127.0.0.1:$SERVER_PORT (starting...)"
fi

# Check Daemon
if curl -s -o /dev/null "http://127.0.0.1:$DAEMON_PORT/health"; then
    echo "✓ Daemon    - http://127.0.0.1:$DAEMON_PORT"
else
    echo "✗ Daemon    - Failed to start"
fi

echo ""
echo "=========================================="
echo ""

# Check for errors in logs
# Filter real errors: exclude cargo code-snippet lines (e.g. "  42 | pub fn foo()")
ERROR_LINES=$(grep -n "ERROR\|error\|Error\|panicked" logs/*.log 2>/dev/null \
    | grep -v ':[[:space:]]*[0-9]\+[[:space:]]*|' \
    || true)
if [ -z "$ERROR_LINES" ]; then
    echo "✓ No errors found in logs"
else
    ERROR_COUNT=$(echo "$ERROR_LINES" | grep -c .)
    echo "⚠ Found $ERROR_COUNT error(s) in logs:"
    echo "$ERROR_LINES" | sed 's/^/  /'
fi

echo ""
echo "Commands:"
echo "  tail -f logs/*.log    # View live logs"
echo "  npm run stop          # Stop all services"
echo ""

# Save PIDs and ports (used by stop script)
echo "$VITE_PID" > .dev-pids
echo "$SERVER_PID" >> .dev-pids
echo "$DAEMON_PID" >> .dev-pids
echo "$VITE_PORT $SERVER_PORT $DAEMON_PORT" > .dev-ports

# Keep script running
wait
