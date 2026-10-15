"""Pickup outcomes distinguish the existing daily no-op from a real mutation."""
import tempfile
import unittest
from pathlib import Path
from game import GameService
from world import WorldService, WORLD_MAP, nearest_city_position
from economy import EconomyService, inventory_quantity
from world_fixtures import fixture_position


class LitterResultV30Tests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.game = GameService(Path(self.tmp.name) / 'litter-result.db')
        self.now = 1792100000
        self.world = WorldService(self.game, clock=lambda: self.now)
        self.economy = EconomyService(self.game, self.world)
        self.uid = self.game.create_account()
        self.game.profile(self.uid, {'name': 'Litter result'})
        self.points = [p for p in WORLD_MAP['activities'] if p['action'] == 'pick-litter']
        self.assertGreaterEqual(len(self.points), 2)

    def pick(self, point):
        fixture_position(self.world, self.uid, *nearest_city_position(point['x'], point['y']))
        return self.economy.action(self.uid, {'action': 'pick-litter', 'target_id': point['id']})

    def quantity(self):
        with self.game.transaction() as db:
            return inventory_quantity(db, self.uid, 'trash')

    def test_first_pick_and_immediate_or_expired_repeats_report_the_actual_mutation(self):
        first = self.pick(self.points[0])
        self.assertIs(first['picked'], True)
        self.assertEqual(first['action'], 'pick-litter')
        self.assertEqual(first['target_id'], self.points[0]['id'])
        self.assertEqual(first['action_effect']['type'], 'pick-litter')
        self.assertEqual(first['holding'], 'litter')
        self.assertEqual(self.quantity(), 1)
        retry = self.pick(self.points[0])
        self.assertIs(retry['picked'], False)
        self.assertEqual(retry['action_effect']['id'], first['action_effect']['id'])
        self.now += 4
        expired = self.pick(self.points[0])
        self.assertIs(expired['picked'], False)
        self.assertIsNone(expired['action_effect'])
        self.assertEqual(self.quantity(), 1)

    def test_another_target_and_the_next_day_remain_independent_without_tightening_limits(self):
        self.assertIs(self.pick(self.points[0])['picked'], True)
        other = self.pick(self.points[1])
        self.assertIs(other['picked'], True)
        self.assertEqual(other['action_effect']['target_id'], self.points[1]['id'])
        self.assertEqual(self.quantity(), 2)
        self.now += 86400
        self.assertIs(self.pick(self.points[0])['picked'], True)
        self.assertEqual(self.quantity(), 3)

    def test_non_pickup_actions_keep_their_existing_response_contract(self):
        self.pick(self.points[0])
        point = next(p for p in WORLD_MAP['activities'] if p['action'] == 'trash-bin')
        fixture_position(self.world, self.uid, *nearest_city_position(point['x'], point['y']))
        result = self.economy.action(self.uid, {'action': 'trash-bin', 'target_id': point['id']})
        self.assertNotIn('picked', result)
        self.assertEqual(result['action_effect']['type'], 'throw-litter')
        self.assertEqual(self.quantity(), 0)
