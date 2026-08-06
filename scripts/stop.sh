#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"

kill_tree() {
  local pid="$1"
  if command -v pgrep >/dev/null 2>&1; then
    for child_pid in $(pgrep -P "$pid" || true); do
      kill_tree "$child_pid"
    done
  fi
  kill "$pid" >/dev/null 2>&1 || true
}

stop_process() {
  local name="$1"
  local pid_file="$RUN_DIR/$name.pid"

  if [ ! -f "$pid_file" ]; then
    echo "$name not running"
    return
  fi

  local pid
  pid="$(cat "$pid_file")"
  if kill -0 "$pid" >/dev/null 2>&1; then
    kill_tree "$pid"
    for _ in 1 2 3 4 5; do
      if ! kill -0 "$pid" >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill -TERM "$pid" >/dev/null 2>&1 || true
    fi
    echo "stopped $name: pid $pid"
  else
    echo "$name was not running: pid $pid"
  fi

  rm -f "$pid_file"
}

stop_process frontend
stop_process livekit-agent
stop_process backend-api

if command -v pgrep >/dev/null 2>&1; then
  for stale_pid in $(pgrep -f "backend/agent.py dev|backend/agent.py start" || true); do
    kill "$stale_pid" >/dev/null 2>&1 || true
    echo "stopped stale livekit-agent: pid $stale_pid"
  done
fi

echo "Application stopped."
