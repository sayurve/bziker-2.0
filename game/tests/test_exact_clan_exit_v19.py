import tempfile
import unittest
from pathlib import Path

from clan_fixtures import legacy_home
from game import GameService
from world import WorldService, DISTRICT_BUILDINGS, WORLD_MAP, nearest_city_position


class ExactClanExitTests(unittest.TestCase):
    def test_leaving_native_clan_home_remembers_its_actual_front_door_after_restart(self):
        with tempfile.TemporaryDirectory() as temp:
            game = GameService(Path(temp) / 'exit.db')
            world = WorldService(game, clock=lambda: 1000)
            uid = game.create_account()
            game.profile(uid, {'name': 'NativeExit'})
            cid = world.create_clan(uid, {'name': 'Native Home', 'color': '#336699', 'flag': 'N'})['id']
            house = DISTRICT_BUILDINGS[0]
            legacy_home(game, cid, house['id'])
            world.move(uid, {'scene': 'base', **WORLD_MAP['base']['spawn']})
            world.mutate_clan(uid, cid, 'leave', {})
            expected = dict(zip(('x', 'y'), nearest_city_position(house['door']['x'], house['door']['y'] + 24)))
            snapshot = world.snapshot(uid)
            self.assertEqual(snapshot['scene'], 'city')
            self.assertEqual(snapshot['position'], expected)
            restarted = WorldService(GameService(game.db_path), clock=lambda: 1001)
            self.assertEqual(restarted.snapshot(uid)['position'], expected)
            with game.transaction() as db:
                saved = db.execute('SELECT x,y,scene,scene_id FROM world_positions WHERE account_id=?', (uid,)).fetchone()
                self.assertEqual((saved['x'], saved['y'], saved['scene'], saved['scene_id']), (expected['x'], expected['y'], 'city', None))
