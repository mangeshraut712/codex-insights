#!/usr/bin/env python3
"""Refresh public, aggregate adoption data. Never reads account/session history."""
import datetime
import json
from pathlib import Path
import subprocess
import urllib.error
import urllib.parse
import urllib.request


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'skill-adoption-report'})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return None
        raise


def github(path):
    return json.loads(subprocess.check_output(['gh', 'api', path], text=True, timeout=60))


def main():
    root = Path(__file__).resolve().parent.parent
    package = json.loads((root / 'package.json').read_text())
    repo = package['repository']['url'].removeprefix('git+').removeprefix('https://github.com/').removesuffix('.git')
    checked = datetime.datetime.now(datetime.timezone.utc).isoformat()
    info = github('repos/' + repo)
    assets = 0
    page = 1
    while True:
        releases = github(f'repos/{repo}/releases?per_page=100&page={page}')
        for release in releases:
            assets += sum(asset['download_count'] for asset in release['assets'])
        if len(releases) < 100:
            break
        page += 1
    encoded = urllib.parse.quote(package['name'], safe='')
    registry_url = 'https://registry.npmjs.org/' + encoded
    registry = fetch(registry_url)
    downloads_url = 'https://api.npmjs.org/downloads/point/last-month/' + encoded
    downloads = fetch(downloads_url) if registry is not None else None
    data = {
        'checked_at': checked,
        'repository': repo,
        'github': {'source': 'https://api.github.com/repos/' + repo,
                   'stars': info['stargazers_count'], 'forks': info['forks_count'],
                   'release_asset_downloads_lifetime': assets},
        'npm': {'package': package['name'], 'source': registry_url,
                'status': 'published' if registry is not None else 'not_published',
                'downloads_source': downloads_url, 'last_month': downloads},
    }
    # Fetches complete before replacing the snapshot; network failures never become zeros.
    target = root / 'docs/adoption.json'
    temporary = target.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(data, indent=2) + '\n')
    temporary.replace(target)
    print(json.dumps(data, indent=2))


if __name__ == '__main__':
    main()
