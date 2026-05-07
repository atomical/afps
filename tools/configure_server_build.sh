#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: $0 <server_dir> <build_dir>" >&2
  exit 2
fi

SERVER_DIR="$1"
BUILD_DIR="$2"

configure() {
  cmake -S "${SERVER_DIR}" -B "${BUILD_DIR}"
}

if configure; then
  exit 0
fi

if [[ -d "${BUILD_DIR}" ]]; then
  echo "Initial CMake configure failed; removing stale build directory and retrying once" >&2
  rm -rf "${BUILD_DIR}"
fi

configure
