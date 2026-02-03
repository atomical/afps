#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
build_dir="${1:-$root_dir/server/build}"

if ! command -v mull-runner >/dev/null 2>&1; then
  echo "mull-runner not found. Install Mull to run C++ mutation tests." >&2
  exit 1
fi

if [ ! -f "$build_dir/afps_server_tests" ]; then
  echo "Server tests binary not found at $build_dir/afps_server_tests" >&2
  exit 1
fi

mull-runner \
  --test-command "$build_dir/afps_server_tests" \
  --test-working-dir "$build_dir" \
  --reporters Progress \
  --mutation-score-threshold 60
