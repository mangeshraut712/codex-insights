#!/usr/bin/env bash
# Verify owner GitHub auth is HTTP 200 and git will not push as cursor[bot].
set -euo pipefail

EXPECTED_LOGIN="${EXPECTED_LOGIN:-mangeshraut712}"
TOKEN_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/codex-insights"
TOKEN_FILE="${TOKEN_DIR}/github.token"
HELPER="${TOKEN_DIR}/git-credential"
OWNER_HTTPS="https://github.com/${EXPECTED_LOGIN}/"

die() {
  echo "error: $*" >&2
  exit 1
}

token="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
if [[ -z "${token}" && -f "${TOKEN_FILE}" ]]; then
  token="$(<"${TOKEN_FILE}")"
fi
token="${token//$'\n'/}"
token="${token//$'\r'/}"
[[ -n "${token}" ]] || die "no GitHub token. Run: bash scripts/setup-github-auth.sh"

tmp="$(mktemp)"
status="$(
  curl -sS -o "${tmp}" -w "%{http_code}" \
    -H "Authorization: Bearer ${token}" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    -H "User-Agent: codex-insights-github-auth" \
    https://api.github.com/user
)"
login="$(python3 - "${tmp}" <<'PY'
import json, sys
payload = json.load(open(sys.argv[1]))
print(payload.get("login") or "")
PY
)"
rm -f "${tmp}"

[[ "${status}" == "200" ]] || die "GitHub /user returned HTTP ${status} (want 200)"
[[ "${login}" == "${EXPECTED_LOGIN}" ]] || die "GitHub login is '${login}', expected '${EXPECTED_LOGIN}'"

[[ -f "${TOKEN_FILE}" ]] || die "missing ${TOKEN_FILE}"
[[ -x "${HELPER}" ]] || die "missing executable helper ${HELPER}"

if ! git config --global --get-all "url.${OWNER_HTTPS}.insteadOf" 2>/dev/null | grep -qx "${OWNER_HTTPS}"; then
  die "owner identity insteadOf is not installed; run setup-github-auth.sh"
fi
if git config --global --get-regexp '^url\..*github\.com/mangeshraut712' | grep -q 'x-access-token:'; then
  die "owner insteadOf still embeds a token; re-run setup-github-auth.sh"
fi

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  origin_stored="$(git config --local --get remote.origin.url 2>/dev/null || true)"
  if [[ "${origin_stored}" == *"x-access-token:"* ]]; then
    die "remote.origin.url stores a token; set it to ${OWNER_HTTPS}<repo>.git"
  fi
fi

echo "ok: /user HTTP 200 as ${login}"
echo "ok: owner identity insteadOf and credential helper are installed"

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "ok: probing git receive-pack as ${login} (GH_TOKEN unset)"
  env -u GH_TOKEN -u GITHUB_TOKEN git push --dry-run origin HEAD >/dev/null
  echo "ok: git push --dry-run origin HEAD"
fi
