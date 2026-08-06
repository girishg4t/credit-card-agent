#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"

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
    if command -v pgrep >/dev/null 2>&1; then
      for child_pid in $(pgrep -P "$pid" || true); do
        kill "$child_pid" >/dev/null 2>&1 || true
      done
    fi
    kill "$pid"
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

echo "Application stopped."
