#!/usr/bin/env bash

set -euo pipefail

CLIENT_ID='01ab8ac9400c4e429b23'

parse_json_field() {
  local field="$1"
  node -e "
let s = '';
process.stdin.on('data', d => s += d);
process.stdin.on('end', () => {
  const value = JSON.parse(s)['${field}'];
  if (value === undefined || value === null) {
    process.exit(1);
  }
  process.stdout.write(String(value));
});
"
}

FLOW_JSON="$(
  curl --silent --show-error \
    -X POST https://github.com/login/device/code \
    -H 'Accept: application/json' \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    --data "client_id=${CLIENT_ID}&scope=read:user"
)"

USER_CODE="$(printf '%s' "${FLOW_JSON}" | parse_json_field user_code)"
DEVICE_CODE="$(printf '%s' "${FLOW_JSON}" | parse_json_field device_code)"
VERIFY_URL="$(printf '%s' "${FLOW_JSON}" | parse_json_field verification_uri)"
INTERVAL="$(printf '%s' "${FLOW_JSON}" | node -e "
let s = '';
process.stdin.on('data', d => s += d);
process.stdin.on('end', () => {
  const json = JSON.parse(s);
  process.stdout.write(String(json.interval ?? 5));
});
")"

printf 'Open: %s\n' "${VERIFY_URL}"
printf 'Enter code: %s\n' "${USER_CODE}"
printf 'Waiting for approval...\n' >&2

while true; do
  sleep "${INTERVAL}"

  TOKEN_JSON="$(
    curl --silent --show-error \
      -X POST https://github.com/login/oauth/access_token \
      -H 'Accept: application/json' \
      -H 'Content-Type: application/x-www-form-urlencoded' \
      --data "client_id=${CLIENT_ID}&device_code=${DEVICE_CODE}&grant_type=urn:ietf:params:oauth:grant-type:device_code"
  )"

  ERROR_CODE="$(
    printf '%s' "${TOKEN_JSON}" | node -e "
let s = '';
process.stdin.on('data', d => s += d);
process.stdin.on('end', () => {
  const json = JSON.parse(s);
  process.stdout.write(String(json.error ?? ''));
});
"
  )"

  if [[ -z "${ERROR_CODE}" ]]; then
    GITHUB_TOKEN="$(printf '%s' "${TOKEN_JSON}" | parse_json_field access_token)"
    break
  fi

  if [[ "${ERROR_CODE}" == 'authorization_pending' ]]; then
    continue
  fi

  if [[ "${ERROR_CODE}" == 'slow_down' ]]; then
    INTERVAL=$((INTERVAL + 5))
    continue
  fi

  printf 'Device flow failed: %s\n' "${TOKEN_JSON}" >&2
  exit 1
done

COPILOT_JSON="$(
curl --silent --show-error \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H 'Accept: application/json' \
  -H 'Editor-Version: vscode/1.96.0' \
  -H 'Editor-Plugin-Version: copilot-chat/0.23.0' \
  -H 'Copilot-Integration-Id: vscode-chat' \
  https://api.github.com/copilot_internal/v2/token \
)"

printf '%s' "${COPILOT_JSON}" | GITHUB_TOKEN="${GITHUB_TOKEN}" node -e "
let s = '';
process.stdin.on('data', d => s += d);
process.stdin.on('end', () => {
  const copilot = JSON.parse(s);
  if (!copilot.token) {
    throw new Error('Copilot token response was missing token.');
  }
  process.stdout.write(JSON.stringify({
    github_token: process.env.GITHUB_TOKEN,
    copilot_token: copilot.token,
    copilot_expires_at: copilot.expires_at ?? null,
  }));
});
"

printf '\n'
