"""The transfer archive must not contain local databases or depend on the author's paths."""
import hashlib
import importlib.util
import json
import sqlite3
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]


def module(name,file):
    spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/file)
    result=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


packager=module('bziker_package_handoff','package-handoff.py')
backup_module=module('bziker_backup_db','backup-db.py')


class HandoffPackageTests(unittest.TestCase):
    def fixture(self,parent):
        source=parent/'source';source.mkdir()
        for name,content in {
            '.gitignore':'data/\n.env\n','README.md':'portable game', 'server.py':'# server fixture\n',
            '.env.example':'AUTH_MODE=demo\n','.env':'PRIVATE_ENV_SENTINEL',
            'data/game.db':'PRIVATE_DATABASE_SENTINEL','node_modules/private/index.js':'PRIVATE_DEP_SENTINEL',
            'assets/native.png':'native source bytes','web/app.js':'export const fixture=true;',
            'docs/report.md':'verification','docs/proof.png':'optional proof',
            'assets/avatar-builder-desktop.png':'unrelated preview',
        }.items():
            file=source/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_text(content)
        native=source/'assets/native.png';digest=hashlib.sha256(native.read_bytes()).hexdigest()
        assets={'city-source-map':{'source':'source/city.png','url':'/assets/native.png','source_sha256':digest}}
        for suffix in ['floor-board','floor-parquet','floor-concrete','floor-tile','floor-stone','floor-metal',
                       'wall-plaster','wall-brick','wall-concrete','wall-wood','wall-stone','wall-metal']:
            assets['clan-surface-'+suffix+'-texture']={'source':'source/'+suffix+'.png','url':'/assets/native.png','source_sha256':digest}
        (source/'docs/design-source-v17.json').write_text(json.dumps({'assets':assets}))
        rooms=[{'source_scene':{'asset_id':f'room{i}','source_file':f'source/room{i}.png',
                               'url':'/assets/native.png','sha256':digest}} for i in range(5)]
        (source/'web/interiors-map-v19.json').write_text(json.dumps({'rooms':rooms}))
        return source

    def test_archive_is_reproducible_and_excludes_private_data_and_unrelated_previews(self):
        with tempfile.TemporaryDirectory() as temporary:
            parent=Path(temporary);source=self.fixture(parent)
            with patch.object(packager,'ROOT',source):
                first=packager.build(parent/'first',parent/'first.zip')
                second=packager.build(parent/'second',parent/'second.zip')
            self.assertEqual((parent/'first.zip').read_bytes(),(parent/'second.zip').read_bytes())
            self.assertEqual(first['native_reference_count'],18)
            with zipfile.ZipFile(parent/'first.zip') as archived:
                names=archived.namelist();contents=b''.join(archived.read(n) for n in names)
            for marker in [b'PRIVATE_ENV_SENTINEL',b'PRIVATE_DATABASE_SENTINEL',b'PRIVATE_DEP_SENTINEL']:
                self.assertNotIn(marker,contents)
            self.assertNotIn('bziker/docs/proof.png',names)
            self.assertNotIn('bziker/assets/avatar-builder-desktop.png',names)
            self.assertIn('bziker/.env.example',names)
            self.assertFalse(first['publication_performed'])
            self.assertEqual(first,second)

    def test_existing_output_and_export_inside_source_are_rejected_without_changes(self):
        with tempfile.TemporaryDirectory() as temporary:
            parent=Path(temporary);source=self.fixture(parent)
            target=parent/'existing';target.mkdir();(target/'kept').write_text('keep')
            with patch.object(packager,'ROOT',source):
                with self.assertRaises(FileExistsError):packager.build(target)
                with self.assertRaises(ValueError):packager.build(source/'dist')
            self.assertEqual((target/'kept').read_text(),'keep')
            self.assertFalse((source/'dist').exists())

    def test_final_archive_excludes_installed_dependencies_and_git_and_includes_passed_report(self):
        with tempfile.TemporaryDirectory() as temporary:
            parent=Path(temporary);source=self.fixture(parent);output=parent/'output'
            with patch.object(packager,'ROOT',source):packager.build(output)
            (output/'node_modules').mkdir();(output/'node_modules/private').write_text('PRIVATE_DEP_SENTINEL')
            (output/'.git').mkdir();(output/'.git/private').write_text('PRIVATE_GIT_SENTINEL')
            report=parent/'report.json';report.write_text(json.dumps({'passed':True,'live_database_included':False}))
            packager.finalize(output,parent/'final.zip',report)
            with zipfile.ZipFile(parent/'final.zip') as archived:
                contents=b''.join(archived.read(n) for n in archived.namelist())
                self.assertIn('bziker/HANDOFF-VERIFICATION.json',archived.namelist())
            self.assertNotIn(b'PRIVATE_DEP_SENTINEL',contents)
            self.assertNotIn(b'PRIVATE_GIT_SENTINEL',contents)

    def test_final_archive_refuses_modified_code_or_a_failed_report(self):
        with tempfile.TemporaryDirectory() as temporary:
            parent=Path(temporary);source=self.fixture(parent);output=parent/'output'
            with patch.object(packager,'ROOT',source):packager.build(output)
            report=parent/'report.json';report.write_text(json.dumps({'passed':False,'live_database_included':False}))
            with self.assertRaises(ValueError):packager.finalize(output,parent/'final.zip',report)
            self.assertFalse((parent/'final.zip').exists())
            (output/'server.py').write_text('changed after verification')
            with self.assertRaises(ValueError):packager.finalize(output,parent/'final.zip')
            self.assertFalse((parent/'final.zip').exists())

    def test_portable_source_test_keeps_original_hash_and_pixel_checks(self):
        for name in ['exact-city-scene-v19.test.mjs','source-surface-textures-v17.test.mjs','source-exact-interiors-v19.test.mjs']:
            source=(ROOT/'tests'/name).read_bytes()
            transformed,changed=packager.portable_text('tests/'+name,source)
            # The exported copies are already adapted, so repackaging is also valid.
            if b'$LOCAL_WORKSPACE/' in source:self.assertTrue(changed)
            self.assertNotIn(b'/Users/',transformed)
            self.assertIn(b'source-reference',transformed)
            self.assertEqual(source.count(b'sha256'),transformed.count(b'sha256'))
            self.assertEqual(source.count(b'assert.'),transformed.count(b'assert.'))

    def test_backup_is_consistent_read_only_and_never_overwrites(self):
        with tempfile.TemporaryDirectory() as temporary:
            parent=Path(temporary);source=parent/'game.db';target=parent/'backup.db'
            with sqlite3.connect(source) as db:
                db.execute('CREATE TABLE fixture (value TEXT)')
                db.execute('INSERT INTO fixture VALUES (?)',('progress',))
            before=source.read_bytes()
            backup_module.backup(source,target)
            self.assertEqual(source.read_bytes(),before)
            with sqlite3.connect(target) as db:
                self.assertEqual(db.execute('SELECT value FROM fixture').fetchone()[0],'progress')
                self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0],'ok')
            with self.assertRaises(FileExistsError):backup_module.backup(source,target)
            self.assertEqual(source.read_bytes(),before)


if __name__=='__main__':unittest.main()
