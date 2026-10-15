"""Fixture tests for standalone material import and integrity verification."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

PROJECT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('materials_import', PROJECT / 'tools/import-materials.py')
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)

class MaterialsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.source = Path(self.tmp.name) / 'source'
        self.dest = Path(self.tmp.name) / 'dest'
        self.source.mkdir()
        self.dest.mkdir()
        for name, data in {
            '01_Окружение/asset.png': b'actual image fixture',
            'AGENTS.md': b'reference instructions',
            '.secret': b'private', '01_Окружение/.DS_Store': b'cache',
            'Phaser/generated/library.json': b'{}',
            'Phaser/game/server.db': b'private database',
            'Phaser/verification/phaser-test.db': b'private database',
            'Phaser/verification/qa-users.json': b'credentials',
            'Phaser/verification/server.log': b'private log',
            'Phaser/verification/files.json': b'{"passed":true}',
            'Phaser/redrawn-frames-v1/hero/prompt.txt': b'preserve prompt',
            'Phaser/redrawn-frames-v1/hero/frame.png': b'draft frame',
        }.items():
            p=self.source/name; p.parent.mkdir(parents=True, exist_ok=True); p.write_bytes(data)

    def run_cli(self, tool, *extra, ok=True):
        p=subprocess.run([sys.executable,str(PROJECT/'tools'/tool),'--source',str(self.source),'--dest',str(self.dest),*extra],capture_output=True,text=True)
        if ok: self.assertEqual(p.returncode,0,p.stdout+p.stderr)
        else: self.assertNotEqual(p.returncode,0,p.stdout+p.stderr)
        return p

    def test_import_and_full_hash_verification(self):
        self.run_cli('import-materials.py')
        self.run_cli('verify-materials.py')
        copied=self.dest/'materials/Bziker/01_Окружение/asset.png'
        self.assertEqual(copied.read_bytes(),b'actual image fixture')
        self.assertNotEqual(copied.stat().st_ino,(self.source/'01_Окружение/asset.png').stat().st_ino)
        for rel in ['.secret','01_Окружение/.DS_Store','Phaser/game','Phaser/verification/phaser-test.db','Phaser/verification/qa-users.json','Phaser/verification/server.log']:
            self.assertFalse((self.dest/'materials/Bziker'/rel).exists(),rel)
        self.assertEqual((self.dest/'art/drafts/redrawn-frames-v1/hero/prompt.txt').read_bytes(),b'preserve prompt')
        status=json.loads((self.dest/'art/drafts/materials-draft-status.json').read_text())
        self.assertFalse(status['art_approved'])
        copied.write_bytes(b'corruption')
        self.run_cli('verify-materials.py',ok=False)

    def test_existing_content_is_never_overwritten(self):
        p=self.dest/'materials/Bziker';p.mkdir(parents=True);(p/'mine.txt').write_text('retain')
        self.run_cli('import-materials.py',ok=False)
        self.assertEqual((p/'mine.txt').read_text(),'retain')

    def test_symlink_is_rejected_before_copy(self):
        (self.source/'linked.png').symlink_to(self.source/'01_Окружение/asset.png')
        self.run_cli('import-materials.py',ok=False)
        self.assertFalse((self.dest/'materials/Bziker/AGENTS.md').exists())

    def test_manifest_traversal_is_rejected(self):
        self.run_cli('import-materials.py')
        p=self.dest/'verification/materials-manifest.json';d=json.loads(p.read_text())
        d['files'][0]['path']='../outside';p.write_text(json.dumps(d))
        self.run_cli('verify-materials.py',ok=False)

    def test_standalone_verification_without_original(self):
        self.run_cli('import-materials.py')
        self.source.rename(self.source.with_name('original-is-unavailable'))
        p=subprocess.run([sys.executable,str(PROJECT/'tools/verify-materials.py'),'--dest',str(self.dest)],capture_output=True,text=True)
        self.assertEqual(p.returncode,0,p.stdout+p.stderr)
        report=json.loads((self.dest/'verification/materials-verification.json').read_text())
        self.assertFalse(report['source_comparison_performed'])
        self.assertIsNone(report['source_unchanged'])

    def test_extra_draft_file_is_reported(self):
        self.run_cli('import-materials.py')
        (self.dest/'art/drafts/redrawn-frames-v1/unexpected.png').write_bytes(b'unlisted')
        self.run_cli('verify-materials.py',ok=False)

    def test_source_change_is_reported(self):
        self.run_cli('import-materials.py')
        (self.source/'01_Окружение/asset.png').write_bytes(b'changed source')
        self.run_cli('verify-materials.py',ok=False)

    def test_copied_hardlink_is_rejected(self):
        self.run_cli('import-materials.py')
        p=self.dest/'materials/Bziker/01_Окружение/asset.png'
        p.unlink();p.hardlink_to(self.source/'01_Окружение/asset.png')
        self.run_cli('verify-materials.py',ok=False)

    def test_extra_copied_file_is_reported(self):
        self.run_cli('import-materials.py')
        (self.dest/'materials/Bziker/unexpected.txt').write_text('unexpected')
        self.run_cli('verify-materials.py',ok=False)

    def test_dest_inside_source_is_rejected(self):
        self.dest=self.source/'nested';self.dest.mkdir()
        self.run_cli('import-materials.py',ok=False)

if __name__=='__main__': unittest.main()
