#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLIST_ID="com.mannomi.saju.codex-worker"
PLIST_PATH="${HOME}/Library/LaunchAgents/${PLIST_ID}.plist"
OUT_LOG="${ROOT_DIR}/logs/codex-worker.log"
ERR_LOG="${ROOT_DIR}/logs/codex-worker.err.log"

echo "[launchd]"
if [[ -f "${PLIST_PATH}" ]]; then
  echo "plist: ${PLIST_PATH}"
else
  echo "plist: not found"
fi

echo
echo "[launchctl print]"
launchctl print "gui/$(id -u)/${PLIST_ID}" 2>/dev/null | sed -n '1,60p' || echo "service not loaded"

echo
echo "[tail stdout]"
if [[ -f "${OUT_LOG}" ]]; then
  tail -n 30 "${OUT_LOG}"
else
  echo "no stdout log"
fi

echo
echo "[tail stderr]"
if [[ -f "${ERR_LOG}" ]]; then
  tail -n 30 "${ERR_LOG}"
else
  echo "no stderr log"
fi
