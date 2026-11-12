# Compatibility and validation — November 2026

Use maintained LTS runtimes. [Node’s release table](https://nodejs.org/en/about/previous-releases) lists Node 22, 24 and 26 as LTS in November 2026; Node 18 and 20 are end-of-life. Repository constraints take precedence over upgrading an upstream contributor’s toolchain just because a newer version exists.

## Codex Insights

The CLI requires Node 22.22.2+, Node 24.15+ or Node 26+. The interactive dependencies are Inquirer Prompts 8.8 and Ora 10. Development uses TypeScript 7, ESLint 10 and Node 26 type declarations. A targeted minimatch 11 override addresses [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) while retaining supported ESLint; keep it under review when ESLint updates its own dependency range.

The Codex plugin includes its wrapper, manifest, skill and assets. Copying only SKILL.md loses the wrapper. Install the plugin using the documented marketplace route and open a new thread. LaunchAgent scheduling is macOS-specific and remains opt-in; installation does not authorize publishing a profile.

Model defaults are pinned behavior, not a claim to use the newest or best model. Use the supported CLI model overrides only with models available to your account. Codex [app-server model/list](https://learn.chatgpt.com/docs/app-server) is the source for available models and reasoning efforts. Higher reasoning is not evidence of better report quality. Deterministic local-only mode requires no model calls.

Run `npm ci && npm run ci` for tests, lint, JavaScript/type checks, documentation links and package inspection. The suite uses fixtures; it does not prove generated narrative quality or inspect your personal sessions.

## Verified locally in this refresh

On macOS with Node 26.13.0: 114 JavaScript tests passed, ESLint 10 passed, TypeScript 7 passed, syntax/documentation checks passed, both skill metadata validators passed, and package preview includes documentation and screenshots. Three analytics tests cover missing packages, pagination, and preserving old snapshots on network failures. npm audit reported zero vulnerabilities for the locked dependency tree. No private session collection or model-quality benchmark was run.
