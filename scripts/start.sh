#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"
LOG_DIR="$RUN_DIR/logs"
PYTHON_BIN="${PYTHON_BIN:-python3}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

mkdir -p "$LOG_DIR"

if [ ! -f "$ROOT_DIR/.env" ] && [ ! -f "$ROOT_DIR/backend/.env" ]; then
  echo "Missing .env. Add LiveKit/OpenAI values to .env or backend/.env first."
  exit 1
fi

ensure_python_env() {
  if [ ! -x "$ROOT_DIR/.venv/bin/python" ]; then
    "$PYTHON_BIN" -m venv "$ROOT_DIR/.venv"
  fi

  if [ ! -f "$RUN_DIR/backend-deps-installed" ]; then
    "$ROOT_DIR/.venv/bin/python" -m pip install -r "$ROOT_DIR/backend/requirements.txt" >"$LOG_DIR/pip-install.log" 2>&1
    touch "$RUN_DIR/backend-deps-installed"
  fi

  local cert_file
  cert_file="$($ROOT_DIR/.venv/bin/python -c 'import certifi; print(certifi.where())' 2>/dev/null || true)"
  if [ -n "$cert_file" ]; then
    export SSL_CERT_FILE="$cert_file"
    export REQUESTS_CA_BUNDLE="$cert_file"
  fi
}

ensure_frontend_env() {
  if [ ! -d "$ROOT_DIR/frontend/node_modules" ]; then
    (cd "$ROOT_DIR/frontend" && npm install) >"$LOG_DIR/npm-install.log" 2>&1
  fi
}

is_running() {
  local pid_file="$1"
  [ -f "$pid_file" ] && kill -0 "$(cat "$pid_file")" >/dev/null 2>&1
}

start_process() {
  local name="$1"
  local pid_file="$RUN_DIR/$name.pid"
  local log_file="$LOG_DIR/$name.log"
  shift

  if is_running "$pid_file"; then
    echo "$name already running: pid $(cat "$pid_file")"
    return
  fi

  : >"$log_file"
  (cd "$ROOT_DIR" && exec "$@") >"$log_file" 2>&1 &
  echo $! >"$pid_file"
  echo "started $name: pid $(cat "$pid_file"), log $log_file"
}

ensure_python_env
ensure_frontend_env

start_process backend-api \
  "$ROOT_DIR/.venv/bin/python" -m uvicorn backend.main:app --host 0.0.0.0 --port "$BACKEND_PORT"

start_process livekit-agent \
  "$ROOT_DIR/.venv/bin/python" backend/agent.py start

start_process frontend \
  npm --prefix "$ROOT_DIR/frontend" run dev -- --host 0.0.0.0 --port "$FRONTEND_PORT"

echo ""
echo "Application started."
echo "Frontend: http://localhost:$FRONTEND_PORT"
echo "Backend health: http://localhost:$BACKEND_PORT/api/health"
echo "Logs: $LOG_DIR"
echo "Stop with: scripts/stop.sh"
