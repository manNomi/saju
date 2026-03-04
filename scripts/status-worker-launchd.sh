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

LAST_EXIT_LINE="$(launchctl print "gui/$(id -u)/${PLIST_ID}" 2>/dev/null | awk -F'= ' '/last exit code =/{print $2; exit}')"
if [[ "${LAST_EXIT_LINE}" == 78* ]]; then
  echo
  echo "[hint]"
  echo "last exit code is EX_CONFIG(78)."
  echo "If this project is under Desktop/Documents/Downloads, launchd can be blocked by macOS folder privacy."
  echo "Move project to a non-protected path (e.g. ~/code/saju) and reinstall worker."
fi

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
