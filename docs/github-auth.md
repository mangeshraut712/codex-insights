# GitHub auth for owner pushes

Users installing `$insights` do not need this. It is only for pushing to `mangeshraut712/codex-insights` from a Cursor environment.

Pushes to `mangeshraut712/*` return HTTP 403 when git is rewritten to `cursor[bot]`. The owner API is healthy: `GET /user` and `GET /repos/mangeshraut712/codex-insights` return **HTTP 200**, login `mangeshraut712`, and `permissions.push` is true.

Cursor environments rewrite every `https://github.com/` URL to an `x-access-token` for `cursor[bot]`. That token can fetch public repositories. It cannot push this repository.

`gh auth login --with-token` may still refuse a classic PAT that lacks `read:org`. Git push does not need that extra scope.

## One-time re-oauth

Use a `mangeshraut712` token with `repo` (fine-grained: Contents read/write on this repository):

```bash
export GH_TOKEN=YOUR_GITHUB_TOKEN
bash scripts/setup-github-auth.sh
unset GH_TOKEN GITHUB_TOKEN
bash scripts/check-github-auth.sh
git push -u origin HEAD
```

The setup script:

1. Checks `GET /user` for HTTP 200 and login `mangeshraut712`
2. Stores the token at `~/.config/codex-insights/github.token` (mode 600)
3. Installs a **longer** identity `insteadOf` for `https://github.com/mangeshraut712/` so it wins over the bot rewrite **without putting the token in git config**
4. Installs a credential helper that answers only for `github.com/mangeshraut712`
5. Rewrites a tokenized `origin` remote back to `https://github.com/mangeshraut712/<repo>.git`

Keep remotes as `https://github.com/mangeshraut712/codex-insights.git`. Do not embed tokens in remote URLs, commits, or pull requests.

Re-run the setup script after a new token, a wiped `~/.gitconfig`, or another 403. Empty `GH_TOKEN=` still counts as set for `gh`; always `unset GH_TOKEN GITHUB_TOKEN` before `git push` in Cursor shells.

## Checks

```bash
bash scripts/check-github-auth.sh
```

Manual API check (prints only the status code):

```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $(< "${XDG_CONFIG_HOME:-$HOME/.config}/codex-insights/github.token")" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/user
```

Expect `200`. `git remote -v` for origin should show `https://github.com/mangeshraut712/codex-insights.git` with no `x-access-token`.
