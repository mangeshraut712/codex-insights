# Contributing

Read [docs/contributing-analyzers.md](docs/contributing-analyzers.md) before changing collectors, redaction, or report metadata. User-facing install and usage live in [README.md](README.md) and [docs/install.md](docs/install.md).

```bash
npm ci
npm test
npm run check
npm run generate:test-report
bash scripts/install.sh
```

Keep README, `docs/install.md`, and the `$insights` skill in sync when install commands or default modes change. Plugin/skill validators:

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
