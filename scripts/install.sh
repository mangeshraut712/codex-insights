#!/usr/bin/env bash
# Install the Codex Insights CLI and the $insights skill.
# Usage: curl -fsSL https://raw.githubusercontent.com/mangeshraut712/codex-insights/HEAD/scripts/install.sh | bash
set -euo pipefail

REPO_SLUG="${INSIGHTS_REPO_SLUG:-mangeshraut712/codex-insights}"
MARKETPLACE_NAME="codex-insights"
PLUGIN_ID="codex-insights@codex-insights"
verbose=0
codex_bin="${CODEX_BIN:-codex}"

usage() {
  cat <<'EOF'
Install Codex Insights (CLI + $insights skill).

Usage:
  bash scripts/install.sh
  curl -fsSL https://raw.githubusercontent.com/mangeshraut712/codex-insights/HEAD/scripts/install.sh | bash

Options:
  -h, --help      Show this help
  -v, --verbose   Print Codex JSON output

Requires Node.js >=18.17.0. Codex CLI is required for $insights.
EOF
}

log() { printf '%s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

run_json() {
  if [[ "${verbose}" -eq 1 ]]; then
    "$@"
  else
    "$@" >/dev/null
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    -v|--verbose)
      verbose=1
      shift
      ;;
    *)
      die "unknown option: $1"
      ;;
  esac
done

this="${BASH_SOURCE[0]:-$0}"
root=""
if [[ -n "${this}" && "${this}" != "bash" && "${this}" != "-" && -f "${this}" ]]; then
  root="$(cd "$(dirname "${this}")/.." && pwd)"
fi
if [[ -n "${root}" && ! -f "${root}/plugin/codex-insights/.codex-plugin/plugin.json" ]]; then
  root=""
fi

resolve_npm_prefix() {
  if [[ -n "${NPM_CONFIG_PREFIX:-}" ]]; then
    printf '%s\n' "${NPM_CONFIG_PREFIX}"
    return
  fi
  local local_bin="${HOME}/.local/bin"
  if [[ ":${PATH}:" == *":${local_bin}:"* ]]; then
    printf '%s\n' "${HOME}/.local"
    return
  fi
  local npm_prefix
  npm_prefix="$(npm config get prefix 2>/dev/null || true)"
  if [[ -n "${npm_prefix}" && "${npm_prefix}" != "undefined" && -w "${npm_prefix}" ]]; then
    printf '%s\n' "${npm_prefix}"
    return
  fi
  printf '%s\n' "${HOME}/.local"
}

resolve_codex_bin() {
  if have "${codex_bin}"; then
    return
  fi
  local candidate
  for candidate in \
    /opt/homebrew/bin/codex \
    /usr/local/bin/codex \
    "${HOME}/.local/bin/codex" \
    "${HOME}/.cargo/bin/codex" \
    "${HOME}/.codex/bin/codex"
  do
    if [[ -x "${candidate}" ]]; then
      codex_bin="${candidate}"
      return
    fi
  done
}

have node || die "Node.js >=18.17.0 is required. See https://nodejs.org"
have npm || die "npm is required (it ships with Node.js)."
node -e 'const p=process.versions.node.split(".").map(Number); if (p[0]<18 || (p[0]===18 && p[1]<17)) process.exit(1)' \
  || die "Node.js $(node -p process.version) is too old. Codex Insights needs >=18.17.0."

prefix="$(resolve_npm_prefix)"
resolve_codex_bin

if [[ -n "${root}" ]]; then
  log "Installing CLI from $(basename "${root}")…"
  npm install --global --prefix "${prefix}" --omit=dev --ignore-scripts --no-audit --no-fund "${root}"
  marketplace_source="${root}"
else
  log "Installing CLI from GitHub (${REPO_SLUG})…"
  npm install --global --prefix "${prefix}" --omit=dev --ignore-scripts --no-audit --no-fund "github:${REPO_SLUG}"
  marketplace_source="${REPO_SLUG}"
fi

bin_dir="${prefix}/bin"
if [[ ":${PATH}:" != *":${bin_dir}:"* ]]; then
  log "Note: add ${bin_dir} to PATH to run codex-session-insights from a terminal."
  log "  export PATH=\"${bin_dir}:\$PATH\""
  if [[ "$(uname -s)" == "Darwin" ]]; then
    log "On macOS, put that line in ~/.zshrc. Codex Desktop still finds the CLI via the \$insights wrapper."
  fi
fi

if ! have "${codex_bin}"; then
  log
  log "CLI installed. Install the Codex CLI, then run:"
  log "  ${codex_bin} plugin marketplace add ${marketplace_source}"
  log "  ${codex_bin} plugin add ${PLUGIN_ID}"
  log
  log "CLI: ${bin_dir}/codex-session-insights"
  log "Try:  codex-session-insights --local-only"
  exit 0
fi

log "Installing \$insights skill…"
if ! run_json "${codex_bin}" plugin marketplace add "${marketplace_source}" --json; then
  run_json "${codex_bin}" plugin marketplace upgrade "${MARKETPLACE_NAME}" --json || true
fi
run_json "${codex_bin}" plugin remove "${PLUGIN_ID}" --json || true
"${codex_bin}" plugin add "${PLUGIN_ID}" --json >/dev/null
if [[ "${verbose}" -eq 1 ]]; then
  "${codex_bin}" plugin list --json
fi

log
log "Done."
log "CLI:   ${bin_dir}/codex-session-insights"
log "Skill: start a new Codex thread and type \$insights"
log "Try:   codex-session-insights --local-only"
log "Docs:  https://github.com/${REPO_SLUG}#install-insights"
