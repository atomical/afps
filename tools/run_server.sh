#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_DIR="${ROOT_DIR}/server"
BUILD_DIR="${SERVER_BUILD_DIR:-${SERVER_DIR}/build}"
CERT_DIR="${SERVER_DIR}/certs"
CERT_PATH="${SERVER_CERT_PATH:-${CERT_DIR}/cert.pem}"
KEY_PATH="${SERVER_KEY_PATH:-${CERT_DIR}/key.pem}"

SERVER_HOST="${SERVER_HOST:-0.0.0.0}"
SERVER_PORT="${SERVER_PORT:-8443}"
SERVER_AUTH_TOKEN="${SERVER_AUTH_TOKEN:-devtoken}"
SNAPSHOT_KEYFRAME_INTERVAL="${SERVER_SNAPSHOT_KEYFRAME_INTERVAL:-5}"
SERVER_USE_HTTPS="${SERVER_USE_HTTPS:-0}"

cmake -S "${SERVER_DIR}" -B "${BUILD_DIR}"
cmake --build "${BUILD_DIR}"

if [[ "${SERVER_USE_HTTPS}" == "1" ]]; then
  if [[ ! -f "${CERT_PATH}" || ! -f "${KEY_PATH}" ]]; then
    mkdir -p "${CERT_DIR}"
    openssl req -x509 -newkey rsa:2048 \
      -keyout "${KEY_PATH}" \
      -out "${CERT_PATH}" \
      -days 365 \
      -nodes \
      -subj "/CN=localhost"
  fi
fi

if [[ "${SERVER_USE_HTTPS}" == "1" ]]; then
  exec "${BUILD_DIR}/afps_server" \
    --cert "${CERT_PATH}" \
    --key "${KEY_PATH}" \
    --auth-token "${SERVER_AUTH_TOKEN}" \
    --host "${SERVER_HOST}" \
    --port "${SERVER_PORT}" \
    --snapshot-keyframe-interval "${SNAPSHOT_KEYFRAME_INTERVAL}" \
    "$@"
else
  exec "${BUILD_DIR}/afps_server" \
    --http \
    --auth-token "${SERVER_AUTH_TOKEN}" \
    --host "${SERVER_HOST}" \
    --port "${SERVER_PORT}" \
    --snapshot-keyframe-interval "${SNAPSHOT_KEYFRAME_INTERVAL}" \
    "$@"
fi
