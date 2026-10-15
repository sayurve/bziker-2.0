"""Approved public source modules/fonts have explicit routes, not filesystem access."""
import http.client
import tempfile
import threading
import unittest
from pathlib import Path

from server import make_server

MODULES = ('design-data.js', 'design-assets.js', 'source-city.js', 'source-ui.js',
           'source-ui.css', 'source-actors.js', 'source-actors-data.js',
           'source-interiors.js', 'source-water.js', 'source-house-materials.js',
           'supplemental-environment.js', 'lake-walkways.js')


class SourceStaticTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        (root / 'web').mkdir()
        (root / 'assets').mkdir()
        for name in MODULES + ('private-source.js',):
            (root / 'web' / name).write_text('/* ' + name + ' */')
        for name in ('design-ui-font.ttf', 'design-ui-font.woff2', 'private.py', 'private.json'):
            (root / 'assets' / name).write_bytes(b'fixture')
        self.server = make_server('127.0.0.1', 0, root / 'game.db', web_root=root)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop)

    def stop(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def req(self, path):
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=3)
        connection.request('GET', path)
        response = connection.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        connection.close()
        return result

    def test_approved_modules_load_at_root_and_web_aliases(self):
        for name in MODULES:
            for prefix in ('/', '/web/'):
                status, headers, body = self.req(prefix + name)
                self.assertEqual(status, 200, prefix + name)
                self.assertIn(name.encode(), body)
                self.assertIn('css' if name.endswith('.css') else 'javascript', headers['Content-Type'])

    def test_fonts_are_public_but_unknown_modules_and_data_stay_private(self):
        for font in ('design-ui-font.ttf', 'design-ui-font.woff2'):
            status, headers, body = self.req('/assets/' + font)
            self.assertEqual(status, 200, font)
            self.assertEqual(body, b'fixture')
            self.assertIn('font', headers['Content-Type'])
        for path in ('/web/private-source.js', '/private-source.js', '/assets/private.py',
                     '/assets/private.json', '/assets/../game.db', '/assets/%2e%2e/game.db',
                     '/web/../game.db', '/game.db'):
            self.assertEqual(self.req(path)[0], 404, path)


if __name__ == '__main__':
    unittest.main()
