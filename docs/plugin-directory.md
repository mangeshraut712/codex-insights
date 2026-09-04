# Codex plugin directory contract

`$insights` is packaged the same way official Codex plugins are packaged: a plugin root with `.codex-plugin/plugin.json`, a skill that has `SKILL.md` plus `agents/openai.yaml`, storefront assets, and the plugin-creator validator from `openai/codex`.

This repository is a **community** marketplace (`codex-insights`). It is not the OpenAI-curated catalog (`openai-curated` / the Codex official tab). That tab is reserved for plugins OpenAI publishes. Matching the contract is the prerequisite for a directory review; it does not place the plugin on that tab.

## Manifest

`plugin/codex-insights/.codex-plugin/plugin.json` uses only keys the official validator accepts. It does **not** include `hooks` or `interface.brandColorDark` (those appear in some listed plugins and are rejected by current ingestion).

Required storefront fields this package fills:

- `interface.displayName`, `shortDescription`, `longDescription`, `developerName`, `category`
- `interface.capabilities`: official tokens `Interactive` and `Read` (no `Write`; reports do not edit the repo)
- `interface.defaultPrompt`: at most 3 strings, each ≤128 characters, written to scan near 50 characters
- `interface.websiteURL`, `privacyPolicyURL`, `termsOfServiceURL` as absolute `https://` URLs
- `interface.brandColor` `#0F766E`, `composerIcon`, `logo`, `logoDark`, and `screenshots: []` (same empty list official Expo / Figma / Codex Security listings ship)

`developerName` stays `mangeshraut712`. Do not set it to `OpenAI`.

## Marketplace

`.agents/plugins/marketplace.json` follows the official marketplace sample:

- top-level `name` and `interface.displayName`
- each plugin entry has `policy.installation`, `policy.authentication`, and `category`
- `authentication` is `ON_USE` (no OAuth; same as other local Codex-only listings)
- `policy.products` is `["CODEX"]`

## Skill

`skills/insights/SKILL.md` is an Agent Skill: `name`, `description` (when and when not, ≤1024, no `<>`), `license`, string-only `metadata`. `agents/openai.yaml` sets `interface.display_name`, `short_description`, `brand_color`, icons, and `policy.allow_implicit_invocation: true`. `disable-model-invocation` is not set.

## Validate

The official scripts are vendored at `scripts/validate_plugin.py` and `scripts/identifier_validation.py`:

```bash
python3 -m pip install pyyaml
python3 scripts/validate_plugin.py plugin/codex-insights
```

`npm test` runs that validator. Regenerating storefront PNGs (needs Chrome or Chromium):

```bash
npm run generate:plugin-assets
```

## Listing

Users install from this GitHub marketplace:

```bash
codex plugin marketplace add mangeshraut712/codex-insights
codex plugin add codex-insights@codex-insights
```

A submission to `openai/plugins` is a separate review by OpenAI. This repo does not open that pull request as an official OpenAI plugin.
