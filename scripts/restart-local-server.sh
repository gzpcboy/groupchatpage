#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PID_FILE="${REPO_ROOT}/.local/serve-dist.pid"
LOG_FILE="${REPO_ROOT}/.local/serve-dist.log"

find_existing_server_pid() {
  if [[ -f "${PID_FILE}" ]]; then
    local recorded_pid
    recorded_pid="$(<"${PID_FILE}")"
    if kill -0 "${recorded_pid}" 2>/dev/null; then
      echo "${recorded_pid}"
      return 0
    fi
  fi

  ps -eo pid=,args= | awk '$2 == "node" && $3 == "./scripts/serve-dist.mjs" { print $1; exit }'
}

mkdir -p "${REPO_ROOT}/.local"
cd "${REPO_ROOT}"

EXISTING_PID="$(find_existing_server_pid || true)"

if [[ -n "${EXISTING_PID}" ]]; then
  if kill -0 "${EXISTING_PID}" 2>/dev/null; then
    kill "${EXISTING_PID}"
    for _ in $(seq 1 10); do
      if ! kill -0 "${EXISTING_PID}" 2>/dev/null; then
        break
      fi
      sleep 1
    done
  fi
fi

rm -f "${PID_FILE}"

if command -v setsid >/dev/null 2>&1; then
  setsid node ./scripts/serve-dist.mjs >"${LOG_FILE}" 2>&1 < /dev/null &
else
  nohup node ./scripts/serve-dist.mjs >"${LOG_FILE}" 2>&1 < /dev/null &
fi

NEW_PID=$!
echo "${NEW_PID}" > "${PID_FILE}"
sleep 1

if ! kill -0 "${NEW_PID}" 2>/dev/null; then
  echo "❌ Failed to start local HTTPS server. Check ${LOG_FILE}."
  exit 1
fi

echo "✅ Local HTTPS server restarted (PID ${NEW_PID})"
