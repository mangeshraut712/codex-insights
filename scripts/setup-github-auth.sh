#!/usr/bin/env bash
# Configure git so pushes to github.com/mangeshraut712/* authenticate as
# mangeshraut712, even when a broader Cursor bot insteadOf rewrite is present.
#
# Strategy: longest-prefix insteadOf is an identity rewrite (no token in git
# config). Git then asks a host-specific credential helper that reads the
# token from ~/.config/codex-insights/github.token.
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

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

require_cmd curl
require_cmd git
require_cmd python3

mkdir -p "${TOKEN_DIR}"
chmod 700 "${TOKEN_DIR}"

token="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
if [[ -z "${token}" && -f "${TOKEN_FILE}" ]]; then
  token="$(<"${TOKEN_FILE}")"
fi
token="${token//$'\n'/}"
token="${token//$'\r'/}"
[[ -n "${token}" ]] || die "no GitHub token. Set GH_TOKEN or save one to ${TOKEN_FILE}"

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

umask 077
printf '%s\n' "${token}" > "${TOKEN_FILE}"
chmod 600 "${TOKEN_FILE}"

cat > "${HELPER}" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
TOKEN_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/codex-insights/github.token"
action="${1:-}"
while IFS= read -r line || [[ -n "${line:-}" ]]; do
  [[ -z "${line}" ]] && break
done
case "${action}" in
  get)
    [[ -f "${TOKEN_FILE}" ]] || exit 0
    token="$(<"${TOKEN_FILE}")"
    token="${token//$'\n'/}"
    [[ -n "${token}" ]] || exit 0
    printf 'username=x-access-token\npassword=%s\n\n' "${token}"
    ;;
  store|erase)
    exit 0
    ;;
  *)
    exit 0
    ;;
esac
EOF
chmod 700 "${HELPER}"

# Drop any previous owner rewrite, including token-embedding insteadOf keys.
while IFS= read -r key; do
  [[ -n "${key}" ]] || continue
  git config --global --unset-all "${key}" >/dev/null 2>&1 || true
done < <(git config --global --get-regexp '^url\..*github\.com/mangeshraut712' 2>/dev/null | awk '{print $1}' || true)

# Identity rewrite: longer than Cursor's https://github.com/ bot prefix, no token in config.
git config --global --replace-all "url.${OWNER_HTTPS}.insteadOf" "${OWNER_HTTPS}"
git config --global --add "url.${OWNER_HTTPS}.insteadOf" "git@github.com:${EXPECTED_LOGIN}/"
git config --global --add "url.${OWNER_HTTPS}.insteadOf" "ssh://git@github.com/${EXPECTED_LOGIN}/"
git config --global --add "url.${OWNER_HTTPS}.insteadOf" "ssh://git@github.com:22/${EXPECTED_LOGIN}/"
git config --global --add "url.${OWNER_HTTPS}.insteadOf" "git+ssh://git@github.com/${EXPECTED_LOGIN}/"

# Reset inherited github.com helpers (cursor gh) for this owner prefix only.
git config --global --replace-all "credential.https://github.com/${EXPECTED_LOGIN}.helper" ""
git config --global --add "credential.https://github.com/${EXPECTED_LOGIN}.helper" "${HELPER}"
git config --global "credential.https://github.com/${EXPECTED_LOGIN}.username" "x-access-token"

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  origin_url="$(git config --local --get remote.origin.url 2>/dev/null || true)"
  if [[ "${origin_url}" == *"github.com/${EXPECTED_LOGIN}/"* ]]; then
    repo_name="${origin_url##*/}"
    repo_name="${repo_name%.git}.git"
    git remote set-url origin "${OWNER_HTTPS}${repo_name}"
  fi
fi

echo "ok: GitHub /user HTTP 200 as ${login}"
echo "ok: token stored at ${TOKEN_FILE} (mode 600)"
echo "ok: identity insteadOf for ${OWNER_HTTPS} (no token in git config)"
echo "ok: credential helper at ${HELPER}"
echo
echo "Keep remotes as https://github.com/${EXPECTED_LOGIN}/<repo>.git"
echo "If GH_TOKEN is empty in this shell it still overrides gh; unset it for git:"
echo "  unset GH_TOKEN GITHUB_TOKEN"
echo "  bash scripts/check-github-auth.sh"
echo "  git push origin HEAD"
