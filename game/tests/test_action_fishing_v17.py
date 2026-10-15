"""Fishing visuals are authored by the successful transaction, never by a read."""
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

from actions import ACTION_TYPES, action_snapshot, start_action
from economy import EconomyService, change_inventory, inventory_quantity
from game import GameError, GameService
from world import WORLD_MAP, WorldService, valid_position


class FishingActionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.game = GameService(Path(self.tmp.name) / 'fishing-actions.db')
        self.now = 1000
        self.world = WorldService(self.game, clock=lambda: self.now)
        self.economy = EconomyService(self.game, self.world)
        self.a, self.b = [self.game.create_account() for _ in range(2)]
        for uid, name in ((self.a, 'Fisher Alpha'), (self.b, 'Fisher Beta')):
            self.game.profile(uid, {'name': name})
        self.spot = next(p for p in WORLD_MAP['activities'] if p['action'] == 'fishing')
        for uid in (self.a, self.b):
            self.place(uid, self.spot)

    def place(self, uid, point):
        self.assertTrue(valid_position('city', point['x'], point['y']))
        self.world.snapshot(uid)
        with self.game.transaction() as db:
            for table in ('presence', 'world_positions'):
                db.execute(f'UPDATE {table} SET x=?,y=? WHERE account_id=?', (point['x'], point['y'], uid))

    def rod(self, uid=None):
        with self.game.transaction() as db:
            change_inventory(db, uid or self.a, 'rod', 1)

    def record(self, uid=None):
        with self.game.transaction() as db:
            row = db.execute('SELECT * FROM world_action_effects WHERE account_id=?', (uid or self.a,)).fetchone()
            return dict(row) if row else None

    def deny(self, fn, *args, code):
        with self.assertRaises(GameError) as error:
            fn(*args)
        self.assertEqual(error.exception.code, code)

    def test_new_cast_and_first_catch_are_short_shared_stationary_server_actions(self):
        self.rod()
        self.world.activity(self.a, {'action': 'phone', 'open': True})
        before = self.world.snapshot(self.a)
        session = self.economy.start_fishing(self.a, {'spot_id': self.spot['id'], 'id': 'forged', 'type': 'eat', 'item_id': 'snack'})['active']
        after = self.world.snapshot(self.a)
        cast = after['action_effect']
        self.assertIsNotNone(cast)
        self.assertEqual((cast['type'], cast['item_id'], cast['duration'], cast['started_at']), ('fishing', 'rod', 2, self.now))
        self.assertNotEqual(cast['id'], 'forged')
        self.assertIsNone(cast['target_id'])
        self.assertNotIn('x', cast)
        self.assertNotIn('y', cast)
        for key in ('position', 'pose', 'bench_id', 'phone_open'):
            self.assertEqual(after[key], before[key])
        self.assertEqual(next(p for p in self.world.snapshot(self.b)['players'] if p['id'] == self.a)['action_effect'], cast)
        self.now += 2
        self.assertIsNone(self.world.snapshot(self.a)['action_effect'])
        caught = self.economy.catch_fish(self.a, session['id'])
        effect = self.world.snapshot(self.a)['action_effect']
        self.assertEqual(caught['active']['state'], 'caught')
        self.assertEqual((effect['type'], effect['item_id'], effect['duration'], effect['started_at']), ('fish-catch', 'fish', 3, self.now))
        self.assertNotEqual(effect['id'], cast['id'])
        for key in ('position', 'pose', 'bench_id', 'phone_open'):
            self.assertEqual(self.world.snapshot(self.a)[key], before[key])
        self.now += 3
        self.assertIsNone(self.world.snapshot(self.a)['action_effect'])

    def test_reads_pending_retries_and_catch_retries_never_restart_the_gesture(self):
        self.rod()
        session = self.economy.start_fishing(self.a, {'spot_id': self.spot['id']})['active']
        cast = self.record()
        self.now += .5
        self.economy.fishing(self.a)
        self.assertEqual(self.economy.start_fishing(self.a, {'spot_id': self.spot['id']})['active']['id'], session['id'])
        self.assertEqual(self.record(), cast)
        self.now += 2
        self.assertEqual(self.economy.fishing(self.a)['active']['state'], 'ready')
        self.economy.start_fishing(self.a, {'spot_id': self.spot['id']})
        self.assertEqual(self.record(), cast)
        self.assertIsNone(self.world.snapshot(self.a)['action_effect'])
        with ThreadPoolExecutor(max_workers=2) as pool:
            first, retry = list(pool.map(lambda _: self.economy.catch_fish(self.a, session['id']), range(2)))
        self.assertEqual(first, retry)
        caught = self.record()
        self.assertEqual(caught['type'], 'fish-catch')
        self.now += 4
        self.economy.fishing(self.a)
        self.assertEqual(self.economy.catch_fish(self.a, session['id']), first)
        self.assertEqual(self.record(), caught)
        self.assertIsNone(self.world.snapshot(self.a)['action_effect'])
        with self.game.transaction() as db:
            self.assertEqual(inventory_quantity(db, self.a, 'fish'), 1)
            self.assertEqual(inventory_quantity(db, self.a, 'rod'), 1)

    def test_missing_rod_early_catch_wrong_owner_and_forged_actions_cannot_create_effects(self):
        self.deny(self.economy.start_fishing, self.a, {'spot_id': self.spot['id']}, code='rod_required')
        self.assertIsNone(self.record())
        self.rod()
        session = self.economy.start_fishing(self.a, {'spot_id': self.spot['id']})['active']
        cast = self.record()
        self.now = session['ready_at'] - .001
        self.deny(self.economy.catch_fish, self.a, session['id'], code='fish_not_ready')
        self.deny(self.economy.catch_fish, self.b, session['id'], code='forbidden')
        self.deny(self.economy.action, self.a, {'action': 'fish-catch', 'target_id': self.spot['id']}, code='not_found')
        self.assertEqual(self.record(), cast)
        self.assertIsNone(self.record(self.b))
        with self.game.transaction() as db:
            for kind, item in [('fishing', 'fish'), ('fish-catch', 'rod')]:
                with self.assertRaises(GameError):
                    start_action(db, self.a, kind, self.now, item_id=item)
            self.assertEqual(action_snapshot(db, self.a, self.now)['action_effect']['id'], cast['id'])

    def test_effect_failure_rolls_back_the_whole_cast_or_catch_mutation(self):
        self.rod()
        with patch('economy.start_action', side_effect=GameError('effect_failure', 'effect failed', 500)):
            self.deny(self.economy.start_fishing, self.a, {'spot_id': self.spot['id']}, code='effect_failure')
        self.assertIsNone(self.economy.fishing(self.a)['active'])
        self.assertIsNone(self.record())
        session = self.economy.start_fishing(self.a, {'spot_id': self.spot['id']})['active']
        cast = self.record()
        self.now += 2
        with patch('economy.start_action', side_effect=GameError('effect_failure', 'effect failed', 500)):
            self.deny(self.economy.catch_fish, self.a, session['id'], code='effect_failure')
        self.assertEqual(self.record(), cast)
        self.assertEqual(self.economy.fishing(self.a)['active']['state'], 'ready')
        with self.game.transaction() as db:
            self.assertEqual(inventory_quantity(db, self.a, 'fish'), 0)
            self.assertIsNone(db.execute("SELECT 1 FROM activity_events WHERE account_id=? AND event='firstfish'", (self.a,)).fetchone())

    def test_boat_fishing_keeps_current_boat_and_phone_position_and_jury_hides_effect(self):
        self.rod()
        boat = WORLD_MAP['boats'][0]
        self.place(self.a, boat['boarding'])
        self.economy.action(self.a, {'action': 'boat-board', 'target_id': boat['id']})
        before = self.world.activity(self.a, {'action': 'phone', 'open': True})
        session = self.economy.start_fishing(self.a, {'spot_id': 'boat:' + boat['id']})['active']
        cast = self.world.snapshot(self.a)
        self.assertEqual(cast['action_effect']['type'], 'fishing')
        for key in ('position', 'boat', 'pose', 'phone_open'):
            self.assertEqual(cast[key], before[key])
        self.now += 2
        self.economy.catch_fish(self.a, session['id'])
        self.assertEqual(self.world.snapshot(self.a)['action_effect']['type'], 'fish-catch')
        previous = self.record()
        lobby = self.game.create_lobby(self.b, {'mode': 'individual', 'title': 'Fishing jury'})['id']
        self.game.join(self.a, self.game.snapshot(self.b, lobby)['jury_code'])
        self.assertIsNone(self.world.snapshot(self.a)['action_effect'])
        self.assertNotIn(self.a, {p['id'] for p in self.world.snapshot(self.b)['players']})
        self.deny(self.economy.catch_fish, self.a, session['id'], code='jury_restricted')
        self.assertEqual(self.record(), previous)

    def test_effect_whitelist_accepts_only_the_matching_real_rod_or_catch(self):
        self.assertIn('fishing', ACTION_TYPES)
        self.assertIn('fish-catch', ACTION_TYPES)
        with self.game.transaction() as db:
            for kind, item, duration in [('fishing', 'rod', 2), ('fish-catch', 'fish', 3)]:
                effect = start_action(db, self.a, kind, self.now, item_id=item)
                self.assertEqual(effect['duration'], duration)
                self.assertLessEqual(effect['duration'], 10)
                with self.assertRaises(GameError):
                    start_action(db, self.a, kind, self.now, item_id=item, target_id='forged', point={'x': 10, 'y': 20})


if __name__ == '__main__':
    unittest.main()
