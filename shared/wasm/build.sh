#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")" && pwd)
OUT_DIR="$ROOT_DIR/dist"
mkdir -p "$OUT_DIR"

em++ -std=c++17 -O3 \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -s ENVIRONMENT=web,worker,node \
  -s EXPORTED_FUNCTIONS=_sim_create,_sim_destroy,_sim_reset,_sim_set_config,_sim_set_state,_sim_step,_sim_get_x,_sim_get_y,_sim_get_z,_sim_get_vx,_sim_get_vy,_sim_get_vz,_sim_get_dash_cooldown \
  -I "$ROOT_DIR/.." \
  "$ROOT_DIR/sim_wasm.cpp" \
  -o "$OUT_DIR/afps_sim.js"
