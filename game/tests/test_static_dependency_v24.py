"""Every local browser import must be reachable through the explicit allowlist."""
import re
import unittest
from pathlib import Path
from server import ROOT, STATIC


class StaticDependencyV24Tests(unittest.TestCase):
    def test_all_browser_module_dependencies_have_both_public_aliases(self):
        missing=[]
        for file in sorted(set(STATIC.values())):
            if not file.endswith('.js'):
                continue
            source=(ROOT/file).read_text()
            for relative in re.findall(r"(?:from\s*|import\s*)['\"](\./[^'\"]+)['\"]",source):
                dependency=(Path(file).parent/relative).as_posix()
                for alias in ('/'+Path(dependency).name,'/'+dependency):
                    if STATIC.get(alias)!=dependency:
                        missing.append((file,relative,alias))
        self.assertEqual(missing,[],f'Browser startup cannot load these modules: {missing}')


if __name__=='__main__':unittest.main()
