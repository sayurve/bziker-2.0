"""A city renovation relocates feet, never player progress or private rooms."""
import math
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from game import GameService
from world import BOATS, INTERIORS, WORLD_MAP, WorldService, nearest_city_position
import world


class SourceMapMigrationTests(unittest.TestCase):
    def test_schema_22_uses_its_own_landmarks_before_repairing_the_new_floor(self):
        anchors = WORLD_MAP | {
            'previous_landmarks_v21': {'station': {'x': 10, 'y': 10}},
            'previous_landmarks_v22': {'station': {'x': 500, 'y': 600}},
            'landmarks': {'station': {'x': 1500, 'y': 1600}},
        }
        with patch.object(world, 'WORLD_MAP', anchors), patch.object(world, 'nearest_city_position', side_effect=lambda x, y: (x, y)):
            self.assertEqual(world.migrated_city_position(512, 617, source_version=22), (1512, 1617))

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.game = GameService(Path(self.tmp.name) / 'migration.db')
        self.previous_map = json.loads((Path(__file__).resolve().parent.parent /
                                        'web' / 'world-layout-v18.json').read_text())
        self.assertEqual(self.previous_map['schema_version'], 18)
        self.users = [self.game.create_account() for _ in range(4)]
        for i, uid in enumerate(self.users):
            self.game.profile(uid, {'name': f'Renovation {i}', 'avatar': {'gender': i % 2}})

    def legacy_position(self, db, uid, point, scene='city', sid=None, **state):
        values = {'pose': 'idle', 'bench_id': None, 'pose_until': None,
                  'phone_open': 0, 'sit_since': None} | state
        db.execute('''INSERT OR REPLACE INTO presence
            (account_id,x,y,scene,scene_id,updated,pose,bench_id,pose_until,phone_open,sit_since)
            VALUES (?,?,?,?,?,1000,?,?,?,?,?)''',
            (uid, point['x'], point['y'], scene, sid, *values.values()))
        db.execute('INSERT OR REPLACE INTO world_positions VALUES (?,?,?,?,?)',
                   (uid, point['x'], point['y'], scene, sid))

    def mark_previous_map(self, db):
        db.execute("UPDATE world_metadata SET value=? WHERE key='map_version'",
                   (str(self.previous_map['schema_version']),))

    def reopen(self):
        return WorldService(GameService(self.game.db_path), clock=lambda: 1000)

    def test_original_schema_five_station_and_plaza_keep_their_semantic_destination(self):
        original = json.loads((Path(__file__).resolve().parent.parent / 'web' / 'world-layout-v16.json').read_text())
        self.assertEqual(original['schema_version'], 5)
        with self.game.transaction() as db:
            db.execute("UPDATE world_metadata SET value='5' WHERE key='map_version'")
            for uid, name in zip(self.users, ('station', 'plaza')):
                self.legacy_position(db, uid, original['landmarks'][name], pose='phone', phone_open=1)
        self.reopen()
        with self.game.transaction() as db:
            for uid, name in zip(self.users, ('station', 'plaza')):
                expected = nearest_city_position(**WORLD_MAP['landmarks'][name])
                for table in ('presence', 'world_positions'):
                    row = db.execute(f'SELECT x,y FROM {table} WHERE account_id=?', (uid,)).fetchone()
                    self.assertEqual((row['x'], row['y']), expected, (table, name))
                self.assertEqual(db.execute('SELECT phone_open FROM presence WHERE account_id=?', (uid,)).fetchone()[0], 1)

    def test_original_schema_six_and_eighteen_use_their_own_semantic_anchors(self):
        root = Path(__file__).resolve().parent.parent / 'web'
        for version, filename in ((6, 'world-layout-v17-sparse.json'), (18, 'world-layout-v18.json')):
            with self.subTest(saved_map_version=version):
                original = json.loads((root / filename).read_text())
                self.assertEqual(original['schema_version'], version)
                with self.game.transaction() as db:
                    db.execute("UPDATE world_metadata SET value=? WHERE key='map_version'", (str(version),))
                    for uid, name in zip(self.users, ('station', 'plaza')):
                        self.legacy_position(db, uid, original['landmarks'][name], pose='phone', phone_open=1)
                self.reopen()
                with self.game.transaction() as db:
                    for uid, name in zip(self.users, ('station', 'plaza')):
                        expected = nearest_city_position(**WORLD_MAP['landmarks'][name])
                        for table in ('presence', 'world_positions'):
                            row = db.execute(f'SELECT x,y FROM {table} WHERE account_id=?', (uid,)).fetchone()
                            self.assertEqual((row['x'], row['y']), expected, (table, name))
                        self.assertEqual(db.execute('SELECT phone_open FROM presence WHERE account_id=?', (uid,)).fetchone()[0], 1)

    def test_semantic_locations_preserve_offsets_phone_and_saved_positions(self):
        names = ('station', 'park', 'archive', 'district')
        with self.game.transaction() as db:
            self.mark_previous_map(db)
            for uid, name in zip(self.users, names):
                old = self.previous_map['landmarks'][name]
                self.legacy_position(db, uid, {'x': old['x'] + 12, 'y': old['y'] + 17},
                    scene='district' if name == 'district' else 'city',
                    pose='phone', phone_open=1, bench_id='retired-seat-' + name,
                    pose_until=1200, sit_since=950)
        self.reopen()
        with self.game.transaction() as db:
            for uid, name in zip(self.users, names):
                new = WORLD_MAP['landmarks'][name]
                expected = nearest_city_position(new['x'] + 12, new['y'] + 17)
                p = dict(db.execute('SELECT * FROM presence WHERE account_id=?', (uid,)).fetchone())
                retained = dict(db.execute('SELECT * FROM world_positions WHERE account_id=?', (uid,)).fetchone())
                self.assertEqual((p['x'], p['y']), expected, name)
                self.assertEqual((retained['x'], retained['y']), expected, name)
                self.assertEqual((p['scene'], p['scene_id'], p['phone_open'], p['pose']), ('city', None, 1, 'phone'))
                self.assertIsNone(p['bench_id'])
                self.assertIsNone(p['sit_since'])
                self.assertIsNone(p['pose_until'])
            self.assertEqual(db.execute("SELECT value FROM world_metadata WHERE key='map_version'").fetchone()[0],
                             str(WORLD_MAP['schema_version']))

    def test_far_landmark_offsets_are_bounded_before_collision_repair(self):
        migrate = getattr(world, 'migrated_city_position', None)
        self.assertTrue(callable(migrate), 'Migration needs an explicit semantic coordinate transform')
        previous = WORLD_MAP['previous_landmarks']['station']
        current = WORLD_MAP['landmarks']['station']
        # Isolate the station anchor: after a new city composition another old
        # landmark may be closer to this intentionally far-off coordinate.
        single_anchor_map = WORLD_MAP | {'previous_landmarks': {'station': previous}}
        with patch.object(world, 'WORLD_MAP', single_anchor_map), patch.object(world, 'nearest_city_position', side_effect=lambda x, y: (x, y)):
            point = migrate(previous['x'] - 100000, previous['y'] - 100000)
        self.assertLessEqual(math.dist(point, (current['x'], current['y'])), 160.001)
        self.assertGreater(math.dist(point, (current['x'], current['y'])), 0)

    def test_private_rooms_and_progress_survive_while_boats_return_to_new_docks(self):
        base_uid, room_uid, city_uid, _ = self.users
        room = next(room for room in INTERIORS.values() if room['seats'])
        seat = room['seats'][0]
        room_point = seat['seat']
        base_json = '{"items":[{"id":"chair","type":"chair","x":2,"y":2}],"exterior_locked":true,"exterior_color":"#111111"}'
        with self.game.transaction() as db:
            self.mark_previous_map(db)
            db.execute('INSERT INTO clans VALUES (?,?,?,?,?,?,?,?)',
                ('retained-clan', 'Retained Clan', '#111111', '!', base_uid, base_json, 'active', 'base-1'))
            db.execute('INSERT INTO clan_members VALUES (?,?)', (base_uid, 'retained-clan'))
            db.execute('INSERT INTO clan_results VALUES (?,?,?,?)', ('finished-match', 'retained-clan', '600', 1))
            db.execute('UPDATE wallets SET balance=237 WHERE account_id=?', (base_uid,))
            db.execute('INSERT INTO inventory VALUES (?,?,?)', (base_uid, 'snack', 3))
            db.execute('INSERT INTO quest_claims VALUES (?,?)', (base_uid, 'firstprofile'))
            self.legacy_position(db, base_uid, {'x': 620, 'y': 650}, 'base', 'retained-clan',
                                 pose='phone', phone_open=1, bench_id='base:retained-clan:chair', sit_since=940)
            self.legacy_position(db, room_uid, room_point, 'interior', room['id'],
                                 pose='phone', phone_open=1, bench_id=seat['id'], sit_since=950)
            self.legacy_position(db, city_uid, self.previous_map['landmarks']['dock'], pose='boat')
            db.execute('UPDATE world_boats SET x=7440,y=4100,occupant_id=?,updated=1000 WHERE id=?',
                       (city_uid, next(iter(BOATS))))
            original = {table: [tuple(row) for row in db.execute(f'SELECT * FROM {table}')]
                        for table in ('accounts', 'wallets', 'inventory', 'quest_claims', 'clans', 'clan_members', 'clan_results')}
            positions = {uid: dict(db.execute('SELECT * FROM presence WHERE account_id=?', (uid,)).fetchone())
                         for uid in (base_uid, room_uid)}
        self.reopen()
        with self.game.transaction() as db:
            for table, values in original.items():
                self.assertEqual([tuple(row) for row in db.execute(f'SELECT * FROM {table}')], values, table)
            for uid, position in positions.items():
                self.assertEqual(dict(db.execute('SELECT * FROM presence WHERE account_id=?', (uid,)).fetchone()), position)
            for row in db.execute('SELECT * FROM world_boats'):
                dock = BOATS[row['id']]['dock']
                self.assertEqual((row['x'], row['y'], row['occupant_id'], row['updated']),
                                 (dock['x'], dock['y'], None, None))
            self.assertEqual(db.execute('SELECT pose FROM presence WHERE account_id=?', (city_uid,)).fetchone()[0], 'idle')

    def test_current_map_restart_does_not_reset_boats_seats_or_phone(self):
        uid = self.users[0]
        slot = WORLD_MAP['benches'][0]
        point = slot['seat']
        with self.game.transaction() as db:
            self.legacy_position(db, uid, point, pose='sit', phone_open=1, bench_id=slot['id'], sit_since=950)
            before = dict(db.execute('SELECT * FROM presence WHERE account_id=?', (uid,)).fetchone())
            boat_uid = self.users[1]
            db.execute('UPDATE world_boats SET x=x+10,occupant_id=?,updated=1000 WHERE id=?', (boat_uid, next(iter(BOATS))))
            old = dict(db.execute('SELECT * FROM world_boats WHERE occupant_id=?', (boat_uid,)).fetchone())
        self.reopen()
        with self.game.transaction() as db:
            self.assertEqual(dict(db.execute('SELECT * FROM world_boats WHERE occupant_id=?', (boat_uid,)).fetchone()), old)
            self.assertEqual(dict(db.execute('SELECT * FROM presence WHERE account_id=?', (uid,)).fetchone()), before)


if __name__ == '__main__':
    unittest.main()
