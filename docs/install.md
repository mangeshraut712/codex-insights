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

`$insights` is ready when `codex-insights@codex-insights` is installed and enabled **and** `codex-session-insights` is on the PATH the Codex app can see. Packaging matches the official Codex plugin contract; it is still a community marketplace listing. See [Plugin directory](plugin-directory.md).

On **macOS**, Homebrew Node often lives at `/opt/homebrew/bin` and a user npm prefix at `~/.local/bin`. Codex Desktop may spawn `$insights` with a PATH that includes neither. `scripts/install.sh` looks for `codex` in those locations, and the `$insights` wrapper prepends them when it runs `codex-session-insights`. If a terminal can run the CLI but `$insights` cannot, add the install prefix to `~/.zshrc` and start a **new** Codex thread:

```bash
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
```

## Update

To get the profile feature, update both the CLI and the installed `$insights` plugin:

```bash
curl -fsSL https://raw.githubusercontent.com/mangeshraut712/codex-insights/HEAD/scripts/install.sh | bash
```

The installer refreshes the marketplace snapshot and reinstalls the plugin. Start a new Codex thread afterward. From a checkout, run `git pull origin main` and then `bash scripts/install.sh`.

Verify the new command with `codex-session-insights profile --help`, then ask `$insights` to create a shareable profile. See [Shareable profile](shareable-profile.md) for the report and web publishing steps.

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
