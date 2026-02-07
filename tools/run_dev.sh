#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLIENT_DIR="${CLIENT_DIR:-${ROOT_DIR}/client}"
SERVER_SCRIPT="${SERVER_SCRIPT:-${ROOT_DIR}/tools/run_server.sh}"

: "${VITE_SIGNALING_URL:=http://localhost:8443}"
: "${VITE_SIGNALING_AUTH_TOKEN:=devtoken}"
: "${VITE_DEBUG_LOCAL_AVATAR:=true}"
: "${VITE_PROCEDURAL_MAP:=true}"
: "${VITE_MAP_SEED:=0}"
: "${SERVER_MAP_SEED:=${VITE_MAP_SEED}}"

usage() {
  cat <<'EOF'
Usage: ./tools/run_dev.sh [options]

Options:
  --procedural           Enable procedural client map generation.
  --static               Use static client map manifest.
  --map-seed <n>         Set both client and server map seed.
  --server-map-seed <n>  Set only server map seed.
  -h, --help             Show this help text.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --procedural)
      VITE_PROCEDURAL_MAP=true
      ;;
    --static)
      VITE_PROCEDURAL_MAP=false
      ;;
    --map-seed)
      shift
      if [[ $# -eq 0 ]]; then
        echo "error: --map-seed requires a value" >&2
        usage
        exit 2
      fi
      VITE_MAP_SEED="$1"
      SERVER_MAP_SEED="$1"
      ;;
    --server-map-seed)
      shift
      if [[ $# -eq 0 ]]; then
        echo "error: --server-map-seed requires a value" >&2
        usage
        exit 2
      fi
      SERVER_MAP_SEED="$1"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown option '$1'" >&2
      usage
      exit 2
      ;;
  esac
  shift
done

"${SERVER_SCRIPT}" --map-seed "${SERVER_MAP_SEED}" &
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
VITE_PROCEDURAL_MAP="${VITE_PROCEDURAL_MAP}" \
VITE_MAP_SEED="${VITE_MAP_SEED}" \
  npm run dev
