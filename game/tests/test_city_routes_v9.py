"""Walk every authored city route through the persistent movement service."""
import math
import tempfile
import unittest
from pathlib import Path

from game import GameError, GameService
from world import WORLD_MAP, WorldService


class CityRoutesV9Tests(unittest.TestCase):
    def test_all_authored_routes_persist_continuous_pedestrian_walks_without_reconciliation(self):
        with tempfile.TemporaryDirectory() as tmp:
            game = GameService(Path(tmp) / 'routes.db')
            world = WorldService(game, clock=lambda: 1000)
            uid = game.create_account()
            game.profile(uid, {'name': 'Route Walk V9'})
            world.snapshot(uid)
            failures = []
            count = 0
            self.assertGreater(len(WORLD_MAP['roads']),0)
            self.assertEqual(len({r['id'] for r in WORLD_MAP['roads']}),len(WORLD_MAP['roads']))
            for route in WORLD_MAP['roads']:
                # Each route is a separate audit checkpoint on this temporary
                # account; ordinary moves below still use the public service.
                start = route['points'][0]
                with game.transaction() as db:
                    db.execute("UPDATE presence SET x=?,y=?,scene='city',scene_id=NULL,pose='idle',bench_id=NULL,phone_open=0 WHERE account_id=?", (*start, uid))
                for edge in range(1, len(route['points'])):
                    a, b = route['points'][edge - 1:edge + 1]
                    steps = max(1, math.ceil(math.hypot(b[0] - a[0], b[1] - a[1]) / 16))
                    for k in range(steps + 1):
                        x = a[0] + (b[0] - a[0]) * k / steps
                        y = a[1] + (b[1] - a[1]) * k / steps
                        count += 1
                        try:
                            position = world.move(uid, {'scene': 'city', 'x': x, 'y': y})['position']
                        except GameError as error:
                            failures.append(f"{route['id']} at {x:.2f},{y:.2f}: {error.code}")
                            continue
                        if math.hypot(position['x'] - x, position['y'] - y) > 1e-7:
                            failures.append(f"{route['id']} at {x:.2f},{y:.2f}: restored to {position}")
            # Cover every route in the current source map at 16-unit intervals,
            # independently of how many routes its city plan contains.
            expected_steps = sum(max(1, math.ceil(math.dist(a, b) / 16)) + 1
                                 for route in WORLD_MAP['roads']
                                 for a, b in zip(route['points'], route['points'][1:]))
            self.assertEqual(count, expected_steps, 'Every edge must be walked, not only its vertices')
            self.assertEqual(failures, [], '\n'.join(failures[:12]))


if __name__ == '__main__':
    unittest.main()
