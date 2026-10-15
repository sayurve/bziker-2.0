#!/usr/bin/env python3
"""Standalone source-plan fixture and actual server-geometry diagnostics."""
import importlib.util
import json
import math
import sys
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'game'))
import world


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


generator = load('casino_bar_generator', ROOT / 'game/scripts/build-modular-interiors.py')
plan = load('casino_bar_plan', ROOT / 'game/scripts/interior_plans/casino_bar.py')
# Keep this fixture independent while other plan modules are being authored.
generator.planned_floor_height = lambda room_id, default: plan.FLOOR_HEIGHTS.get(room_id, default)


def build_rooms():
    old = json.loads((ROOT / 'game/web/interiors-map-v19.json').read_text())
    city = json.loads((ROOT / 'game/web/world-map.json').read_text())
    doors = {b['id']: b['door'] for b in city['buildings']}
    rooms = []
    for original in old['rooms']:
        if original['id'] not in plan.FLOOR_HEIGHTS:
            continue
        family = 'casino' if original['id'] == 'casino' else 'bar-pivkovy-tuz'
        generator.FLOOR_HEIGHTS[family] = plan.FLOOR_HEIGHTS[original['id']]
        prefix = family + '-interior-'
        s = generator.Room(original, family, prefix + 'floor',
                           [prefix + v for v in ('back-wall', 'left-wall', 'right-wall')], doors)
        assert plan.build(s)
        s.fit_visual_shell()
        rooms.append(s.r)
    return rooms


def measure(room):
    previous = world.INTERIORS.get(room['id'])
    world.INTERIORS[room['id']] = room
    try:
        b = room['bounds']
        valid = lambda x, y: world.valid_position('interior', x, y, room['id'])
        boxes = [tuple(s[k] for k in ('x', 'y', 'width', 'height')) for s in room['solids']]
        step = 8
        points = {(i, j): (b['left'] + 16 + i * step, b['top'] + 16 + j * step)
                  for i in range(math.ceil((b['right'] - b['left'] - 32) / step))
                  for j in range(math.ceil((b['bottom'] - b['top'] - 32) / step))
                  if valid(b['left'] + 16 + i * step, b['top'] + 16 + j * step)}
        def segment(a, z):
            return all(world.segment_box_distance(a, z, box) >= world.BODY_RADIUS - 1e-7 for box in boxes)
        spawn = tuple(room['spawn'][k] for k in ('x', 'y'))
        starts = [key for key, value in points.items() if math.dist(spawn, value) <= 16 and segment(spawn, value)]
        seen = set(starts)
        queue = deque(starts)
        while queue:
            i, j = queue.popleft()
            for key in ((i-1,j),(i+1,j),(i,j-1),(i,j+1)):
                if key in points and key not in seen and segment(points[(i,j)], points[key]):
                    seen.add(key)
                    queue.append(key)
        targets = [('action', room['action']), ('exit', room['exit'])]
        targets += [(seat['id'], seat['approach']) for seat in room['seats']]
        reach = []
        for name, target in targets:
            p = tuple(target[k] for k in ('x', 'y'))
            near = [(math.dist(p, points[key]), key) for key in seen if math.dist(p, points[key]) <= 16]
            reach.append(dict(id=name, point=p, valid=valid(*p),
                              exact_approach_reachable=any(segment(p, points[key]) for _, key in near),
                              nearest_grid_distance=min((d for d, _ in near), default=None)))
        overlaps = []
        for i, a in enumerate(room['solids']):
            for z in room['solids'][i+1:]:
                w = min(a['x']+a['width'],z['x']+z['width'])-max(a['x'],z['x'])
                h = min(a['y']+a['height'],z['y']+z['height'])-max(a['y'],z['y'])
                if w > 0 and h > 0:
                    overlaps.append(dict(ids=[a['prop_id'],z['prop_id']], area=w*h))
        return dict(id=room['id'], bounds=b, actor_height=80, body_radius=world.BODY_RADIUS,
                    grid_step=step, valid_nodes=len(points), reachable_nodes=len(seen),
                    spawn_valid=valid(*spawn), targets=reach, solid_overlaps=overlaps,
                    seats=len(room['seats']), props=len(room['props']))
    finally:
        if previous is None:
            world.INTERIORS.pop(room['id'], None)
        else:
            world.INTERIORS[room['id']] = previous


if __name__ == '__main__':
    out = ROOT / 'verification/casino-bar'
    out.mkdir(parents=True, exist_ok=True)
    after = build_rooms()
    (out/'after-rooms.json').write_text(json.dumps({'rooms': after}, ensure_ascii=False, indent=2)+'\n')
    before = json.loads((out/'before-rooms.json').read_text())['rooms']
    metrics = {name: [measure(r) for r in rooms] for name, rooms in [('before',before),('after',after)]}
    (out/'metrics.json').write_text(json.dumps(metrics, ensure_ascii=False, indent=2)+'\n')
    for r in metrics['after']:
        print(r['id'], 'nodes',r['reachable_nodes'],'/',r['valid_nodes'], 'overlaps',r['solid_overlaps'],
              'invalid/unreachable',[t for t in r['targets'] if not t['valid'] or not t['exact_approach_reachable']])
    assert all(r['spawn_valid'] and not r['solid_overlaps'] and
               all(t['valid'] and t['exact_approach_reachable'] for t in r['targets']) for r in metrics['after'])
