"""The reusable migration witness must not disclose or ignore business rows."""
import importlib.util
import contextlib
import hashlib
import io
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parent.parent / 'scripts' / 'check-migration-preservation.py'
spec = importlib.util.spec_from_file_location('migration_preservation_check', SCRIPT)
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)


class MigrationPreservationCheckTests(unittest.TestCase):
    def test_full_migration_opens_unicode_space_backup_read_only_and_preserves_it(self):
        from server import make_server
        from world import WORLD_MAP

        with tempfile.TemporaryDirectory(prefix='Бзикер архив ') as directory:
            source = Path(directory) / 'резервная база #1.db'
            report_path = Path(directory) / 'проверка сохранений.json'
            server = make_server('127.0.0.1', 0, source)
            try:
                uid = server.game.create_account()
                server.game.profile(uid, {'name': 'PrivateMigrationWitness', 'avatar': {}})
                with server.game.transaction() as db:
                    db.execute('UPDATE wallets SET balance=237 WHERE account_id=?', (uid,))
                    db.execute('INSERT INTO inventory VALUES (?,?,?)', (uid, 'snack', 3))
                    db.execute("UPDATE world_metadata SET value='5' WHERE key='map_version'")
                    station = WORLD_MAP['previous_landmarks_v5']['station']
                    db.execute('INSERT INTO world_positions VALUES (?,?,?,?,?)',
                               (uid, station['x'], station['y'], 'city', None))
                    db.execute('''INSERT INTO presence
                        (account_id,x,y,scene,scene_id,updated,pose,bench_id,pose_until,phone_open,sit_since)
                        VALUES (?,?,?,'city',NULL,1000,'phone',NULL,NULL,1,NULL)''',
                               (uid, station['x'], station['y']))
            finally:
                server.server_close()
            before_bytes = source.read_bytes()
            with sqlite3.connect(source) as db:
                before = check.snapshot(db)

            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                result = check.main(['--expected-map-sha', check.sha(check.ROOT / 'web/world-map.json'),
                                     '--source', str(source), '--report', str(report_path), '--final-geometry'])

            self.assertEqual(result, 0)
            self.assertEqual(source.read_bytes(), before_bytes)
            with sqlite3.connect(source) as db:
                self.assertEqual(check.snapshot(db), before)
                self.assertEqual(db.execute("SELECT value FROM world_metadata WHERE key='map_version'").fetchone()[0], '5')
            report = json.loads(report_path.read_text())
            self.assertTrue(report['all_business_tables_unchanged'])
            self.assertTrue(report['source_bytes_unchanged'])
            self.assertTrue(report['geometry_unchanged_during_check'])
            self.assertEqual(report['unexpected_changes'], [])
            self.assertEqual(report['source_saved_map_version'], 5)
            self.assertEqual(report['target_map_version'], WORLD_MAP['schema_version'])
            self.assertEqual(report['geometry_verification_status'], 'verified_final_snapshot')
            self.assertEqual(report['source_integrity_check'], 'ok')
            self.assertEqual(report['clone_integrity_check'], 'ok')
            self.assertGreater(report['business_rows_checked'], 0)
            for private in (uid, 'PrivateMigrationWitness'):
                self.assertNotIn(private, report_path.read_text())
                self.assertNotIn(private, output.getvalue())

    def test_report_cannot_overwrite_the_read_only_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'web').mkdir()
            map_path = root / 'web/world-map.json'
            map_path.write_text('{}')
            digest = hashlib.sha256(map_path.read_bytes()).hexdigest()
            (root / 'web/city-collisions.json').write_text(json.dumps({'map_sha256': digest, 'obstacles': []}))
            source = root / 'backup.db'
            source.write_bytes(b'source bytes must remain untouched')
            before = source.read_bytes()
            with patch.object(check, 'ROOT', root), contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit) as error:
                    check.main(['--expected-map-sha', digest, '--source', str(source), '--report', str(source)])
            self.assertEqual(error.exception.code, 2)
            self.assertEqual(source.read_bytes(), before)

    def test_all_row_values_and_duplicate_rows_affect_the_witness(self):
        with sqlite3.connect(':memory:') as db:
            db.execute('CREATE TABLE messages (body TEXT, opaque BLOB)')
            db.executemany('INSERT INTO messages VALUES (?,?)', [('private-text', b'private-token')] * 2)
            original = check.snapshot(db)
            self.assertEqual(original['messages']['rows'], 2)
            self.assertNotIn('private-text', str(original))
            self.assertNotIn('private-token', str(original))
            db.execute('UPDATE messages SET body=? WHERE rowid=1', ('different-private-text',))
            changed = check.snapshot(db)
            self.assertNotEqual(original['messages']['sha256'], changed['messages']['sha256'])
            self.assertEqual(check.compare_snapshots(original, changed)[2], ['messages'])
            db.execute('DELETE FROM messages WHERE rowid=2')
            self.assertEqual(check.snapshot(db)['messages']['rows'], 1)

    def test_row_order_is_irrelevant_but_only_four_runtime_tables_are_exempt(self):
        with sqlite3.connect(':memory:') as db:
            db.execute('CREATE TABLE accounts (id TEXT)')
            db.executemany('INSERT INTO accounts VALUES (?)', [('a',), ('b',)])
            original = check.snapshot(db)
            db.execute('DELETE FROM accounts')
            db.executemany('INSERT INTO accounts VALUES (?)', [('b',), ('a',)])
            self.assertEqual(original, check.snapshot(db))
            for table in ('presence', 'world_positions', 'world_boats', 'world_metadata', 'active_accounts'):
                db.execute(f'CREATE TABLE {table} (value INTEGER)')
                db.execute(f'INSERT INTO {table} VALUES (1)')
            original = check.snapshot(db)
            for table in ('presence', 'world_positions', 'world_boats', 'world_metadata', 'active_accounts'):
                db.execute(f'UPDATE {table} SET value=2')
            business, runtime, unexpected = check.compare_snapshots(original, check.snapshot(db))
            self.assertEqual({item['table'] for item in runtime}, set(check.RUNTIME_TABLES))
            self.assertEqual(unexpected, ['active_accounts'])
            self.assertEqual({item['table'] for item in business}, {'accounts', 'active_accounts'})


if __name__ == '__main__':
    unittest.main()
