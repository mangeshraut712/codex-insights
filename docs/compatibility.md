# Compatibility and validation — November 2026

Runtime requirements below come from this repository’s package manifest and CI configuration, checked on 14 November 2026.

## Codex Insights

The CLI requires Node 22.22.2+, Node 24.15+ or Node 26+. The interactive dependencies are Inquirer Prompts 8.8 and Ora 10. Development uses TypeScript 7, ESLint 10 and Node 26 type declarations. A targeted minimatch 11 override addresses [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) while retaining supported ESLint; keep it under review when ESLint updates its own dependency range.

The Codex plugin includes its wrapper, manifest, skill and assets. Copying only SKILL.md loses the wrapper. Install the plugin using the documented marketplace route and open a new thread. LaunchAgent scheduling is macOS-specific and remains opt-in; installation does not authorize publishing a profile.

Model defaults are pinned behavior, not a claim to use the newest or best model. Use the supported CLI model overrides only with models available to your account. Codex [app-server model/list](https://learn.chatgpt.com/docs/app-server) is the source for available models and reasoning efforts. Higher reasoning is not evidence of better report quality. Deterministic local-only mode requires no model calls.

Run `npm ci && npm run ci` for tests, lint, JavaScript/type checks, documentation links and package inspection. The suite uses fixtures; it does not prove generated narrative quality or inspect your personal sessions.

## Verified locally in this refresh

On 14 November 2026, the source candidate passed 128 JavaScript tests, 20 synthetic CLI/browser journeys, lint, typechecking and documentation/package checks. Hosted Node 22/24/26 tests and CodeQL passed on the merged source. Earlier plugin validation passed; this documentation refresh does not change the plugin. See [app-server compatibility](app-server-compatibility.md) for the separately verified live collection and discovery limits. Windows runtime support and model-quality benchmarks remain unverified.

npm `latest` is **0.7.0** as checked on this date; `main` identifies the **0.7.1 candidate**. Installing the registry package does not install unreleased source fixes.
