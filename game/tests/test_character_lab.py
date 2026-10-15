"""The standalone lab and its imports must be served without changing API routes."""
import unittest
import http.client
import tempfile
import threading
from pathlib import Path
from server import STATIC,ROOT,make_server

class CharacterLabTests(unittest.TestCase):
    def test_lab_entrypoint_and_styles_are_explicit(self):
        for alias,target in {'/character-lab':'web/character-lab.html','/character-lab.html':'web/character-lab.html','/web/character-lab.html':'web/character-lab.html','/character-lab.js':'web/character-lab.js','/web/character-lab.js':'web/character-lab.js','/character-lab.css':'web/character-lab.css','/web/character-lab.css':'web/character-lab.css'}.items():
            self.assertEqual(STATIC.get(alias),target)
            self.assertTrue((ROOT/target).is_file())
    def test_every_character_module_has_required_aliases(self):
        for path in (ROOT/'web/character-system').glob('*.js'):
            target=path.relative_to(ROOT).as_posix()
            for alias in ('/'+path.name,'/character-system/'+path.name,'/'+target):
                self.assertEqual(STATIC.get(alias),target)

    def test_actual_http_lab_is_available_without_session_cookie(self):
        with tempfile.TemporaryDirectory() as folder:
            server=make_server('127.0.0.1',0,Path(folder)/'isolated-lab-qa.db')
            thread=threading.Thread(target=server.serve_forever,daemon=True)
            thread.start()
            try:
                for route in ('/character-lab','/web/character-lab.js','/web/character-lab.css','/character-system/clock.js','/asset-loader.js'):
                    connection=http.client.HTTPConnection(*server.server_address,timeout=3)
                    connection.request('GET',route)
                    response=connection.getresponse()
                    payload=response.read()
                    self.assertEqual(response.status,200,route)
                    self.assertIsNone(response.getheader('Set-Cookie'),route)
                    self.assertTrue(payload,route)
                    connection.close()
            finally:
                server.shutdown()
                server.server_close()
                thread.join()

if __name__=='__main__':unittest.main()
