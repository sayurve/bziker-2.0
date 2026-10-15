"""Actual Room API, human-radius routes and retained feature bindings."""
import importlib.util
import json
from collections import deque
from pathlib import Path
import unittest

GAME = Path(__file__).resolve().parents[1]

def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

GEN = load_module('community_generator_fixture', GAME / 'scripts/build-modular-interiors.py')
PLAN = load_module('community_plan', GAME / 'scripts/interior_plans/community.py')
OLD = {r['id']: r for r in json.loads((GAME/'web/interiors-map-v19.json').read_text())['rooms']}
DOORS = {b['id']: b['door'] for b in json.loads((GAME/'web/world-map.json').read_text())['buildings']}

def room_state(room_id):
    family = {'arena': 'bzik-hub', 'results': 'bzik-hub', 'clans': 'clan', 'terrace': 'terrace'}[room_id]
    GEN.FLOOR_HEIGHTS[family] = PLAN.FLOOR_HEIGHTS[room_id]
    if family == 'bzik-hub':
        floor = family+'-interior-floor'
        walls = [family+'-interior-'+side for side in ['wall-back', 'wall-left', 'wall-right']]
    else:
        floor = 'clan-surface-floor-'+('board' if room_id == 'terrace' else 'tile')
        walls = ['clan-surface-wall-'+('wood' if room_id == 'terrace' else 'plaster'), 'station-interior-left-wall', 'station-interior-right-wall']
    return GEN.Room(OLD[room_id], family, floor, walls, DOORS)

def build_room(room_id):
    s = room_state(room_id)
    assert PLAN.build(s)
    s.fit_visual_shell()
    return s.r

def clear(room, point, radius=14):
    x,y = point['x'],point['y']
    b = room['bounds']
    return b['left']+radius <= x <= b['right']-radius and b['top']+radius <= y <= b['bottom']-radius and not any(
        p['x']-radius < x < p['x']+p['width']+radius and p['y']-radius < y < p['y']+p['height']+radius for p in room['solids'])

def reachable(room, targets):
    step = 6
    origin = room['spawn']
    queue = deque([(0,0)])
    seen = {(0,0)}
    found = set()
    while queue:
        i,j = queue.popleft()
        point = {'x':origin['x']+i*step,'y':origin['y']+j*step}
        for n,t in enumerate(targets):
            if abs(t['x']-point['x']) <= step and abs(t['y']-point['y']) <= step and clear(room,t):
                found.add(n)
        for di,dj in [(1,0),(-1,0),(0,1),(0,-1)]:
            nxt = (i+di,j+dj)
            if nxt not in seen and clear(room,{'x':origin['x']+nxt[0]*step,'y':origin['y']+nxt[1]*step}):
                seen.add(nxt)
                queue.append(nxt)
    return found

class CommunityPlans(unittest.TestCase):
    def test_each_room_has_its_existing_action_and_a_distinct_purpose(self):
        rooms = {key:build_room(key) for key in PLAN.FLOOR_HEIGHTS}
        self.assertEqual(set(rooms), {'arena','results','clans','terrace'})
        for key,r in rooms.items():
            self.assertEqual(r['action']['id'], OLD[key]['action']['id'])
            self.assertEqual(r['action']['label'], OLD[key]['action']['label'])
            self.assertEqual(r['door'], DOORS[key])
            self.assertGreaterEqual(len(r['props']), 7)
            self.assertGreaterEqual(len(r['seats']), 4)
            self.assertEqual(r['actor_height'], 80)
        self.assertEqual(sum('battle-' in p['source_asset'] for p in rooms['arena']['props']),2)
        self.assertFalse(any('battle-' in p['source_asset'] for p in rooms['results']['props']))
        self.assertTrue(any('computer-desk' in p['source_asset'] for p in rooms['results']['props']))
        self.assertTrue(any(p['id']=='conference-table' for p in rooms['clans']['props']))
        self.assertTrue(any(p['type']=='bookcase' for p in rooms['terrace']['props']))

    def test_real_supports_clear_entry_axis_and_all_actions_and_seats_are_reachable(self):
        for key in PLAN.FLOOR_HEIGHTS:
            with self.subTest(room=key):
                r = build_room(key)
                targets = [r['exit'],r['action']]+[s['approach'] for s in r['seats']]
                for p in [r['spawn']]+targets:
                    self.assertTrue(clear(r,p), (key,p))
                self.assertEqual(reachable(r,targets),set(range(len(targets))))
                corridor = r['circulation']['entry']
                self.assertGreaterEqual(corridor['width'],120)
                for solid in r['solids']:
                    self.assertFalse(solid['x']<corridor['x']+corridor['width'] and solid['x']+solid['width']>corridor['x'] and solid['y']<corridor['y']+corridor['height'] and solid['y']+solid['height']>corridor['y'], (key,solid))
                props = {p['id']:p for p in r['props']}
                for seat in r['seats']:
                    p = props[seat['prop_id']]
                    self.assertIn(p['type'],['chair','sofa','bench'])
                    self.assertEqual(seat['seat']['y'],p['y']+p['height'])
                    self.assertEqual(p['source_direction'], {'up':'back','down':'front'}[seat['facing']])
                self.assertEqual(len(props),len(r['props']))
                for p in r['props']:
                    self.assertIn(p['source_asset'],GEN.ASSETS)
                    asset = GEN.asset(p['source_asset'],p['source_direction'])
                    self.assertTrue((GAME/'assets'/Path(asset['url']).name).is_file(),p['source_asset'])
                    if p['type'] in ['chair','sofa','table','display-desk']:
                        self.assertLessEqual(p['visual']['height'],85)

    def test_shared_visual_shell_never_moves_existing_community_gameplay(self):
        fields = ['bounds','spawn','exit','door','solids','seats','props','action','counter','staff']
        for key in PLAN.FLOOR_HEIGHTS:
            s = room_state(key)
            self.assertTrue(PLAN.build(s))
            before = {f:json.loads(json.dumps(s.r[f])) for f in fields}
            s.fit_visual_shell()
            self.assertEqual({f:s.r[f] for f in fields},before,key)

    def test_generated_public_map_keeps_community_actions_and_all_real_seat_routes(self):
        current = {r['id']:r for r in json.loads((GAME/'web/interiors-map.json').read_text())['rooms']}
        for key in PLAN.FLOOR_HEIGHTS:
            with self.subTest(room=key):
                r = current[key]
                self.assertEqual(r['action']['id'], OLD[key]['action']['id'])
                self.assertGreaterEqual(len(r['seats']), 4)
                targets = [r['exit'],r['action']]+[s['approach'] for s in r['seats']]
                self.assertEqual(reachable(r,targets),set(range(len(targets))))
        self.assertEqual(sum('battle-' in p['source_asset'] for p in current['arena']['props']),2)
        self.assertFalse(any('battle-' in p['source_asset'] for p in current['results']['props']))

    def test_build_replaces_content_but_keeps_the_existing_shell_and_unknown_rooms(self):
        s = room_state('arena')
        surfaces = list(s.r['surfaces'])
        for key in ['props','solids','seats','details']:
            s.r[key].append({'id':'stale'})
        self.assertTrue(PLAN.build(s))
        for key in ['props','solids','seats','details']:
            self.assertFalse(any(p.get('id')=='stale' for p in s.r[key]))
        self.assertEqual(s.r['surfaces'],surfaces)
        s.r['id']='railway'
        before = json.loads(json.dumps(s.r))
        self.assertFalse(PLAN.build(s))
        self.assertEqual(s.r,before)

if __name__ == '__main__':
    unittest.main()
