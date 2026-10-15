import tempfile
import unittest
from pathlib import Path
from game import GameService
from world import WORLD_MAP, INTERIORS, WorldService


class StationV11Tests(unittest.TestCase):
    def test_station_entry_exit_and_saved_city_position_survive_restart(self):
        with tempfile.TemporaryDirectory() as tmp:
            game = GameService(Path(tmp) / 'station.db')
            world = WorldService(game, clock=lambda: 1000)
            uid = game.create_account()
            game.profile(uid, {'name': 'Station V11'})
            self.assertEqual(world.snapshot(uid)['position'], WORLD_MAP['spawn'])
            station = next(b for b in WORLD_MAP['buildings'] if b['id'] == 'railway')
            self.assertEqual(station['door'], INTERIORS['railway']['door'])
            self.assertEqual(world.enter(uid, {'building_id': 'railway'})['interior_id'], 'railway')
            room = INTERIORS['railway']
            world.move(uid, {'scene': 'interior', 'interior_id': 'railway', **room['exit']})
            exit_position = {'x': station['door']['x'], 'y': station['door']['y'] + 24}
            self.assertEqual(world.exit(uid, {})['position'], exit_position)
            point = WORLD_MAP['landmarks']['plaza']
            world.move(uid, {'scene': 'city', 'teleport': True, **point})
            reopened = WorldService(GameService(game.db_path), clock=lambda: 1000)
            self.assertEqual(reopened.snapshot(uid)['position'], point)
            self.assertEqual(reopened.activity(uid, {'action': 'phone', 'open': True})['position'], point)


if __name__ == '__main__':
    unittest.main()
