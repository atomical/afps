#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
WASM_DIR="$ROOT_DIR/shared/wasm"
OUT_DIR="$WASM_DIR/dist"
PUBLIC_DIR="$ROOT_DIR/client/public/wasm"

"$WASM_DIR/build.sh"

mkdir -p "$PUBLIC_DIR"
cp "$OUT_DIR/afps_sim.js" "$PUBLIC_DIR/afps_sim.js"
cp "$OUT_DIR/afps_sim.wasm" "$PUBLIC_DIR/afps_sim.wasm"
