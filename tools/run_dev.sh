#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLIENT_DIR="${CLIENT_DIR:-${ROOT_DIR}/client}"
SERVER_SCRIPT="${SERVER_SCRIPT:-${ROOT_DIR}/tools/run_server.sh}"

: "${VITE_SIGNALING_URL:=http://localhost:8443}"
: "${VITE_SIGNALING_AUTH_TOKEN:=devtoken}"
: "${VITE_DEBUG_LOCAL_AVATAR:=true}"
: "${VITE_PROCEDURAL_MAP:=true}"
: "${VITE_PROCEDURAL_GENERATOR:=legacy}"
: "${VITE_MAP_SEED:=0}"
: "${VITE_MAP_MANIFEST_URL:=/assets/environments/cc0/kenney_city_kit_suburban_20/map.json}"
: "${SERVER_MAP_SEED:=${VITE_MAP_SEED}}"
: "${SERVER_MAP_MODE:=legacy}"
: "${SERVER_MAP_MANIFEST:=${ROOT_DIR}/client/public/assets/environments/cc0/kenney_city_kit_suburban_20/map.json}"
: "${ADVANCED_MAP_MANIFEST_PATH:=${ROOT_DIR}/client/public/assets/environments/generated/advanced_map.json}"
: "${AFPS_WORLD_HIT_BACKEND:=mesh_only}"

STATIC_DEFAULT_MANIFEST="${ROOT_DIR}/client/public/assets/environments/cc0/kenney_city_kit_suburban_20/map.json"
USE_ADVANCED_MANIFEST=false

usage() {
  cat <<'EOF'
Usage: ./tools/run_dev.sh [options]

Options:
  --procedural           Enable procedural client map generation.
  --static               Use static client map manifest.
  --advanced-generator   Generate advanced suburban manifest and run static parity mode.
  --legacy-generator     Use legacy procedural generator.
  --map-seed <n>         Set both client and server map seed.
  --server-map-seed <n>  Set only server map seed.
  --server-map-mode <m>  Set server map mode (`legacy` or `static`).
  --server-map-manifest <path>  Static map manifest path for server static mode.
  --world-hit-backend <m>  Server world-hit backend (`mesh_only`, `hybrid`, `aabb`).
  -h, --help             Show this help text.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --procedural)
      USE_ADVANCED_MANIFEST=false
      VITE_PROCEDURAL_MAP=true
      VITE_PROCEDURAL_GENERATOR=legacy
      VITE_MAP_MANIFEST_URL=/assets/environments/cc0/kenney_city_kit_suburban_20/map.json
      SERVER_MAP_MODE=legacy
      ;;
    --static)
      USE_ADVANCED_MANIFEST=false
      VITE_PROCEDURAL_MAP=false
      VITE_PROCEDURAL_GENERATOR=legacy
      VITE_MAP_MANIFEST_URL=/assets/environments/cc0/kenney_city_kit_suburban_20/map.json
      SERVER_MAP_MODE=static
      SERVER_MAP_MANIFEST="${STATIC_DEFAULT_MANIFEST}"
      ;;
    --advanced-generator)
      USE_ADVANCED_MANIFEST=true
      VITE_PROCEDURAL_MAP=false
      VITE_PROCEDURAL_GENERATOR=advanced
      VITE_MAP_MANIFEST_URL=/assets/environments/generated/advanced_map.json
      SERVER_MAP_MODE=static
      SERVER_MAP_MANIFEST="${ADVANCED_MAP_MANIFEST_PATH}"
      ;;
    --legacy-generator)
      USE_ADVANCED_MANIFEST=false
      VITE_PROCEDURAL_MAP=true
      VITE_PROCEDURAL_GENERATOR=legacy
      VITE_MAP_MANIFEST_URL=/assets/environments/cc0/kenney_city_kit_suburban_20/map.json
      SERVER_MAP_MODE=legacy
      SERVER_MAP_MANIFEST="${STATIC_DEFAULT_MANIFEST}"
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
    --server-map-mode)
      shift
      if [[ $# -eq 0 ]]; then
        echo "error: --server-map-mode requires a value" >&2
        usage
        exit 2
      fi
      SERVER_MAP_MODE="$1"
      ;;
    --server-map-manifest)
      shift
      if [[ $# -eq 0 ]]; then
        echo "error: --server-map-manifest requires a value" >&2
        usage
        exit 2
      fi
      SERVER_MAP_MANIFEST="$1"
      ;;
    --world-hit-backend)
      shift
      if [[ $# -eq 0 ]]; then
        echo "error: --world-hit-backend requires a value" >&2
        usage
        exit 2
      fi
      AFPS_WORLD_HIT_BACKEND="$1"
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

if [[ "${USE_ADVANCED_MANIFEST}" == "true" ]]; then
  node "${ROOT_DIR}/tools/generate_advanced_map_manifest.mjs" \
    --seed "${VITE_MAP_SEED}" \
    --out "${SERVER_MAP_MANIFEST}"
fi

server_args=(--map-seed "${SERVER_MAP_SEED}" --map-mode "${SERVER_MAP_MODE}")
if [[ "${SERVER_MAP_MODE}" == "static" ]]; then
  server_args+=(--map-manifest "${SERVER_MAP_MANIFEST}")
fi
AFPS_WORLD_HIT_BACKEND="${AFPS_WORLD_HIT_BACKEND}" "${SERVER_SCRIPT}" "${server_args[@]}" &
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
VITE_PROCEDURAL_GENERATOR="${VITE_PROCEDURAL_GENERATOR}" \
VITE_MAP_SEED="${VITE_MAP_SEED}" \
VITE_MAP_MANIFEST_URL="${VITE_MAP_MANIFEST_URL}" \
  npm run dev
