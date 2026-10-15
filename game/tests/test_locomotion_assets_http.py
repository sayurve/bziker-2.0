"""Locomotion modules and PNGs keep explicit, confined unauthenticated routes."""
import http.client
from pathlib import Path
import tempfile
import threading
import unittest

from server import ROOT, make_server


class LocomotionAssetsHTTPTests(unittest.TestCase):
    def test_motion_module_aliases_and_specific_asset_prefix_without_opening_other_paths(self):
        module = (ROOT / 'web/locomotion-actors-data.js').read_bytes()
        png = (ROOT / 'assets/canonical-idle-v2/male-right-fine.png').read_bytes()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'web').mkdir()
            (root / 'web/locomotion-actors-data.js').write_bytes(module)
            for folder in ['locomotion-v27', 'unrelated-private']:
                (root / 'assets' / folder).mkdir(parents=True)
                (root / 'assets' / folder / 'route-proof.png').write_bytes(png)
            (root / 'assets/locomotion-v27/private.json').write_text('{"private":true}')
            server = make_server('127.0.0.1', 0, root / 'qa.db', web_root=root)
            worker = threading.Thread(target=server.serve_forever, daemon=True)
            worker.start()

            def get(path):
                connection = http.client.HTTPConnection(*server.server_address, timeout=3)
                try:
                    connection.request('GET', path)
                    response = connection.getresponse()
                    return response.status, response.getheader('Content-Type'), response.read()
                finally:
                    connection.close()

            try:
                for alias in ['/locomotion-actors-data.js', '/web/locomotion-actors-data.js']:
                    status, content_type, data = get(alias)
                    self.assertEqual(status, 200, alias)
                    self.assertIn('javascript', content_type)
                    self.assertEqual(data, module)
                status, content_type, data = get('/assets/locomotion-v27/route-proof.png')
                self.assertEqual(status, 200)
                self.assertEqual(content_type, 'image/png')
                self.assertEqual(data, png)
                for blocked in ['/assets/unrelated-private/route-proof.png',
                                '/assets/locomotion-v27/private.json',
                                '/assets/locomotion-v27/../unrelated-private/route-proof.png',
                                '/assets/locomotion-v27/%2e%2e/qa.db',
                                '/assets/locomotion-v27/nested/route-proof.png']:
                    self.assertEqual(get(blocked)[0], 404, blocked)
            finally:
                server.shutdown()
                server.server_close()
                worker.join(timeout=5)


if __name__ == '__main__':
    unittest.main()
