#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOCAL_DEPLOY_ENV="${LOCAL_DEPLOY_ENV:-${REPO_ROOT}/.local/deploy.env}"

remember_override() {
  local name="$1"
  printf '%s' "${!name-__UNSET__}"
}

restore_override() {
  local name="$1"
  local value="$2"
  if [[ "${value}" != "__UNSET__" ]]; then
    printf -v "${name}" '%s' "${value}"
    export "${name}"
  fi
}

DEPLOY_REMOTE_OVERRIDE="$(remember_override DEPLOY_REMOTE)"
DEPLOY_BRANCH_OVERRIDE="$(remember_override DEPLOY_BRANCH)"
DEPLOY_PUSH_GIT_OVERRIDE="$(remember_override DEPLOY_PUSH_GIT)"
DEPLOY_SKIP_SYNC_OVERRIDE="$(remember_override DEPLOY_SKIP_SYNC)"
DEPLOY_SKIP_RESTART_OVERRIDE="$(remember_override DEPLOY_SKIP_RESTART)"
DEPLOY_SKIP_SMOKE_OVERRIDE="$(remember_override DEPLOY_SKIP_SMOKE)"
DEPLOY_HEALTHCHECK_TIMEOUT_OVERRIDE="$(remember_override DEPLOY_HEALTHCHECK_TIMEOUT)"
DEPLOY_HEALTHCHECK_EXPECT_OVERRIDE="$(remember_override DEPLOY_HEALTHCHECK_EXPECT)"
DEPLOY_HEALTHCHECK_INSECURE_OVERRIDE="$(remember_override DEPLOY_HEALTHCHECK_INSECURE)"
DEPLOY_HEALTHCHECK_RESOLVE_OVERRIDE="$(remember_override DEPLOY_HEALTHCHECK_RESOLVE)"
DEPLOY_RESTART_CMD_OVERRIDE="$(remember_override DEPLOY_RESTART_CMD)"
DEPLOY_TARGET_DIR_OVERRIDE="$(remember_override DEPLOY_TARGET_DIR)"
DEPLOY_HEALTHCHECK_URL_OVERRIDE="$(remember_override DEPLOY_HEALTHCHECK_URL)"

if [[ ! -f "${LOCAL_DEPLOY_ENV}" ]]; then
  echo "❌ Missing deploy config: ${LOCAL_DEPLOY_ENV}"
  echo "Create the file in the git-ignored .local/ directory before running rollout."
  exit 1
fi

# shellcheck disable=SC1090
source "${LOCAL_DEPLOY_ENV}"

restore_override DEPLOY_REMOTE "${DEPLOY_REMOTE_OVERRIDE}"
restore_override DEPLOY_BRANCH "${DEPLOY_BRANCH_OVERRIDE}"
restore_override DEPLOY_PUSH_GIT "${DEPLOY_PUSH_GIT_OVERRIDE}"
restore_override DEPLOY_SKIP_SYNC "${DEPLOY_SKIP_SYNC_OVERRIDE}"
restore_override DEPLOY_SKIP_RESTART "${DEPLOY_SKIP_RESTART_OVERRIDE}"
restore_override DEPLOY_SKIP_SMOKE "${DEPLOY_SKIP_SMOKE_OVERRIDE}"
restore_override DEPLOY_HEALTHCHECK_TIMEOUT "${DEPLOY_HEALTHCHECK_TIMEOUT_OVERRIDE}"
restore_override DEPLOY_HEALTHCHECK_EXPECT "${DEPLOY_HEALTHCHECK_EXPECT_OVERRIDE}"
restore_override DEPLOY_HEALTHCHECK_INSECURE "${DEPLOY_HEALTHCHECK_INSECURE_OVERRIDE}"
restore_override DEPLOY_HEALTHCHECK_RESOLVE "${DEPLOY_HEALTHCHECK_RESOLVE_OVERRIDE}"
restore_override DEPLOY_RESTART_CMD "${DEPLOY_RESTART_CMD_OVERRIDE}"
restore_override DEPLOY_TARGET_DIR "${DEPLOY_TARGET_DIR_OVERRIDE}"
restore_override DEPLOY_HEALTHCHECK_URL "${DEPLOY_HEALTHCHECK_URL_OVERRIDE}"

