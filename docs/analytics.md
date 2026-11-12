# Adoption analytics

The machine-readable [snapshot](adoption.json) records its UTC retrieval time and source URLs. It contains public aggregate counts only; the installer sends no tracking events.

- **Stars and forks:** current GitHub repository counters, not people actively using the skill.
- **Release asset downloads:** sum across every page of GitHub releases. This excludes source archives, repository clones and npm downloads. Repeat downloads are included.
- **npm downloads:** the npm API’s last-month window, including its start/end dates when available. Downloads are not unique users or successful installs. A missing package is `not_published` and its download value is `null`, never an invented zero.
- API failures abort refresh and preserve the previous snapshot. Its date stays unchanged. Registry existence does not establish package quality or successful invocation.

Refresh from the repository root with `npm run metrics` (Python 3.9+, authenticated GitHub CLI and network access required). Review and commit `docs/adoption.json`; update any dated README summary from the same snapshot. No recurring job is installed.

The metrics do not establish better contribution acceptance rates, model accuracy or time savings. Those require a defined comparison dataset and reproducible evaluation. Fixture tests demonstrate supported behavior only.
