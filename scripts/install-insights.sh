#!/usr/bin/env bash
# Back-compat entry for scripts/install.sh (including older curl | bash URLs).
set -euo pipefail

dir=""
if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
  dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi
if [[ -n "${dir}" && -f "${dir}/install.sh" ]]; then
  exec "${dir}/install.sh" "$@"
fi
exec bash -c "$(curl -fsSL https://raw.githubusercontent.com/mangeshraut712/codex-insights/HEAD/scripts/install.sh)" bash "$@"
