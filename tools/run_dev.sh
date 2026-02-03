#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLIENT_DIR="${CLIENT_DIR:-${ROOT_DIR}/client}"
SERVER_SCRIPT="${SERVER_SCRIPT:-${ROOT_DIR}/tools/run_server.sh}"

: "${VITE_SIGNALING_URL:=http://localhost:8443}"
: "${VITE_SIGNALING_AUTH_TOKEN:=devtoken}"
: "${VITE_DEBUG_LOCAL_AVATAR:=true}"

"${SERVER_SCRIPT}" &
SERVER_PID=$!

cleanup() {
  if kill -0 "${SERVER_PID}" 2>/dev/null; then
    kill "${SERVER_PID}" || true
  fi
}

trap cleanup EXIT INT TERM

sleep 0.5

cd "${CLIENT_DIR}"
VITE_SIGNALING_URL="${VITE_SIGNALING_URL}" \
VITE_SIGNALING_AUTH_TOKEN="${VITE_SIGNALING_AUTH_TOKEN}" \
VITE_DEBUG_LOCAL_AVATAR="${VITE_DEBUG_LOCAL_AVATAR}" \
  npm run dev
