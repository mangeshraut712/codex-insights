#!/usr/bin/env bash
# Download this checkout (or clone it) and install the CLI plus the $insights skill.
set -euo pipefail

branch="${INSIGHTS_BRANCH:-feat/codex-insights-plugin-hardening}"
repo_url="${INSIGHTS_REPO:-https://github.com/mangeshraut712/codex-insights.git}"
dest="${INSIGHTS_DIR:-$HOME/src/codex-insights}"
prefix="${NPM_CONFIG_PREFIX:-$HOME/.local}"
codex_bin="${CODEX_BIN:-codex}"

this="${BASH_SOURCE[0]:-$0}"
root=""
if [[ -n "${this}" && "${this}" != "bash" && "${this}" != "-" && -f "${this}" ]]; then
  root="$(cd "$(dirname "${this}")/.." && pwd)"
fi

if [[ -z "${root}" || ! -f "${root}/plugin/codex-insights/.codex-plugin/plugin.json" ]]; then
  mkdir -p "$(dirname "${dest}")"
  if [[ -d "${dest}/.git" ]]; then
    git -C "${dest}" fetch origin "${branch}"
    git -C "${dest}" checkout "${branch}"
    git -C "${dest}" pull --ff-only origin "${branch}"
  else
    git clone --branch "${branch}" --single-branch "${repo_url}" "${dest}"
  fi
  root="${dest}"
fi

cd "${root}"
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi
npm install --global --prefix "${prefix}" --offline --ignore-scripts --no-audit --no-fund "${root}" 2>/dev/null \
  || npm install --global --prefix "${prefix}" --ignore-scripts --no-audit --no-fund "${root}"

mkdir -p "${HOME}/plugins"
rm -rf "${HOME}/plugins/codex-insights"
cp -R "${root}/plugin/codex-insights" "${HOME}/plugins/codex-insights"
chmod +x "${HOME}/plugins/codex-insights/scripts/run-insights.mjs"

python3 - "${HOME}/.agents/plugins/marketplace.json" <<'PY'
import json
from pathlib import Path
import sys

path = Path(sys.argv[1])
path.parent.mkdir(parents=True, exist_ok=True)
payload = {
    "name": "personal",
    "interface": {"displayName": "Personal"},
    "plugins": [],
}
if path.exists():
    payload = json.loads(path.read_text())
plugins = payload.setdefault("plugins", [])
entry = {
    "name": "codex-insights",
    "source": {"source": "local", "path": "./plugins/codex-insights"},
    "policy": {"installation": "AVAILABLE", "authentication": "ON_INSTALL"},
    "category": "Productivity",
}
for index, existing in enumerate(plugins):
    if isinstance(existing, dict) and existing.get("name") == "codex-insights":
        plugins[index] = entry
        break
else:
    plugins.append(entry)
path.write_text(json.dumps(payload, indent=2) + "\n")
PY

if command -v "${codex_bin}" >/dev/null 2>&1; then
  # `plugin add` only sees uninstalled marketplace entries; refresh by remove+add.
  "${codex_bin}" plugin remove codex-insights@personal --json >/dev/null 2>&1 || true
  "${codex_bin}" plugin add codex-insights@personal --json
  "${codex_bin}" plugin list --json
else
  echo "Codex CLI not on PATH. Installed the plugin files at ${HOME}/plugins/codex-insights."
  echo "Install Codex, then run: ${codex_bin} plugin add codex-insights@personal"
fi

echo
echo "CLI: ${prefix}/bin/codex-session-insights"
echo "Skill: \$insights (start a new Codex task after install)"
echo "Local-only report: codex-session-insights --local-only --no-open"
