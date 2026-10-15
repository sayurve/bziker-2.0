import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
def module(name):
 spec=importlib.util.spec_from_file_location(name,ROOT/'tools'/f'{name}.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
class ProjectToolTests(unittest.TestCase):
 def test_skills_install_is_idempotent_and_never_overwrites_other_skill(self):
  m=module('install-skills')
  with tempfile.TemporaryDirectory() as d:
   self.assertEqual(len(m.install(d)),3);self.assertEqual(m.install(d),m.install(d))
  with tempfile.TemporaryDirectory() as d:
   target=Path(d)/'skills'/m.NAMES[0];target.mkdir(parents=True);(target/'keep').write_text('user')
   with self.assertRaises(ValueError):m.install(d)
   self.assertEqual((target/'keep').read_text(),'user')
 def test_skills_metadata_is_present_and_scoped(self):
  self.assertEqual(len(module('check-project').check_skills()),3)
 def test_launcher_resolves_new_project_not_original(self):
  self.assertEqual(module('run').ROOT,ROOT)
if __name__=='__main__':unittest.main()
