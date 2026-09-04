# Install Codex Insights and `$insights`

Requires [Node.js](https://nodejs.org) `>=18.17.0`. The `$insights` skill also needs the [Codex CLI](https://github.com/openai/codex).

## Codex skill

```bash
codex plugin marketplace add mangeshraut712/codex-insights
codex plugin add codex-insights@codex-insights
```

Start a **new** Codex thread and type `$insights`. With no extra wording it builds a **local-only** report (zero model calls). That is stricter than Claude Code `/insights`, which is model-assisted. Ask for an estimate or a model-assisted report when you want those routes. See [Claude Code `/insights` mapping](claude-insights.md).

## CLI

```bash
npx github:mangeshraut712/codex-insights --local-only
```

After a global install, the same flags work as `codex-session-insights`.

## Both in one step

```bash
curl -fsSL https://raw.githubusercontent.com/mangeshraut712/codex-insights/HEAD/scripts/install.sh | bash
```

That installs `codex-session-insights` and enables `$insights`. From a git checkout, `bash scripts/install.sh` installs from the files you already have.

## From source

```bash
git clone https://github.com/mangeshraut712/codex-insights.git
cd codex-insights
npm ci
bash scripts/install.sh
```

## Verify

```bash
codex-session-insights --help
codex plugin list
```

`$insights` is ready when `codex-insights@codex-insights` is installed and enabled. Packaging matches the official Codex plugin contract; it is still a community marketplace listing. See [Plugin directory](plugin-directory.md).

## Update

```bash
curl -fsSL https://raw.githubusercontent.com/mangeshraut712/codex-insights/HEAD/scripts/install.sh | bash
```

Or from a checkout: `bash scripts/install.sh`.

## Uninstall

```bash
codex plugin remove codex-insights@codex-insights
codex plugin marketplace remove codex-insights
npm uninstall --global codex-session-insights
```

## First report

```bash
codex-session-insights --local-only
codex-session-insights --estimate-only
```

Model-assisted CLI runs still estimate first unless you pass `--yes`. Latest reports land in `~/.codex/usage-data/report.html` with a timestamped copy beside them. See [Privacy and trust](privacy-and-trust.md) before sharing a report.
