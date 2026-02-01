#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
build_dir="$root_dir/server/build-sanitize"

if [ ! -d "$build_dir" ]; then
  echo "Sanitizer build not found. Run ./tools/build_server_sanitizers.sh first." >&2
  exit 1
fi

ASAN_OPTIONS=detect_leaks=1 \
UBSAN_OPTIONS=print_stacktrace=1 \
ctest --test-dir "$build_dir" --output-on-failure
