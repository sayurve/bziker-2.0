"""Native modular room geometry keeps existing authenticated room mechanics."""
import tempfile
import unittest
from pathlib import Path

from game import GameError, GameService
from world import INTERIORS, WorldService, nearest_interior_position, valid_position


class ModularInteriorV20Tests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.game = GameService(Path(self.temp.name) / 'modular-room.db')
        self.uid = self.game.create_account()
        self.game.profile(self.uid, {'name': 'Modular Room Fixture'})
        self.now = 1000
        self.world = WorldService(self.game, clock=lambda: self.now)

    def enter_fixture(self, room, point=None):
        """Start inside an authored room; no city path or admission guard is patched."""
        point = point or room['spawn']
        self.assertTrue(valid_position('interior', point['x'], point['y'], room['id']))
        with self.game.transaction() as db:
            db.execute("""INSERT OR REPLACE INTO presence
                (account_id,x,y,scene,scene_id,updated,pose,phone_open)
                VALUES (?,?,?,'interior',?,?,'idle',0)""",
                (self.uid, point['x'], point['y'], room['id'], self.now))
            db.execute("INSERT OR REPLACE INTO world_positions VALUES (?,?,?,'interior',?)",
                       (self.uid, point['x'], point['y'], room['id']))

    def test_phone_preserves_all_eleven_authored_room_positions_and_retained_progress(self):
        profile = self.game.bootstrap(self.uid)['profile']
        for room in INTERIORS.values():
            with self.subTest(room=room['id']):
                self.enter_fixture(room)
                before = self.world.snapshot(self.uid)
                result = self.world.activity(self.uid, {'action': 'phone', 'open': True})
                self.assertEqual(result['position'], before['position'])
                self.assertEqual((result['scene'], result['scene_id']), ('interior', room['id']))
                self.assertTrue(result['phone_open'])
                with self.game.transaction() as db:
                    saved = db.execute('SELECT * FROM world_positions WHERE account_id=?', (self.uid,)).fetchone()
                    self.assertEqual((saved['x'], saved['y'], saved['scene_id']), (room['spawn']['x'], room['spawn']['y'], room['id']))
                self.assertEqual(self.game.bootstrap(self.uid)['profile'], profile)

    def test_every_native_seat_remains_usable_and_phone_preserves_its_pose_and_timer(self):
        for room in INTERIORS.values():
            for seat in room['seats']:
                with self.subTest(room=room['id'], seat=seat['id']):
                    self.enter_fixture(room, seat['approach'])
                    result = self.world.activity(self.uid, {'action': 'sit', 'bench_id': seat['id']})
                    self.assertEqual(result['position'], seat['seat'])
                    self.assertEqual(result['bench_id'], seat['id'])
                    self.assertEqual(result['pose'], 'sit')
                    opened = self.world.activity(self.uid, {'action': 'phone', 'open': True})
                    self.assertEqual(opened['position'], seat['seat'])
                    self.assertEqual(opened['bench_id'], seat['id'])
                    self.assertEqual(opened['pose'], 'sit')
                    with self.game.transaction() as db:
                        row = db.execute('SELECT * FROM presence WHERE account_id=?', (self.uid,)).fetchone()
                        self.assertEqual(row['sit_since'], self.now)
                        self.assertTrue(row['phone_open'])
                    stood = self.world.activity(self.uid, {'action': 'stand'})
                    self.assertEqual(stood['pose'], 'idle')
                    self.assertIsNone(stood['bench_id'])

    def test_native_support_collision_and_room_ownership_guards_remain_active(self):
        for room in INTERIORS.values():
            with self.subTest(room=room['id']):
                self.enter_fixture(room)
                service = next(p for p in room['props'] if p['id']==room['action']['prop_id'])
                inside = dict(scene='interior', interior_id=room['id'], x=service['x']+service['width']/2, y=service['y']+service['height']/2)
                with self.assertRaises(GameError):
                    self.world.move(self.uid, inside)
                self.assertEqual(self.world.snapshot(self.uid)['position'], room['spawn'])
                other = next(r for r in INTERIORS.values() if r['id']!=room['id'])
                with self.assertRaises(GameError):
                    self.world.move(self.uid, dict(scene='interior', interior_id=other['id'], **other['spawn']))
                self.assertEqual(self.world.snapshot(self.uid)['scene_id'], room['id'])

    def test_native_seller_feet_are_authoritative_solids_without_closing_the_service_aisle(self):
        for room in INTERIORS.values():
            with self.subTest(room=room['id']):
                staff = room['staff']
                feet = next((s for s in room['solids'] if s['prop_id']=='staff'), None)
                self.assertIsNotNone(feet, 'The visible seller must occupy its foot support')
                self.assertEqual(staff['footprint'], {k: feet[k] for k in ('x', 'y', 'width', 'height')})
                self.assertEqual(feet['x']+feet['width']/2, staff['visual']['x'])
                self.assertEqual(feet['y']+feet['height'], staff['visual']['y'])
                start = {'x': staff['x'], 'y': staff['y']+30}
                self.enter_fixture(room, start)
                with self.assertRaises(GameError):
                    self.world.move(self.uid, dict(scene='interior', interior_id=room['id'],
                        x=staff['x'], y=feet['y']+feet['height']/2))
                self.assertEqual(self.world.snapshot(self.uid)['position'], start)
                # A short path goes around the feet, then returns to the real
                # front service position. Neither the counter nor seller moves.
                for point in [{'x':staff['x']+40,'y':start['y']},
                              {'x':staff['x']+40,'y':feet['y']-30},
                              {'x':staff['x']+40,'y':start['y']},
                              dict(zip(('x','y'), nearest_interior_position(room, room['action']['x'], room['action']['y'])))]:
                    # Earlier fixtures put the point of a foot immediately
                    # next to the counter. A whole foot support needs 14px.
                    point = dict(zip(('x','y'), nearest_interior_position(room, point['x'], point['y'])))
                    result = self.world.move(self.uid, dict(scene='interior', interior_id=room['id'],
                        x=point['x'], y=point['y']))
                    self.assertEqual(result['position'], {'x':point['x'],'y':point['y']})


if __name__=='__main__':unittest.main()
