# Contributing

Read [docs/contributing-analyzers.md](docs/contributing-analyzers.md) before changing collectors, redaction, or report metadata. User-facing install and usage live in [README.md](README.md) and [docs/install.md](docs/install.md). Claude Code `/insights` mapping: [docs/claude-insights.md](docs/claude-insights.md).

```bash
npm ci
npm run ci
npm run generate:test-report
bash scripts/install.sh
```

GitHub Actions runs `npm test`, `npm run check`, and `npm pack --dry-run` on Node 20, 22, and 24. Keep README, `docs/install.md`, `docs/claude-insights.md`, and the `$insights` skill in sync when install commands or default modes change. Vulnerability reports go to [SECURITY.md](SECURITY.md).

## Maintainers

This repository is maintained by **mangeshraut712** and **Cursor**. Do not enable Dependabot or other GitHub Apps that open bot pull requests. Do not merge `dependabot[bot]` or `cursor[bot]` commits. Dependency and Actions bumps happen in maintainer commits after review. TypeScript stays on 5.x until a maintainer chooses otherwise.

Keep the GitHub About box in sync with `package.json`: description, homepage (`https://github.com/mangeshraut712/codex-insights#readme`), and topics matching `package.json` `keywords`.

Plugin/skill validators:

```bash
python3 /path/to/skill-creator/scripts/quick_validate.py plugin/codex-insights/skills/insights
python3 /path/to/plugin-creator/scripts/validate_plugin.py plugin/codex-insights
```

Owner pushes from a Cursor environment need [docs/github-auth.md](docs/github-auth.md):

```bash
bash scripts/setup-github-auth.sh
unset GH_TOKEN GITHUB_TOKEN
bash scripts/check-github-auth.sh
```
