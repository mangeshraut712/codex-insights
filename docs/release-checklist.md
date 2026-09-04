# Release checklist

## Contracts

- Node.js floor is `>=18.17.0`.
- Plugin and package base versions match.
- JSON schema version, analysis modes, and coverage fields are documented.
- No raw personal transcript, internal identifier, credential, or machine-specific path is committed.

## Verification

```bash
npm ci
npm test
npm run check
npm run generate:test-report
npm pack --dry-run
python3 /path/to/skill-creator/scripts/quick_validate.py plugin/codex-insights/skills/insights
python3 /path/to/plugin-creator/scripts/validate_plugin.py plugin/codex-insights
```

Inspect the package preview for `bin/`, `lib/`, `plugin/`, and `README.md`. Inspect generated reports for schema version, analysis mode, coverage, warnings, redaction count, and absence of seeded secrets.

## End-to-end modes

- Run a bounded live app-server report with `--local-only --data-source app-server --no-open`.
- Run a synthetic legacy report with `--local-only --data-source legacy --no-open`.
- Confirm both runs make zero model calls and write usable HTML and JSON.
- Confirm `auto` records any fallback instead of silently changing provenance.

## Local installation

- Link the CLI with `npm link`.
- Add the plugin to a personal or explicit local marketplace.
- Install `codex-insights@<marketplace>` and verify `codex plugin list --json`.
- Verify the installed plugin contains `skills/insights/SKILL.md`.
- Start a new Codex task boundary before checking `$insights` discovery.

## Contribution

- Review the full branch against the design and privacy contract.
- Push the verified branch and confirm ahead/behind parity.
- Open or update the community pull request with behavior, tests, privacy limits, compatibility, and non-goals.
- Link the `/insights` RFC as a proposal only; do not claim upstream acceptance.
- Do not publish npm artifacts without a separate release decision.
