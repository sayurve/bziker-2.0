"""Shop plans exercise the real generator API before writing any runtime map."""
import collections
import importlib.util
import json
import math
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ShopPlanTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.generator = load('shop_generator', ROOT / 'scripts/build-modular-interiors.py')
        cls.plans = load('shop_plans', ROOT / 'scripts/interior_plans/shops.py')
        # Isolate this four-room API from independently developed plan modules;
        # the production integration is checked after all modules are present.
        if hasattr(cls.generator, 'planned_floor_height'):
            cls.generator.planned_floor_height = lambda room_id, default: cls.plans.FLOOR_HEIGHTS.get(room_id, default)
        cls.old = {r['id']: r for r in json.loads((ROOT / 'web/interiors-map-v19.json').read_text())['rooms']}
        cls.doors = {b['id']: b['door'] for b in json.loads((ROOT / 'web/world-map.json').read_text())['buildings']}

    def room(self, room_id):
        g = self.generator
        family = 'clothing' if room_id in ('profile', 'shop-clothes') else {'shop-food': 'food', 'shop-furniture': 'furniture'}[room_id]
        floor = 'clothing-interior-floor' if family == 'clothing' else 'clan-surface-floor-' + ('tile' if family == 'food' else 'parquet')
        walls = ['clothing-interior-' + name for name in ['back-wall', 'left-wall', 'right-wall']] if family == 'clothing' else ['clan-surface-wall-plaster', 'station-interior-left-wall', 'station-interior-right-wall']
        previous = g.FLOOR_HEIGHTS.get(family)
        previous_id = g.FLOOR_HEIGHTS.get(room_id)
        g.FLOOR_HEIGHTS[family] = g.FLOOR_HEIGHTS[room_id] = self.plans.FLOOR_HEIGHTS[room_id]
        try:
            shell = g.Room(self.old[room_id], family, floor, walls, self.doors)
        finally:
            for key, value in [(family, previous), (room_id, previous_id)]:
                if value is None:
                    g.FLOOR_HEIGHTS.pop(key, None)
                else:
                    g.FLOOR_HEIGHTS[key] = value
        self.assertTrue(self.plans.build(shell))
        shell.fit_visual_shell()
        return shell.r

    def test_rooms_keep_features_native_views_and_different_purposes(self):
        rooms = {key: self.room(key) for key in self.plans.FLOOR_HEIGHTS}
        for key, room in rooms.items():
            self.assertEqual(room['action']['id'], self.old[key]['action']['id'])
            self.assertEqual(room['door'], self.doors[key])
            self.assertEqual(room['actor_height'], 80)
            for prop in room['props']:
                self.assertEqual(set(self.generator.ASSETS[prop['source_asset']]['views']), {'front', 'right', 'back', 'left'})
                self.assertEqual(prop['visual']['anchorY'], 1)
        clothing = rooms['shop-clothes']
        self.assertEqual(sum(p['type'] == 'fitting' for p in clothing['props']), 2)
        self.assertEqual(sum(p['type'] == 'rack' for p in clothing['props']), 2)
        self.assertEqual(sum(p['id'].startswith('shoe-shelf') for p in clothing['props']), 2)
        self.assertFalse(any(p['type'] == 'rack' for p in rooms['profile']['props']))
        self.assertTrue(any(p['type'] == 'sofa' for p in rooms['profile']['props']))
        food = rooms['shop-food']
        self.assertFalse(any(p['source_asset'].startswith('clothing-') for p in food['props']))
        self.assertGreaterEqual(sum(d.get('source_prop') == 'sandwich' for d in food['details']), 4)
        self.assertTrue(any(d.get('source_rect') for d in food['details']))
        self.assertGreaterEqual(len(rooms['shop-furniture']['seats']), 5)
        coffee = next(p for p in rooms['shop-furniture']['props'] if p['id'] == 'showroom-coffee-table')
        self.assertEqual(coffee['type'], 'coffee-table')
        self.assertEqual(coffee['visual']['height'], 45)
        for room in rooms.values():
            for prop in room['props']:
                if prop['type'] == 'bookcase':
                    self.assertEqual(prop['visual']['height'], 130)

    def test_solids_seat_approaches_and_each_product_group_are_reachable(self):
        for room_id in self.plans.FLOOR_HEIGHTS:
            room = self.room(room_id)
            b = room['bounds']
            solids = room['solids']
            def clear(x, y):
                return (b['left'] + 14 <= x <= b['right'] - 14 and b['top'] + 14 <= y <= b['bottom'] - 14
                        and not any(s['x'] - 14 < x < s['x'] + s['width'] + 14 and s['y'] - 14 < y < s['y'] + s['height'] + 14 for s in solids))
            for i, a in enumerate(solids):
                self.assertTrue(b['left'] <= a['x'] < a['x'] + a['width'] <= b['right'], (room_id, a))
                self.assertTrue(b['top'] <= a['y'] < a['y'] + a['height'] <= b['bottom'], (room_id, a))
                for other in solids[i + 1:]:
                    self.assertFalse(a['x'] < other['x'] + other['width'] and a['x'] + a['width'] > other['x'] and a['y'] < other['y'] + other['height'] and a['y'] + a['height'] > other['y'], (room_id, a['prop_id'], other['prop_id']))
            start = room['spawn']
            self.assertTrue(clear(**start))
            queue = collections.deque([(0, 0)])
            visited = {(0, 0)}
            step = 4
            while queue:
                ix, iy = queue.popleft()
                for n in [(ix - 1, iy), (ix + 1, iy), (ix, iy - 1), (ix, iy + 1)]:
                    if n not in visited and clear(start['x'] + n[0] * step, start['y'] + n[1] * step):
                        visited.add(n)
                        queue.append(n)
            targets = [room['action'], room['exit'], *[s['approach'] for s in room['seats']], *room['plan_approaches']]
            points = [(start['x'] + ix * step, start['y'] + iy * step) for ix, iy in visited]
            for target in targets:
                self.assertTrue(clear(target['x'], target['y']), (room_id, target))
                self.assertTrue(any(math.hypot(x - target['x'], y - target['y']) <= step * 1.6 for x, y in points), (room_id, target))

    def test_final_wall_details_do_not_overlap(self):
        for room_id in self.plans.FLOOR_HEIGHTS:
            room = self.room(room_id)
            details = [d for d in room['details'] if d.get('layer') == 'background' and d.get('visual')]
            for i, a in enumerate(details):
                x = a['visual']
                for other in details[i + 1:]:
                    y = other['visual']
                    self.assertFalse(x['x'] - x['width'] / 2 < y['x'] + y['width'] / 2 and x['x'] + x['width'] / 2 > y['x'] - y['width'] / 2 and x['y'] - x['height'] < y['y'] and x['y'] > y['y'] - y['height'], (room_id, a['id'], other['id']))

    def test_unowned_room_is_not_modified(self):
        class Unowned:
            r = {'id': 'railway', 'props': ['preserve']}
        self.assertFalse(self.plans.build(Unowned()))
        self.assertEqual(Unowned.r, {'id': 'railway', 'props': ['preserve']})
