# Shareable Codex profile

[Live example](https://mangeshraut712.github.io/codex-insights/) · [Install or update `$insights`](install.md)

Codex Insights can export a static profile page that opens in any browser. It uses only aggregate fields from an existing local `report.json`: analyzed session count, total tokens, duration, model counts, and dates on which sessions ended. It does not include thread titles, project paths, prompts, transcript text, or report narratives. The export is a snapshot, not a live account feed.

## Create and review

```bash
codex-session-insights report --local-only --days 0 --no-open
codex-session-insights profile --name "Your name" --handle your-handle
```

The page is written to `~/.codex/usage-data/profile/index.html`. Open it locally and review the displayed values before sharing. A report's scope and coverage carry through to the page; an incomplete report produces incomplete profile totals. Run the two commands again to refresh the snapshot.

To use a different report or output location:

```bash
codex-session-insights profile --report-json ./report.json --out-dir ./public-profile --name "Your name"
```

## Put it on the web with GitHub Pages

1. Create a repository for your public profile, such as `codex-profile`.
2. Copy only the generated `index.html` into the repository root and push it. Do not copy `report.json` or `report.html`.
3. In the repository's **Settings → Pages**, choose **Deploy from a branch**, your branch, and **/(root)**, then save.
4. Once GitHub reports that the site is live, share `https://YOUR-USERNAME.github.io/codex-profile/`.

GitHub's [Pages publishing-source guide](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) confirms that a branch root can be a publishing source, and its [site setup guide](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site) requires an `index.html` entry file. Pages sites are public, including on supported private-repository plans. To update your profile, regenerate `index.html` and push the replacement. Remove the Pages source or repository to unpublish it.

The HTML is self-contained and can also be uploaded to another static host. No account credentials, sync service, or tracking backend are built into this feature.
