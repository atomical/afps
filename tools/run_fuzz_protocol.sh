#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
build_dir="$root_dir/server/build-fuzz"
max_time="${1:-30}"

cmake -S "$root_dir/server" -B "$build_dir" -DAFPS_ENABLE_FUZZ=ON -DCMAKE_CXX_COMPILER=clang++ -DCMAKE_C_COMPILER=clang
cmake --build "$build_dir" --target afps_fuzz_protocol

"$build_dir/afps_fuzz_protocol" -max_total_time="${max_time}"
