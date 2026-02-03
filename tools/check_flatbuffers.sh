#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$root_dir/tools/generate_flatbuffers.sh"

if ! git -C "$root_dir" diff --quiet -- shared/schema/generated client/src/net/fbs; then
  echo "FlatBuffers bindings are out of date. Re-run tools/generate_flatbuffers.sh." >&2
  git -C "$root_dir" diff -- shared/schema/generated client/src/net/fbs
  exit 1
fi
