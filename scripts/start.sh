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

env_has_value() {
  local key="$1"
  "$PYTHON_BIN" - "$ROOT_DIR/.env" "$ROOT_DIR/backend/.env" "$key" <<'PY'
import sys
from pathlib import Path

for filename in sys.argv[1:3]:
    path = Path(filename)
    if not path.exists():
        continue
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        if key.strip() == sys.argv[3] and value.strip().strip('"\''):
            sys.exit(0)
sys.exit(1)
PY
}

missing_keys=()
for key in LIVEKIT_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET OPENAI_API_KEY; do
  if ! env_has_value "$key"; then
    missing_keys+=("$key")
  fi
done

if [ "${#missing_keys[@]}" -gt 0 ]; then
  echo "Missing required environment values: ${missing_keys[*]}"
  echo "Add them to .env or backend/.env, then run scripts/start.sh again."
  exit 1
fi

ensure_python_env() {
  if [ ! -x "$ROOT_DIR/.venv/bin/python" ]; then
    "$PYTHON_BIN" -m venv "$ROOT_DIR/.venv"
  fi

  local requirements_hash
  requirements_hash="$(cksum "$ROOT_DIR/backend/requirements.txt")"
  if [ ! -f "$RUN_DIR/backend-deps-installed" ] || [ "$(cat "$RUN_DIR/backend-deps-installed")" != "$requirements_hash" ]; then
    "$ROOT_DIR/.venv/bin/python" -m pip install -r "$ROOT_DIR/backend/requirements.txt" >"$LOG_DIR/pip-install.log" 2>&1
    printf '%s' "$requirements_hash" >"$RUN_DIR/backend-deps-installed"
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
