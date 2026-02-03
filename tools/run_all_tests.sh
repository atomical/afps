#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLIENT_DIR="${CLIENT_DIR:-${ROOT_DIR}/client}"
SERVER_DIR="${SERVER_DIR:-${ROOT_DIR}/server}"

PORT_START="${UI_TEST_PORT:-5174}"
UI_TEST_PORT="$(python3 - <<PY
import socket
start = int("${PORT_START}")
for port in range(start, start + 50):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind(("127.0.0.1", port))
            print(port)
            raise SystemExit(0)
        except OSError:
            continue
raise SystemExit("no free port found")
PY
)"
TEST_BASE_URL="${TEST_BASE_URL:-http://127.0.0.1:${UI_TEST_PORT}/}"

DEV_PID=""
FAILED=0

cleanup() {
  if [[ -n "${DEV_PID}" ]] && kill -0 "${DEV_PID}" 2>/dev/null; then
    kill "${DEV_PID}" || true
  fi
  rm -f "${ROOT_DIR}/.ui_test_dev_server.pid"
}

trap cleanup EXIT INT TERM

echo "==> Running server tests"
(
  cd "${SERVER_DIR}"
  cmake -S . -B build
  cmake --build build
  ctest --test-dir build
) || FAILED=1

echo "==> Running client unit tests"
(
  cd "${CLIENT_DIR}"
  npm test
) || FAILED=1

echo "==> Starting client dev server for UI tests on port ${UI_TEST_PORT}"
(
  cd "${CLIENT_DIR}"
  VITE_SIGNALING_URL="${VITE_SIGNALING_URL:-http://localhost:8443}" \
  VITE_SIGNALING_AUTH_TOKEN="${VITE_SIGNALING_AUTH_TOKEN:-devtoken}" \
    npm run dev -- --host 127.0.0.1 --port "${UI_TEST_PORT}" --strictPort \
      >"${ROOT_DIR}/.ui_test_dev_server.log" 2>&1 &
  DEV_PID=$!
  echo "${DEV_PID}" >"${ROOT_DIR}/.ui_test_dev_server.pid"
)

DEV_PID="$(cat "${ROOT_DIR}/.ui_test_dev_server.pid")"

READY=0
for _ in $(seq 1 40); do
  if curl -fsS "${TEST_BASE_URL}" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 0.25
done

if [[ "${READY}" -ne 1 ]]; then
  echo "Dev server did not become ready at ${TEST_BASE_URL}"
  echo "Last 50 lines of ${ROOT_DIR}/.ui_test_dev_server.log:"
  tail -n 50 "${ROOT_DIR}/.ui_test_dev_server.log" || true
  exit 1
fi

echo "==> Running UI tests against ${TEST_BASE_URL}"
pushd "${CLIENT_DIR}" >/dev/null
PW_NO_WEB_SERVER=1 PW_BASE_URL="${TEST_BASE_URL}" npm run test:ui || FAILED=1
popd >/dev/null

if [[ "${FAILED}" -ne 0 ]]; then
  echo "==> Test suite completed with failures"
  exit 1
fi

echo "==> All tests completed"
