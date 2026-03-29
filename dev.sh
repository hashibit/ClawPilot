#!/bin/bash
# dev.sh - Start all ClawPilot services with logging

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

mkdir -p logs

# Kill existing processes on ports
echo "Cleaning up existing processes..."
lsof -ti:16666,16667,16668 | xargs kill -9 2>/dev/null || true

# Clear old logs
> logs/vite.log 2>/dev/null || true
> logs/server.log 2>/dev/null || true
> logs/daemon.log 2>/dev/null || true

echo "Starting ClawPilot services..."
echo "Logs will be written to logs/ directory"
echo ""

# Start vite
echo "Starting Vite..."
npx vite > logs/vite.log 2>&1 &
VITE_PID=$!
echo "  Vite started (PID: $VITE_PID) -> logs/vite.log"

# Start server
echo "Starting Server..."
cd "$SCRIPT_DIR/server"
node --watch index.js > ../logs/server.log 2>&1 &
SERVER_PID=$!
cd "$SCRIPT_DIR"
echo "  Server started (PID: $SERVER_PID) -> logs/server.log"

# Start daemon
echo "Starting Daemon..."
cd "$SCRIPT_DIR/daemon"
if [ ! -f ./target/debug/clawpilot-daemon ]; then
    echo "  Building daemon..."
    cargo build
fi
./target/debug/clawpilot-daemon --listen 127.0.0.1:16668 > ../logs/daemon.log 2>&1 &
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
ERROR_COUNT=$(grep -c "ERROR\|error\|Error\|panicked" logs/*.log 2>/dev/null || echo "0")
if [ "$ERROR_COUNT" -eq 0 ]; then
    echo "✓ No errors found in logs"
else
    echo "⚠ Found $ERROR_COUNT error(s) in logs"
    echo "  Run: grep -E 'ERROR|error|Error|panicked' logs/*.log"
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
