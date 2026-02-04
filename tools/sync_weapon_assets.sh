#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SOURCE_GLTF="${ROOT_DIR}/assets/weapons/cc0/kenney_blaster_kit/Models/GLB format/bullet-foam.glb"
DEST_DIR="${ROOT_DIR}/client/public/assets/weapons/cc0/kenney_blaster_kit"
DEST_GLTF="${DEST_DIR}/bullet-foam.glb"

if [[ ! -f "${SOURCE_GLTF}" ]]; then
  echo "Missing source casing model: ${SOURCE_GLTF}" >&2
  exit 1
fi

mkdir -p "${DEST_DIR}"

if [[ -f "${DEST_GLTF}" ]] && cmp -s "${SOURCE_GLTF}" "${DEST_GLTF}"; then
  exit 0
fi

cp "${SOURCE_GLTF}" "${DEST_GLTF}"
