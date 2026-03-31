#!/bin/bash
# dev.sh - Start all ClawPilot services with logging

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

mkdir -p logs

# Unset proxy env vars (for Node.js services, not for Claude)
unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY no_proxy NO_PROXY

# Kill existing processes on ports
echo "Cleaning up existing processes..."
npm run stop --silent 2>/dev/null || true

# Clear old logs
> logs/vite.log 2>/dev/null || true
> logs/server.log 2>/dev/null || true
> logs/daemon.log 2>/dev/null || true

echo "Starting ClawPilot services..."
echo "Logs will be written to logs/ directory"
echo ""

# Start vite
# Kill all children on exit/Ctrl+C
trap 'echo ""; echo "Stopping services..."; kill $(jobs -p) 2>/dev/null; exit 0' INT TERM EXIT

echo "Starting Vite..."
npx vite > logs/vite.log 2>&1 &
VITE_PID=$!
echo "  Vite started (PID: $VITE_PID) -> logs/vite.log"

# Start server
echo "Starting Server..."
(cd "$SCRIPT_DIR/server" && node --watch index.js) > "$SCRIPT_DIR/logs/server.log" 2>&1 &
SERVER_PID=$!
echo "  Server started (PID: $SERVER_PID) -> logs/server.log"

# Start daemon
echo "Starting Daemon..."
cd "$SCRIPT_DIR/daemon"
cargo watch -x 'run -- --listen 127.0.0.1:16668' > ../logs/daemon.log 2>&1 &
DAEMON_PID=$!
cd "$SCRIPT_DIR"
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
if curl -s -o /dev/null http://localhost:16666/; then
    echo "✓ Vite      - http://localhost:16666"
else
    echo "✗ Vite      - Failed to start"
fi

# Check Server
if curl -s -o /dev/null http://127.0.0.1:16667/api/process/status 2>/dev/null; then
    echo "✓ Server    - http://127.0.0.1:16667"
else
    echo "✓ Server    - http://127.0.0.1:16667 (starting...)"
fi

# Check Daemon
if curl -s -o /dev/null http://127.0.0.1:16668/health; then
    echo "✓ Daemon    - http://127.0.0.1:16668"
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

# Save PIDs
echo "$VITE_PID" > .dev-pids
echo "$SERVER_PID" >> .dev-pids
echo "$DAEMON_PID" >> .dev-pids

# Keep script running
wait
