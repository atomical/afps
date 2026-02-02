#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../client"
npm run perf:check
