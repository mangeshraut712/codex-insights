# Release checklist

## Contracts

- Node.js floor is `>=18.17.0`.
- Plugin and package base versions match.
- JSON schema version, analysis modes, and coverage fields are documented.
- No raw personal transcript, internal identifier, credential, or machine-specific path is committed.

## Verification

```bash
npm ci
npm run ci
npm run generate:test-report
npm pack --dry-run
python3 /path/to/skill-creator/scripts/quick_validate.py plugin/codex-insights/skills/insights
python3 /path/to/plugin-creator/scripts/validate_plugin.py plugin/codex-insights
```

Inspect the package preview for `bin/`, `lib/`, `plugin/`, and `README.md`. Inspect generated reports for schema version, analysis mode, coverage, warnings, redaction count, and absence of seeded secrets.

## End-to-end modes

- Run a bounded live app-server report with `--local-only --data-source app-server --no-open`.
- Run a synthetic legacy report with `--local-only --data-source legacy --no-open`.
- Confirm both runs make zero model calls and write usable HTML and JSON, including a timestamped copy next to `report.html`.
- Confirm the HTML header uses `analyzed sessions (discovered total)` when coverage leaves sessions out.
- Confirm `auto` records any fallback instead of silently changing provenance.

## Local installation

- Codex skill: `codex plugin marketplace add mangeshraut712/codex-insights` then `codex plugin add codex-insights@codex-insights`.
- CLI: `npx github:mangeshraut712/codex-insights --local-only`.
- Both: `curl -fsSL https://raw.githubusercontent.com/mangeshraut712/codex-insights/HEAD/scripts/install.sh | bash`.
- From a checkout: `bash scripts/install.sh`.
- Verify `codex plugin list` shows `codex-insights@codex-insights` enabled.
- Start a new Codex thread before checking `$insights` discovery.

## Owner git push

- Run `bash scripts/setup-github-auth.sh` then `unset GH_TOKEN GITHUB_TOKEN`.
- `bash scripts/check-github-auth.sh` must report GitHub `/user` HTTP 200 as `mangeshraut712`.
- `git remote -v` for origin must not embed `x-access-token`.

## Contribution

- Review the full branch against the design and privacy contract.
- Confirm README, `docs/install.md`, `docs/claude-insights.md`, and `$insights` still describe the same install and default mode.
- Do not enable Dependabot or merge bot-authored dependency PRs.
- Push the verified branch and confirm ahead/behind parity.
- Open or update the community pull request with behavior, tests, privacy limits, compatibility, and non-goals.
- Link the `/insights` RFC as a proposal only; do not claim upstream acceptance.
- Do not publish npm artifacts without a separate release decision.
