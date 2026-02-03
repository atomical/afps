#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
schema="$root_dir/shared/schema/afps_protocol.fbs"
out_cpp="$root_dir/shared/schema/generated/cpp"
out_ts="$root_dir/client/src/net/fbs"

if ! command -v flatc >/dev/null 2>&1; then
  echo "flatc not found. Install FlatBuffers to generate bindings." >&2
  exit 1
fi

mkdir -p "$out_cpp" "$out_ts"

flatc --cpp --scoped-enums --gen-object-api -o "$out_cpp" "$schema"
flatc --ts --gen-object-api -o "$out_ts" "$schema"
