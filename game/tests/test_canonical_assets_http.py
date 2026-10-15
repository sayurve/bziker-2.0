"""Serve the actual exported PNGs without widening the file allowlist."""
import http.client
from pathlib import Path
import tempfile
import threading
import unittest

from server import make_server


class CanonicalAssetsHTTPTests(unittest.TestCase):
    def test_exports_and_module_aliases_are_served_but_paths_stay_confined(self):
        root = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as tmp:
            server = make_server('127.0.0.1', 0, Path(tmp) / 'qa.db')
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
                for png in sorted((root / 'assets/canonical-idle-v2').glob('*.png')):
                    with self.subTest(path=png.name):
                        status, content_type, data = get('/assets/canonical-idle-v2/' + png.name)
                        self.assertEqual(status, 200)
                        self.assertEqual(content_type, 'image/png')
                        self.assertEqual(data, png.read_bytes())
                        self.assertTrue(data.startswith(b'\x89PNG\r\n\x1a\n'))
                self.assertEqual(len(list((root / 'assets/canonical-idle-v2').glob('*.png'))), 16)
                module = (root / 'web/canonical-actors-data.js').read_bytes()
                for alias in ('/canonical-actors-data.js', '/web/canonical-actors-data.js'):
                    self.assertEqual(get(alias)[2], module)
                    self.assertEqual(get(alias)[0], 200)
                for blocked in ('/assets/canonical-idle-v2/../../server.py',
                                '/assets/canonical-idle-v2/%2e%2e/server.py',
                                '/assets/other/private.png', '/assets/canonical-idle-v2/secret.txt'):
                    self.assertEqual(get(blocked)[0], 404, blocked)
            finally:
                server.shutdown()
                server.server_close()
                worker.join(timeout=5)


if __name__ == '__main__':
    unittest.main()
