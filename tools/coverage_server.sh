#!/usr/bin/env bash
set -euo pipefail

if ! command -v gcovr >/dev/null 2>&1; then
  echo "gcovr not found. Install with: pipx install gcovr (or pip install --user gcovr)" >&2
  exit 1
fi

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
build_dir="$root_dir/server/build-coverage"
out_dir="$root_dir/server/coverage"

cmake -S "$root_dir/server" -B "$build_dir" \
  -DCMAKE_BUILD_TYPE=Debug \
  -DCMAKE_CXX_FLAGS="--coverage" \
  -DCMAKE_EXE_LINKER_FLAGS="--coverage"

cmake --build "$build_dir"
ctest --test-dir "$build_dir" --output-on-failure

mkdir -p "$out_dir"

# Generate HTML report + summary

gcovr -r "$root_dir/server" \
  --exclude "$root_dir/server/third_party/.*" \
  --exclude "$build_dir/.*" \
  --exclude "$root_dir/server/src/main.cpp" \
  --exclude "$root_dir/server/src/tick.cpp" \
  --print-summary \
  --fail-under-line 100 \
  --fail-under-branch 90 \
  --html-details "$out_dir/index.html"
