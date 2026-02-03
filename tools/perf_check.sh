#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "$0")/.." && pwd)"
client_dir="$root_dir/client"

cd "$client_dir"
npm run perf:check
npm run build
node "$root_dir/tools/check_bundle_size.mjs"
