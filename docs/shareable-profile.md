# Shareable Codex profile

[Live example](https://mangeshraut712.github.io/codex-insights/) · [Install or update `$insights`](install.md)

The Codex app has a profile under **Settings → Profile**, but it is private: only you can see it. Codex Insights exports the same numbers as a static page you can publish.

The page shows lifetime tokens, peak daily tokens, longest chat, current and longest streak, a daily/weekly/cumulative token activity chart, activity insights (Fast mode share, most used reasoning effort, skills explored, total skills used, total chats), and your most used skills and plugins. It does not include thread titles, project paths, prompts, transcript text, or report narratives. It is a snapshot, not a live feed.

## Create and review

```bash
codex-session-insights profile
```

This writes `~/.codex/usage-data/profile/index.html` and `profile.json`. Name and handle default to your Codex display name and username; override them with `--name "Your name" --handle your-handle`. Open the page and review it before sharing. Run the command again to refresh the snapshot.

### Where the numbers come from

| `--source` | Data |
| --- | --- |
| `auto` (default) | Account stats; falls back to the local report if you are not signed in with ChatGPT |
| `account` | Account stats only; fails instead of falling back |
| `local` | `~/.codex/usage-data/report.json` from this machine only |

Account stats come from the Codex app-server (`account/usage/read`) and the Codex profile endpoint on `chatgpt.com`, using the sign-in Codex already stored. If only the app-server responds, the stats row and chart are filled and the activity insights panels say they were unavailable.

A local-report profile reflects that report's scope and coverage, so it is not an account-wide total:

```bash
codex-session-insights report --local-only --days 0 --no-open
codex-session-insights profile --source local --report-json ./report.json --out-dir ./public-profile
```

## Put it on the web with GitHub Pages

1. Create a repository for your public profile, such as `codex-profile`.
2. Copy the generated `index.html` (and `profile.json` if you want a machine-readable copy for leaderboards or other sites) into the repository root and push it. Do not copy `report.json` or `report.html`.
3. In the repository's **Settings → Pages**, choose **Deploy from a branch**, your branch, and **/(root)**, then save.
4. Once GitHub reports that the site is live, share `https://YOUR-USERNAME.github.io/codex-profile/`.

GitHub's [Pages publishing-source guide](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) confirms that a branch root can be a publishing source, and its [site setup guide](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site) requires an `index.html` entry file. Pages sites are public, including on supported private-repository plans. To update your profile, regenerate `index.html` and push the replacement. Remove the Pages source or repository to unpublish it.

The HTML is self-contained and can also be uploaded to another static host. The exported files contain no credentials, and there is no sync service or tracking backend.
