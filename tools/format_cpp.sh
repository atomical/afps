#!/usr/bin/env bash
set -euo pipefail

if ! command -v clang-format >/dev/null 2>&1; then
  echo "clang-format not found" >&2
  exit 1
fi

mapfile -t files < <(
  rg --files -g '*.h' -g '*.cpp' server shared \
    -g '!server/third_party/**' \
    -g '!server/build/**' \
    -g '!shared/wasm/dist/**'
)

if [ ${#files[@]} -eq 0 ]; then
  exit 0
fi

clang-format -i "${files[@]}"
