# Install Codex Insights and `$insights`

Node.js `>=18.17.0` is required. Codex CLI is required to install the plugin skill.

## Download and install (one command)

```bash
curl -fsSL https://raw.githubusercontent.com/mangeshraut712/codex-insights/feat/codex-insights-plugin-hardening/scripts/install-insights.sh | bash
```

That clones `mangeshraut712/codex-insights` at `feat/codex-insights-plugin-hardening` into `~/src/codex-insights` (or updates it), installs the `codex-session-insights` CLI, and enables `$insights` as `codex-insights@personal`.

Override the clone location with `INSIGHTS_DIR=/path/to/codex-insights`.

## From an existing checkout

```bash
git clone --branch feat/codex-insights-plugin-hardening --single-branch \
  https://github.com/mangeshraut712/codex-insights.git
cd codex-insights
bash scripts/install-insights.sh
```

Snapshot without git:

```bash
curl -L https://github.com/mangeshraut712/codex-insights/archive/refs/heads/feat/codex-insights-plugin-hardening.tar.gz \
  | tar -xz
cd codex-insights-feat-codex-insights-plugin-hardening
bash scripts/install-insights.sh
```

## Install from this Git marketplace

```bash
codex plugin marketplace add https://github.com/mangeshraut712/codex-insights \
  --ref feat/codex-insights-plugin-hardening
codex plugin add codex-insights@codex-insights
codex plugin list --json
```

Start a **new** Codex task after install, then invoke `$insights`.

## Manual install

```bash
npm ci
npm install --global --prefix "$HOME/.local" .
mkdir -p ~/plugins
cp -R plugin/codex-insights ~/plugins/codex-insights
codex plugin add codex-insights@personal
```

## First report

```bash
codex-session-insights --local-only --no-open
```

Private/offline analysis makes zero model calls. Estimate a model-assisted run with `--estimate-only` before generating narratives.

## Verify

```bash
codex-session-insights --help
codex plugin list --json
```

Confirm `codex-insights@personal` or `codex-insights@codex-insights` is installed and enabled. The skill file is `plugin/codex-insights/skills/insights/SKILL.md`.
