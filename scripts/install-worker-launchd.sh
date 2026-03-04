#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAUNCH_AGENTS_DIR="${HOME}/Library/LaunchAgents"
PLIST_ID="com.mannomi.saju.codex-worker"
PLIST_PATH="${LAUNCH_AGENTS_DIR}/${PLIST_ID}.plist"
LOG_DIR="${ROOT_DIR}/logs"
OUT_LOG="${LOG_DIR}/codex-worker.log"
ERR_LOG="${LOG_DIR}/codex-worker.err.log"
USER_UID="$(id -u)"

mkdir -p "${LAUNCH_AGENTS_DIR}" "${LOG_DIR}"
touch "${OUT_LOG}" "${ERR_LOG}"

cat > "${PLIST_PATH}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_ID}</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>cd "${ROOT_DIR}" &amp;&amp; /usr/bin/env npm run worker:once</string>
  </array>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>

  <key>WorkingDirectory</key>
  <string>${ROOT_DIR}</string>

  <key>StartInterval</key>
  <integer>600</integer>

  <key>RunAtLoad</key>
  <true/>

  <key>StandardOutPath</key>
  <string>${OUT_LOG}</string>

  <key>StandardErrorPath</key>
  <string>${ERR_LOG}</string>
</dict>
</plist>
EOF

launchctl bootout "gui/${USER_UID}" "${PLIST_PATH}" >/dev/null 2>&1 || true
launchctl bootstrap "gui/${USER_UID}" "${PLIST_PATH}"
launchctl enable "gui/${USER_UID}/${PLIST_ID}" >/dev/null 2>&1 || true
launchctl kickstart -k "gui/${USER_UID}/${PLIST_ID}" >/dev/null 2>&1 || true

echo "Installed launchd worker:"
echo "  plist: ${PLIST_PATH}"
echo "  out:   ${OUT_LOG}"
echo "  err:   ${ERR_LOG}"
echo "  interval: every 10 minutes"
