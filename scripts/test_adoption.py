import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

SPEC = importlib.util.spec_from_file_location('adoption', Path(__file__).with_name('update-adoption.py'))
adoption = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(adoption)


class AdoptionTests(unittest.TestCase):
    def test_only_404_means_missing(self):
        with patch.object(adoption.urllib.request, 'urlopen', side_effect=urllib.error.HTTPError('https://example.com', 404, 'missing', {}, None)):
            self.assertIsNone(adoption.fetch('https://example.com'))
        for code in (401, 403, 429, 500):
            with self.subTest(code=code), patch.object(adoption.urllib.request, 'urlopen', side_effect=urllib.error.HTTPError('https://example.com', code, 'error', {}, None)):
                with self.assertRaises(urllib.error.HTTPError):
                    adoption.fetch('https://example.com')

    def test_missing_package_keeps_downloads_unknown_and_paginates(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'scripts').mkdir()
            (root / 'docs').mkdir()
            (root / 'package.json').write_text(json.dumps({'name': '@owner/pkg', 'repository': {'url': 'git+https://github.com/owner/repo.git'}}))
            responses = [{'stargazers_count': 2, 'forks_count': 3}, [{'assets': [{'download_count': 4}]}] * 100, [{'assets': [{'download_count': 1}]}]]
            with patch.object(adoption, '__file__', str(root / 'scripts/update-adoption.py')), patch.object(adoption, 'github', side_effect=responses), patch.object(adoption, 'fetch', return_value=None) as fetch, patch('sys.stdout', new=io.StringIO()):
                adoption.main()
            snapshot = json.loads((root / 'docs/adoption.json').read_text())
            self.assertEqual(snapshot['github']['release_asset_downloads_lifetime'], 401)
            self.assertEqual(snapshot['npm']['status'], 'not_published')
            self.assertIsNone(snapshot['npm']['last_month'])
            self.assertEqual(fetch.call_count, 1)

    def test_network_error_does_not_replace_previous_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'scripts').mkdir()
            (root / 'docs').mkdir()
            (root / 'package.json').write_text(json.dumps({'name': '@owner/pkg', 'repository': {'url': 'https://github.com/owner/repo.git'}}))
            target = root / 'docs/adoption.json'
            target.write_text('previous snapshot')
            with patch.object(adoption, '__file__', str(root / 'scripts/update-adoption.py')), patch.object(adoption, 'github', side_effect=TimeoutError('network')):
                with self.assertRaises(TimeoutError):
                    adoption.main()
            self.assertEqual(target.read_text(), 'previous snapshot')


if __name__ == '__main__':
    unittest.main()
