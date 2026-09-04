# Contributing

Read [docs/contributing-analyzers.md](docs/contributing-analyzers.md) before changing collectors, redaction, or report metadata.

```bash
npm ci
npm test
npm run check
npm run generate:test-report
```

Install and verify the `$insights` skill with [docs/install.md](docs/install.md). Owner pushes from a Cursor environment need [docs/github-auth.md](docs/github-auth.md):

```bash
bash scripts/setup-github-auth.sh
unset GH_TOKEN GITHUB_TOKEN
bash scripts/check-github-auth.sh
```
