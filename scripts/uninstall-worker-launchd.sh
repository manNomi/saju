#!/usr/bin/env bash
set -euo pipefail

LAUNCH_AGENTS_DIR="${HOME}/Library/LaunchAgents"
PLIST_ID="com.mannomi.saju.codex-worker"
PLIST_PATH="${LAUNCH_AGENTS_DIR}/${PLIST_ID}.plist"
USER_UID="$(id -u)"

if [[ -f "${PLIST_PATH}" ]]; then
  launchctl bootout "gui/${USER_UID}" "${PLIST_PATH}" >/dev/null 2>&1 || true
  rm -f "${PLIST_PATH}"
  echo "Removed ${PLIST_PATH}"
else
  echo "No plist found at ${PLIST_PATH}"
fi