DEPLOY_REMOTE="${DEPLOY_REMOTE:-origin}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-master}"
DEPLOY_PUSH_GIT="${DEPLOY_PUSH_GIT:-1}"
DEPLOY_SKIP_SYNC="${DEPLOY_SKIP_SYNC:-0}"
DEPLOY_SKIP_RESTART="${DEPLOY_SKIP_RESTART:-0}"
DEPLOY_SKIP_SMOKE="${DEPLOY_SKIP_SMOKE:-0}"
DEPLOY_HEALTHCHECK_TIMEOUT="${DEPLOY_HEALTHCHECK_TIMEOUT:-30}"
DEPLOY_HEALTHCHECK_EXPECT="${DEPLOY_HEALTHCHECK_EXPECT:-200}"
DEPLOY_HEALTHCHECK_INSECURE="${DEPLOY_HEALTHCHECK_INSECURE:-0}"
DEPLOY_HEALTHCHECK_RESOLVE="${DEPLOY_HEALTHCHECK_RESOLVE:-}"
DEPLOY_RESTART_CMD="${DEPLOY_RESTART_CMD:-}"

if [[ "${DEPLOY_SKIP_SYNC}" != "1" ]]; then
  : "${DEPLOY_TARGET_DIR:?Set DEPLOY_TARGET_DIR in ${LOCAL_DEPLOY_ENV}}"
fi

if [[ "${DEPLOY_SKIP_SMOKE}" != "1" ]]; then
  : "${DEPLOY_HEALTHCHECK_URL:?Set DEPLOY_HEALTHCHECK_URL in ${LOCAL_DEPLOY_ENV}}"
fi

echo "🚀 Starting rollout..."

cd "${REPO_ROOT}"

echo "🧱 Building app..."
npm run build

if [[ "${DEPLOY_PUSH_GIT}" == "1" ]]; then
  echo "📤 Pushing current HEAD to ${DEPLOY_REMOTE}/${DEPLOY_BRANCH}..."
  git push "${DEPLOY_REMOTE}" "HEAD:${DEPLOY_BRANCH}"
else
  echo "⏭️  Skipping git push."
fi

if [[ "${DEPLOY_SKIP_SYNC}" != "1" ]]; then
  echo "📦 Syncing dist/ to ${DEPLOY_TARGET_DIR}..."
  if ! command -v rsync >/dev/null 2>&1; then
    echo "❌ rsync is required for rollout sync."
    exit 1
  fi

  if [[ "${DEPLOY_TARGET_DIR}" != *:* ]]; then
    mkdir -p "${DEPLOY_TARGET_DIR}"
  fi

  rsync -az --delete "${REPO_ROOT}/dist/" "${DEPLOY_TARGET_DIR%/}/"
else
  echo "⏭️  Skipping dist sync."
fi

if [[ "${DEPLOY_SKIP_RESTART}" != "1" && -n "${DEPLOY_RESTART_CMD}" ]]; then
  echo "🔄 Restarting service..."
  bash -lc "${DEPLOY_RESTART_CMD}"
else
  echo "⏭️  Skipping service restart."
fi

if [[ "${DEPLOY_SKIP_SMOKE}" != "1" ]]; then
  echo "🩺 Waiting for ${DEPLOY_HEALTHCHECK_URL}..."
  curl_args=(
    --silent
    --show-error
    --output /dev/null
    --write-out '%{http_code}'
  )

  if [[ "${DEPLOY_HEALTHCHECK_INSECURE}" == "1" ]]; then
    curl_args+=(--insecure)
  fi

  if [[ -n "${DEPLOY_HEALTHCHECK_RESOLVE}" ]]; then
    curl_args+=(--resolve "${DEPLOY_HEALTHCHECK_RESOLVE}")
  fi

  ready=0
  for i in $(seq 1 "${DEPLOY_HEALTHCHECK_TIMEOUT}"); do
    status_code="$(curl "${curl_args[@]}" "${DEPLOY_HEALTHCHECK_URL}" 2>/dev/null || true)"
    if [[ "${status_code}" == "${DEPLOY_HEALTHCHECK_EXPECT}" ]]; then
      echo "✅ Healthcheck passed after ${i}s"
      ready=1
      break
    fi
    sleep 1
  done

  if [[ "${ready}" != "1" ]]; then
    echo "❌ Healthcheck failed for ${DEPLOY_HEALTHCHECK_URL}"
    exit 1
  fi
else
  echo "⏭️  Skipping smoke test."
fi

echo "✅ Rollout complete!"
