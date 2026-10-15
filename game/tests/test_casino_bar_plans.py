"""Casino/pub plan contract and server collision regressions, no live DB."""
import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('casino_bar_checks', ROOT/'game/scripts/check-casino-bar-plans.py')
checks = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checks)


class CasinoBarPlanTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rooms = {r['id']: r for r in checks.build_rooms()}

    def test_feature_action_and_seat_identity_survive(self):
        old = checks.json.loads((ROOT/'verification/casino-bar/before-rooms.json').read_text())
        for original in old['rooms']:
            room = self.rooms[original['id']]
            self.assertEqual(room['action']['id'], original['action']['id'])
            self.assertEqual({s['id'] for s in room['seats']}, {s['id'] for s in original['seats']})
            self.assertEqual(len(room['seats']), 16 if room['id']=='casino' else 9)

    def test_all_exact_approaches_and_actions_reached_without_crossing_solids(self):
        for room in self.rooms.values():
            metrics = checks.measure(room)
            self.assertTrue(metrics['spawn_valid'])
            self.assertEqual(metrics['solid_overlaps'], [])
            for target in metrics['targets']:
                with self.subTest(room=room['id'], target=target['id']):
                    self.assertTrue(target['valid'])
                    self.assertTrue(target['exact_approach_reachable'])

    def test_side_chairs_use_matching_native_views_and_outer_approaches(self):
        room = self.rooms['messages']
        for seat in (s for s in room['seats'] if s.get('table_id')):
            p = next(p for p in room['props'] if p['id']==seat['prop_id'])
            left = p['id'].endswith(':left')
            self.assertEqual(p['source_direction'], 'right' if left else 'left')
            self.assertEqual(seat['facing'], 'right' if left else 'left')
            self.assertEqual(seat['approach']['y'],seat['seat']['y'])
            self.assertLess(seat['approach']['x'],p['x']) if left else self.assertGreater(seat['approach']['x'],p['x']+p['width'])

    def test_unknown_room_unchanged(self):
        class Fake:
            r = {'id':'railway','props':['preserve']}
        self.assertFalse(checks.plan.build(Fake()))
        self.assertEqual(Fake.r, {'id':'railway','props':['preserve']})

    def test_wall_signs_shelves_and_lights_do_not_cover_each_other(self):
        for room in self.rooms.values():
            details=[d for d in room['details'] if d['layer']=='background']
            for i,a in enumerate(details):
                v=a['visual'];ax=v['x']-v['width']*v['anchorX'];ay=v['y']-v['height']*v['anchorY']
                for z in details[i+1:]:
                    w=z['visual'];zx=w['x']-w['width']*w['anchorX'];zy=w['y']-w['height']*w['anchorY']
                    self.assertFalse(ax<zx+w['width'] and ax+v['width']>zx and ay<zy+w['height'] and ay+v['height']>zy,
                                     f"{room['id']}: {a['id']} / {z['id']}")

    def test_pub_wall_lamps_use_separate_clear_wall_sections(self):
        room=self.rooms['messages'];b=room['bounds']
        lamps=sorted((d for d in room['details'] if d['id'].startswith('wall-light-')),
                     key=lambda d:d['visual']['x'])
        self.assertEqual(len(lamps),2)
        self.assertGreater(lamps[1]['visual']['x']-lamps[0]['visual']['x'],(b['right']-b['left'])*.6)
        for lamp,expected in zip(lamps,(b['left']+76,b['right']-60)):
            v=lamp['visual']
            self.assertEqual(v['height'],60)
            self.assertAlmostEqual(v['x'],expected,places=5)
            self.assertAlmostEqual(v['width']/v['height'],checks.generator.ratio(lamp['asset_id']),places=6)
            self.assertGreaterEqual(v['x']-v['width']*v['anchorX'],b['left'])
            self.assertLessEqual(v['x']+v['width']*(1-v['anchorX']),b['right'])

    def test_native_aspect_and_central_aisle_remain(self):
        for room in self.rooms.values():
            b=room['bounds']; c=room['circulation']['entry']
            self.assertGreaterEqual(c['width'],120)
            for p in room['props']:
                self.assertAlmostEqual(p['visual']['width']/p['visual']['height'], checks.generator.ratio(p['source_asset'],p['source_direction']),places=6)
                self.assertGreaterEqual(p['x'],b['left'])
                self.assertLessEqual(p['x']+p['width'],b['right'])
            for solid in room['solids']:
                self.assertFalse(solid['x']<c['x']+c['width'] and solid['x']+solid['width']>c['x'] and solid['y']<c['y']+c['height'] and solid['y']+solid['height']>c['y'])


if __name__=='__main__':unittest.main()
