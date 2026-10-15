"""Actual per-account/day ground state, using isolated SQLite and real actions."""
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
from economy import EconomyService, inventory_quantity, moscow_day
from game import GameError, GameService
from world import WorldService, WORLD_MAP, nearest_city_position
from world_fixtures import fixture_position


class CollectedLitterOwnershipTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db_path = Path(self.tmp.name) / 'collected-litter.db'
        self.now = datetime(2026, 10, 15, 20, 59, 50, tzinfo=timezone.utc).timestamp()
        self.game = GameService(self.db_path)
        self.world = WorldService(self.game, clock=lambda: self.now)
        self.economy = EconomyService(self.game, self.world)
        self.a, self.b = [self.game.create_account() for _ in range(2)]
        self.game.profile(self.a, {'name': 'Collector A'})
        self.game.profile(self.b, {'name': 'Collector B'})
        self.piles = [p for p in WORLD_MAP['activities'] if p['action'] == 'pick-litter']
        self.assertGreaterEqual(len(self.piles), 2)

    def near(self, uid, point):
        fixture_position(self.world, uid, *nearest_city_position(point['x'], point['y']))

    def pick(self, uid, point):
        self.near(uid, point)
        return self.economy.action(uid, {'action': 'pick-litter', 'target_id': point['id']})

    def collected(self, uid, world=None):
        snapshot = (world or self.world).snapshot(uid)
        self.assertIsInstance(snapshot['collected_litter'], list)
        self.assertTrue(all(isinstance(target, str) for target in snapshot['collected_litter']))
        return set(snapshot['collected_litter'])

    def quantity(self, uid):
        with self.game.transaction() as db:
            return inventory_quantity(db, uid, 'trash')

    def test_snapshot_contains_only_the_requesting_accounts_collected_target_ids(self):
        first, second = self.piles[:2]
        self.assertEqual(self.collected(self.a), set())
        self.assertTrue(self.pick(self.a, first)['picked'])
        self.assertEqual(self.collected(self.a), {first['id']})
        self.assertEqual(self.collected(self.b), set(), 'A pickup must not hide B ground')
        self.assertTrue(self.pick(self.b, second)['picked'])
        self.assertEqual(self.collected(self.a), {first['id']})
        self.assertEqual(self.collected(self.b), {second['id']})
        self.assertTrue(self.pick(self.b, first)['picked'], 'each account may collect the same target')
        self.assertEqual(self.collected(self.b), {first['id'], second['id']})
        for viewer in (self.a, self.b):
            for player in self.world.snapshot(viewer)['players']:
                self.assertNotIn('collected_litter', player, 'private collection is not a peer broadcast field')

    def test_collection_survives_service_restart_and_expiration_of_the_pick_effect(self):
        point = self.piles[0]
        self.pick(self.a, point)
        self.now += 4
        restarted_game = GameService(self.db_path)
        restarted_world = WorldService(restarted_game, clock=lambda: self.now)
        EconomyService(restarted_game, restarted_world)
        snapshot = restarted_world.snapshot(self.a)
        self.assertIsNone(snapshot['action_effect'])
        self.assertEqual(set(snapshot['collected_litter']), {point['id']})
        self.assertEqual(self.quantity(self.a), 1)
        self.assertEqual(self.collected(self.b, restarted_world), set())

    def test_moscow_midnight_resets_visible_collection_without_deleting_inventory(self):
        point = self.piles[0]
        self.assertEqual(moscow_day(self.now), '2026-10-15')
        self.pick(self.a, point)
        self.now += 8  #20:59:58 UTC, still23:59:58 Moscow.
        self.assertEqual(self.collected(self.a), {point['id']})
        self.now += 3  #21:00:01 UTC, Moscow date advanced but UTC date did not.
        self.assertEqual(moscow_day(self.now), '2026-10-16')
        self.assertEqual(self.collected(self.a), set())
        self.assertEqual(self.quantity(self.a), 1, 'day reset changes ground availability, not owned trash')
        self.assertTrue(self.pick(self.a, point)['picked'])
        self.assertEqual(self.collected(self.a), {point['id']})
        self.assertEqual(self.quantity(self.a), 2)

    def test_duplicate_pick_and_binning_do_not_reveal_the_collected_ground_again(self):
        point = self.piles[0]
        first = self.pick(self.a, point)
        self.assertTrue(first['picked'])
        replay = self.pick(self.a, point)
        self.assertFalse(replay['picked'])
        self.assertEqual(replay['action_effect']['id'], first['action_effect']['id'])
        self.assertEqual(self.quantity(self.a), 1)
        self.now += 4
        self.assertFalse(self.pick(self.a, point)['picked'])
        self.assertEqual(self.quantity(self.a), 1)
        bin_point = next(p for p in WORLD_MAP['activities'] if p['action'] == 'trash-bin')
        self.near(self.a, bin_point)
        binned = self.economy.action(self.a, {'action': 'trash-bin', 'target_id': bin_point['id']})
        self.assertIsNone(binned['holding'])
        self.assertEqual(self.quantity(self.a), 0)
        self.assertEqual(self.collected(self.a), {point['id']}, 'empty carried inventory does not resurrect ground litter')

    def test_inventory_failure_rolls_back_the_collection_record_and_allows_retry(self):
        point = self.piles[0]
        self.near(self.a, point)
        with patch('economy.change_inventory', side_effect=GameError('inventory_full', 'Fixture inventory rejection', 409)):
            with self.assertRaises(GameError) as error:
                self.economy.action(self.a, {'action': 'pick-litter', 'target_id': point['id']})
        self.assertEqual(error.exception.code, 'inventory_full')
        self.assertEqual(self.collected(self.a), set())
        self.assertEqual(self.quantity(self.a), 0)
        self.assertIsNone(self.world.snapshot(self.a)['action_effect'])
        self.assertTrue(self.pick(self.a, point)['picked'], 'failed transaction must not consume the daily target')
        self.assertEqual(self.quantity(self.a), 1)


if __name__ == '__main__':
    unittest.main()
