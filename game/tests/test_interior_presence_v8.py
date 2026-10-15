"""Room renovation keeps occupants and their phones in the same physical room."""
import copy
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch

from game import GameService
from server import STATIC
from world import (CITY_SPAWN, INTERIORS, INTERIOR_SEATS, WORLD_MAP, WorldService,
                   initialize_schema, valid_position)


class InteriorPresenceV8Tests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.game = GameService(Path(self.temp.name) / 'room-presence.db')
        self.now = 1000
        self.world = WorldService(self.game, clock=lambda: self.now)
        self.users = [self.game.create_account() for _ in range(3)]
        for index, uid in enumerate(self.users):
            self.game.profile(uid, {'name': 'Room Renovation ' + str(index)})
        self.native_room = copy.deepcopy(INTERIORS['messages'])
        self.ids = ['interior:messages:fixture-seat-1', 'interior:messages:fixture-seat-2']
        self.points = [{'x': 155, 'y': 458}, {'x': 205, 'y': 458}]
        # These algorithm cases deliberately renovate a complete synthetic
        # legacy room. Never combine its 900x680 coordinates with the current
        # modular room's unrelated bounds, walls or furniture supports.
        self.room = {'id': 'messages', 'kind': 'cafe', 'label': 'Renovation fixture',
                     'width': 900, 'height': 680,
                     'bounds': {'left': 28, 'right': 872, 'top': 78, 'bottom': 652},
                     'spawn': {'x': 450, 'y': 620}, 'exit': {'x': 450, 'y': 630},
                     'action': {'x': 450, 'y': 300, 'id': 'messages', 'label': 'Messages'},
                     'props': [], 'solids': [], 'seats': [], 'zones': []}

    def seed(self, uid, x, y, *, seat=None, phone=False, room_id='messages'):
        pose = 'sit' if seat else 'phone' if phone else 'idle'
        with self.game.transaction() as db:
            db.execute('''INSERT OR REPLACE INTO presence
                (account_id,x,y,scene,scene_id,updated,pose,bench_id,pose_until,phone_open,sit_since)
                VALUES (?,?,?,'interior',?,?,?, ?,NULL,?,?)''',
                (uid, x, y, room_id, self.now, pose, seat, int(phone), self.now-15 if seat else None))
            db.execute("INSERT OR REPLACE INTO world_positions VALUES (?,?,?,'interior',?)",
                       (uid, x, y, room_id))

    @contextmanager
    def renovated(self, *, obstruct=False):
        room = copy.deepcopy(self.room)
        room['solids'] = [{'x': 120, 'y': 444, 'width': 140, 'height': 36, 'prop_id': 'new-sofa'}]
        seats = {self.ids[0]: ('messages', 180, 480), self.ids[1]: ('messages', 230, 480)}
        room['props'] = [{'id': 'new-sofa', 'type': 'sofa', 'x': 120, 'y': 444,
                          'width': 140, 'height': 36, 'solid': True}]
        room['seats'] = [{'id': sid, 'prop_id': 'new-sofa', 'seat': {'x': x, 'y': y},
                          'approach': {'x': x, 'y': y+30}, 'facing': 'down'}
                         for sid, (_, x, y) in seats.items()]
        if obstruct:
            room['solids'].append({'x': 480, 'y': 530, 'width': 140, 'height': 70, 'prop_id': 'new-display'})
        with patch.dict(INTERIORS, {'messages': room}), patch.dict(INTERIOR_SEATS, seats):
            yield room, seats

    def assert_seat(self, uid, seat_id, point, phone):
        with self.game.transaction() as db:
            row = db.execute('SELECT * FROM presence WHERE account_id=?', (uid,)).fetchone()
            self.assertEqual((row['x'], row['y']), point[1:])
            self.assertEqual((row['scene'], row['scene_id']), ('interior', 'messages'))
            self.assertEqual(row['bench_id'], seat_id)
            self.assertEqual(row['pose'], 'sit')
            self.assertEqual(row['phone_open'], int(phone))
            self.assertEqual(row['sit_since'], self.now-15)
            saved = db.execute('SELECT * FROM world_positions WHERE account_id=?', (uid,)).fetchone()
            self.assertEqual((saved['x'], saved['y']), point[1:])

    def test_live_occupied_seats_follow_stable_ids_and_preserve_phone_and_timer(self):
        for uid, seat_id, point in zip(self.users, self.ids, self.points):
            self.seed(uid, **point, seat=seat_id, phone=uid == self.users[0])
        self.seed(self.users[2], 450, 568)
        with self.renovated() as (_, seats):
            snapshot = self.world.snapshot(self.users[2])
            for uid, seat_id in zip(self.users, self.ids):
                self.assert_seat(uid, seat_id, seats[seat_id], uid == self.users[0])
                visible = next(peer for peer in snapshot['players'] if peer['id'] == uid)
                self.assertEqual((visible['x'], visible['y']), seats[seat_id][1:])
                self.assertEqual(visible['bench_id'], seat_id)
                self.assertEqual(visible['pose'], 'sit')

    def test_startup_map_migration_preserves_interior_seat_and_phone(self):
        self.seed(self.users[0], **self.points[0], seat=self.ids[0], phone=True)
        with self.game.transaction() as db:
            db.execute("UPDATE world_metadata SET value=? WHERE key='map_version'",
                       (str(WORLD_MAP['schema_version']-1),))
        with self.renovated() as (_, seats):
            with self.game.transaction() as db:
                initialize_schema(db)
            self.assert_seat(self.users[0], self.ids[0], seats[self.ids[0]], True)

    def test_obstructed_standing_peer_moves_locally_and_keeps_open_phone(self):
        self.seed(self.users[0], 500, 560, phone=True)
        self.seed(self.users[2], 450, 568)
        with self.renovated(obstruct=True) as (room, _):
            snapshot = self.world.snapshot(self.users[2])
            peer = next(player for player in snapshot['players'] if player['id'] == self.users[0])
            self.assertTrue(valid_position('interior', peer['x'], peer['y'], 'messages'))
            self.assertEqual((peer['scene'], peer['scene_id']), ('interior', 'messages'))
            self.assertLessEqual(((peer['x']-500)**2+(peer['y']-560)**2)**.5, 45)
            self.assertNotEqual({'x': peer['x'], 'y': peer['y']}, room['spawn'])
            self.assertEqual(peer['pose'], 'phone')
            self.assertTrue(peer['phone_open'])
            with self.game.transaction() as db:
                saved = db.execute('SELECT * FROM world_positions WHERE account_id=?', (self.users[0],)).fetchone()
                self.assertEqual((saved['x'], saved['y']), (peer['x'], peer['y']))

    def test_retained_obstructed_position_restores_locally_after_restart(self):
        self.seed(self.users[0], 500, 560)
        with self.game.transaction() as db:
            db.execute('DELETE FROM presence WHERE account_id=?', (self.users[0],))
        with self.renovated(obstruct=True):
            with self.game.transaction() as db:
                initialize_schema(db)
            snapshot = self.world.snapshot(self.users[0])
            self.assertEqual(snapshot['scene_id'], 'messages')
            self.assertTrue(valid_position('interior', **snapshot['position'], scene_id='messages'))
            self.assertLessEqual(((snapshot['position']['x']-500)**2+(snapshot['position']['y']-560)**2)**.5, 45)
            self.assertEqual(snapshot['pose'], 'idle')

    def test_out_of_bounds_repair_uses_nearest_room_edge_not_entrance(self):
        self.seed(self.users[0], -3, 240, phone=True)
        with self.renovated():
            snapshot = self.world.snapshot(self.users[0])
            self.assertEqual(snapshot['scene_id'], 'messages')
            self.assertEqual(snapshot['position']['y'], 240)
            self.assertLessEqual(snapshot['position']['x'], 42)
            self.assertTrue(snapshot['phone_open'])

    def test_removed_room_falls_back_to_city_and_clears_stale_seat_timer(self):
        self.seed(self.users[0], 155, 458, seat='interior:removed:bench-1:seat-1', phone=True, room_id='removed')
        with self.game.transaction() as db:
            initialize_schema(db)
            row = db.execute('SELECT * FROM presence WHERE account_id=?', (self.users[0],)).fetchone()
            self.assertEqual((row['scene'], row['scene_id']), ('city', None))
            self.assertIsNone(row['bench_id'])
            self.assertFalse(row['phone_open'])
            self.assertIsNone(row['sit_since'])
            saved = db.execute('SELECT * FROM world_positions WHERE account_id=?', (self.users[0],)).fetchone()
            self.assertEqual((saved['scene'], saved['scene_id']), ('city', None))
        snapshot = self.world.snapshot(self.users[0])
        self.assertEqual(snapshot['scene'], 'city')
        self.assertIsNone(snapshot['scene_id'])
        self.assertEqual(snapshot['position'], dict(zip(('x', 'y'), CITY_SPAWN)))
        self.assertFalse(snapshot['phone_open'])
        with self.game.transaction() as db:
            row = db.execute('SELECT bench_id,sit_since FROM presence WHERE account_id=?', (self.users[0],)).fetchone()
            self.assertIsNone(row['bench_id'])
            self.assertIsNone(row['sit_since'])

    def test_wrong_room_seat_claim_is_released_without_teleport_or_phone_loss(self):
        foreign = next(sid for sid, seat in INTERIOR_SEATS.items() if seat[0] == 'railway')
        point = self.native_room['spawn']
        self.assertTrue(valid_position('interior', **point, scene_id='messages'))
        self.seed(self.users[0], **point, seat=foreign, phone=True)
        snapshot = self.world.snapshot(self.users[0])
        self.assertEqual(snapshot['position'], point)
        self.assertEqual(snapshot['scene_id'], 'messages')
        self.assertIsNone(snapshot['bench_id'])
        self.assertEqual(snapshot['pose'], 'phone')
        self.assertTrue(snapshot['phone_open'])

    def test_valid_standing_position_is_unchanged_by_room_renovation(self):
        self.seed(self.users[0], 500, 560, phone=True)
        with self.renovated():
            snapshot = self.world.snapshot(self.users[0])
            self.assertEqual(snapshot['position'], {'x': 500, 'y': 560})
            self.assertTrue(snapshot['phone_open'])

    def test_legacy_seated_phone_pose_is_preserved_when_its_seat_moves(self):
        self.seed(self.users[0], **self.points[0], seat=self.ids[0], phone=True)
        with self.game.transaction() as db:
            db.execute("UPDATE presence SET pose='phone' WHERE account_id=?", (self.users[0],))
        with self.renovated() as (_, seats):
            snapshot = self.world.snapshot(self.users[0])
            self.assertEqual(snapshot['pose'], 'phone')
            self.assertEqual(snapshot['bench_id'], self.ids[0])
            self.assertTrue(snapshot['phone_open'])
            self.assertEqual(snapshot['position'], dict(zip(('x', 'y'), seats[self.ids[0]][1:])))

    def test_repaired_interior_peers_are_not_rewritten_on_following_snapshots(self):
        self.seed(self.users[0], **self.points[0], seat=self.ids[0], phone=True)
        self.seed(self.users[2], 450, 568)
        statements = []
        original = self.game.transaction
        @contextmanager
        def traced():
            with original() as db:
                db.set_trace_callback(statements.append)
                yield db
        with self.renovated():
            self.world.snapshot(self.users[2])
            self.game.transaction = traced
            self.world.snapshot(self.users[2])
            self.world.snapshot(self.users[2])
        self.assertFalse(any(sql.upper().startswith('UPDATE PRESENCE SET X=') for sql in statements), statements)

    def test_100_room_occupants_do_not_add_per_player_selects(self):
        statements = []
        original = self.game.transaction
        @contextmanager
        def traced():
            with original() as db:
                db.set_trace_callback(statements.append)
                yield db
        point = self.native_room['spawn']
        self.assertTrue(valid_position('interior', **point, scene_id='messages'))
        self.seed(self.users[0], **point)
        self.game.transaction = traced
        self.world.snapshot(self.users[0])
        one = sum(sql.lstrip().upper().startswith('SELECT') for sql in statements)
        self.game.transaction = original
        users = self.users + [self.game.create_account() for _ in range(97)]
        for index, uid in enumerate(users[3:], 3):
            self.game.profile(uid, {'name': 'Room Budget ' + str(index)})
        with self.game.transaction() as db:
            for uid in users:
                db.execute('''INSERT OR REPLACE INTO presence(account_id,x,y,scene,scene_id,updated)
                              VALUES (?,?,?,'interior','messages',?)''',
                           (uid, point['x'], point['y'], self.now))
                db.execute('INSERT OR REPLACE INTO active_accounts VALUES (?,?)', (uid, self.now))
            db.execute("INSERT OR REPLACE INTO world_positions SELECT account_id,x,y,scene,scene_id FROM presence")
        statements.clear()
        self.game.transaction = traced
        snapshot = self.world.snapshot(self.users[0])
        hundred = sum(sql.lstrip().upper().startswith('SELECT') for sql in statements)
        self.assertEqual(len(snapshot['players']), 100)
        self.assertEqual(snapshot['online_count'], 100)
        self.assertLessEqual(hundred, one+2, (one, hundred, statements))

    def test_interior_prop_module_has_both_explicit_static_routes(self):
        self.assertEqual(STATIC.get('/web/interior-props.js'), 'web/interior-props.js')
        self.assertEqual(STATIC.get('/interior-props.js'), 'web/interior-props.js')


if __name__ == '__main__':
    unittest.main()
