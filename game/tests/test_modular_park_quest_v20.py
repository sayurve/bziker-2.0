"""Park seating rewards follow authored places, never an obsolete ID prefix."""
import tempfile
import unittest
from pathlib import Path
import world
from game import GameService
from economy import EconomyService
from world_fixtures import fixture_position


class ModularParkQuestTests(unittest.TestCase):
    def test_real_park_seat_with_phone_rewards_after_ten_seconds_only(self):
        park = next(d for d in world.WORLD_MAP['architecture']['districts'] if d['id'] == 'park')
        def in_park(s):
            p = s['seat']
            return park['x'] < p['x'] < park['x']+park['width'] and park['y'] < p['y'] < park['y']+park['height']
        seats = [next(s for s in world.WORLD_MAP['benches'] if in_park(s)),
                 next(s for s in world.WORLD_MAP['benches'] if not in_park(s))]
        self.assertIn(seats[0]['id'], getattr(world, 'PARK_BENCHES', set()))
        self.assertNotIn(seats[1]['id'], world.PARK_BENCHES)
        self.assertFalse(seats[0]['id'].startswith('park-bench'), 'exercise the new independent scene ID')
        with tempfile.TemporaryDirectory() as folder:
            game = GameService(Path(folder)/'park.db');now = [1000]
            service = world.WorldService(game, clock=lambda: now[0]);economy = EconomyService(game, service)
            users = [game.create_account() for _ in seats]
            for i, (uid, seat) in enumerate(zip(users, seats)):
                game.profile(uid, {'name': f'Park place {i}'})
                x, y = world.nearest_city_position(seat['seat']['x'], seat['seat']['y']+70)
                fixture_position(service,uid,x,y)
                service.activity(uid, {'action':'sit','bench_id':seat['id']})
                service.activity(uid, {'action':'phone','open':True})
            def eligible(uid):
                return next(q for q in economy.snapshot(uid)['quests'] if q['id']=='sit10s')['eligible']
            now[0] = 1009
            for uid in users:
                service.snapshot(uid);self.assertFalse(eligible(uid))
            now[0] = 1010
            for uid, seat in zip(users, seats):
                snap = service.snapshot(uid)
                self.assertEqual(snap['position'], seat['seat']);self.assertTrue(snap['phone_open'])
            self.assertTrue(eligible(users[0]));self.assertFalse(eligible(users[1]))


if __name__ == '__main__':
    unittest.main()
