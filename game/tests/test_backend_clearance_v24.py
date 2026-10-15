"""Actual body collisions and editor/reconnect regressions on disposable databases."""
import json
import math
import random
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import world
import water
from game import GameError, GameService
from world import (BENCHES, CITY_OBSTACLES, FURNITURE_MAP, INTERIORS, WORLD_MAP,
                   WorldService, nearest_city_position, remember_position, valid_base_position, valid_position)
from clan_fixtures import legacy_home


class BackendClearanceV24Tests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.game = GameService(Path(self.tmp.name) / 'clearance.db')
        self.now = 1000
        self.world = WorldService(self.game, clock=lambda: self.now)
        self.uid = self.game.create_account()
        self.game.profile(self.uid, {'name': 'Body Clearance Audit'})
        self.cid = self.world.create_clan(self.uid, {
            'name': 'Clearance Audit', 'color': '#112233', 'flag': 'C'})['id']
        legacy_home(self.game, self.cid)

    def save(self, items):
        return self.world.mutate_clan(self.uid, self.cid, 'base', {'items': items})

    def place(self, x, y, scene='city', sid=None):
        """Set disposable fixture state, without treating setup as a player move."""
        self.world.snapshot(self.uid)
        with self.game.transaction() as db:
            db.execute("UPDATE presence SET x=?,y=?,scene=?,scene_id=?,pose='idle',bench_id=NULL,sit_since=NULL WHERE account_id=?",
                       (x, y, scene, sid, self.uid))
            remember_position(db, self.uid, x, y, scene, sid)

    def solid_clear(self, point, solids, clearance=14):
        return not any(math.hypot(max(s['x']-point['x'], 0, point['x']-s['x']-s['width']),
                                 max(s['y']-point['y'], 0, point['y']-s['y']-s['height'])) < clearance-1e-7
                       for s in solids)

    def test_city_body_cannot_clip_a_lamp_support_when_its_feet_are_outside(self):
        obstacle = (100, 100, 20, 20)
        with patch.object(world, 'CITY_BOUNDS', (0, 300, 0, 300)), \
                patch.object(world, 'CITY_FOOTPRINTS', (obstacle,)):
            self.assertFalse(valid_position('city', 99, 110))
            self.assertTrue(valid_position('city', 86, 110))
            self.assertTrue(valid_position('city', 88, 88), 'A safe diagonal corner stays open for the circular foot support')
            self.assertEqual(nearest_city_position(99, 110), (86, 110))
            corner = nearest_city_position(92, 92)
            self.assertAlmostEqual(corner[0], 100-14/math.sqrt(2))
            self.assertAlmostEqual(corner[1], 100-14/math.sqrt(2))

    def test_every_scene_bounds_reserve_the_body_radius(self):
        for scene, sid, bounds in (('city', None, dict(zip(('left', 'right', 'top', 'bottom'), world.CITY_BOUNDS))),
                                   ('base', None, WORLD_MAP['base']['bounds']),
                                   ('interior', 'shop-food', INTERIORS['shop-food']['bounds'])):
            with self.subTest(scene=scene):
                self.assertFalse(valid_position(scene, bounds['left'] + 1, bounds['bottom'] - 20, sid))
                self.assertFalse(valid_position(scene, bounds['right'] - 1, bounds['bottom'] - 20, sid))

    def test_public_room_body_cannot_clip_a_counter_at_an_outside_foot_position(self):
        room = {'id': 'test-room', 'bounds': {'left': 0, 'right': 300, 'top': 0, 'bottom': 300},
                'solids': [{'x': 100, 'y': 100, 'width': 20, 'height': 20}], 'seats': [],
                'spawn': {'x': 200, 'y': 200}}
        with patch.dict(world.INTERIORS, {'test-room': room}):
            self.assertFalse(valid_position('interior', 99, 110, 'test-room'))
            self.assertTrue(valid_position('interior', 86, 110, 'test-room'))
            self.assertEqual(world.nearest_interior_position(room, 99, 110), (86, 110))

    def test_city_sweep_stops_at_a_thin_support_even_with_a_clear_endpoint(self):
        with patch.object(world, 'CITY_BOUNDS', (0, 300, 0, 300)), \
                patch.object(world, 'CITY_FOOTPRINTS', ((100, 100, 2, 20),)):
            self.place(60, 110)
            result = self.world.move(self.uid, {'scene': 'city', 'x': 160, 'y': 110})
            self.assertEqual(result['position'], {'x': 86, 'y': 110})
            self.assertEqual(self.world.snapshot(self.uid)['position'], result['position'])

    def test_first_move_and_expired_presence_restore_the_authoritative_start_before_sweeping(self):
        with patch.object(world, 'CITY_BOUNDS', (0, 300, 0, 300)), \
                patch.object(world, 'CITY_SPAWN', (60, 110)), \
                patch.object(world, 'CITY_FOOTPRINTS', ((100, 100, 2, 20),)):
            # This account has never requested a world snapshot or sent a move.
            first = self.world.move(self.uid, {'scene': 'city', 'x': 160, 'y': 110})
            self.assertEqual(first['position'], {'x': 86, 'y': 110})
            self.now += world.PRESENCE_TTL+1
            again = self.world.move(self.uid, {'scene': 'city', 'x': 160, 'y': 110})
            self.assertEqual(again['position'], {'x': 86, 'y': 110})

    def test_city_sweep_preserves_safe_round_corners_and_slides_at_first_contact(self):
        with patch.object(world, 'CITY_BOUNDS', (0, 300, 0, 300)), \
                patch.object(world, 'CITY_FOOTPRINTS', ((100, 100, 20, 20),)):
            self.place(76, 104)
            safe = self.world.move(self.uid, {'scene': 'city', 'x': 104, 'y': 76})
            self.assertEqual(safe['position'], {'x': 104, 'y': 76})
            self.place(80, 100)
            slid = self.world.move(self.uid, {'scene': 'city', 'x': 180, 'y': 180})
            self.assertEqual(slid['position'], {'x': 86, 'y': 180})

    def test_curved_city_path_is_checked_segment_by_segment_and_keeps_the_actual_detour(self):
        with patch.object(world, 'CITY_BOUNDS', (0, 300, 0, 300)), \
                patch.object(world, 'CITY_FOOTPRINTS', ((100, 100, 20, 20),)):
            self.place(60, 110)
            path = [{'x': 60, 'y': 160}, {'x': 160, 'y': 160}, {'x': 160, 'y': 110}]
            result = self.world.move(self.uid, {'scene': 'city', 'x': 160, 'y': 110, 'path': path})
            self.assertEqual(result['position'], path[-1])
            self.place(60, 110)
            blocked = self.world.move(self.uid, {'scene': 'city', 'x': 220, 'y': 160,
                                                'path': [{'x': 160, 'y': 110}, {'x': 220, 'y': 160}]})
            self.assertEqual(blocked['position'], {'x': 86, 'y': 110}, 'The rest of a blocked path is not applied')

    def test_malformed_movement_paths_are_rejected_without_moving(self):
        self.place(*world.CITY_SPAWN)
        before = self.world.snapshot(self.uid)['position']
        cases = ([], 'path', [{'x': True, 'y': before['y']}], [{'x': float('nan'), 'y': before['y']}],
                 [{'x': before['x']+1, 'y': before['y']}], [before]*129)
        for path in cases:
            with self.subTest(path=str(path)[:100]), self.assertRaises(GameError):
                self.world.move(self.uid, {'scene': 'city', **before, 'path': path})
            self.assertEqual(self.world.snapshot(self.uid)['position'], before)

    def test_invalid_intermediate_point_rejects_the_whole_path_without_applied_prefix(self):
        with patch.object(world, 'CITY_BOUNDS', (0, 300, 0, 300)), \
                patch.object(world, 'CITY_FOOTPRINTS', ((100, 100, 20, 20),)):
            self.place(60, 110)
            with self.assertRaises(GameError) as error:
                self.world.move(self.uid, {'scene': 'city', 'x': 160, 'y': 110,
                    'path': [{'x': 60, 'y': 160}, {'x': 110, 'y': 110}, {'x': 160, 'y': 110}]})
            self.assertEqual(error.exception.code, 'invalid_movement_path')
            self.assertEqual(self.world.snapshot(self.uid)['position'], {'x': 60, 'y': 110})

    def test_public_room_sweep_blocks_a_counter_crossing_and_accepts_a_real_detour(self):
        room = {'id': 'test-room', 'bounds': {'left': 0, 'right': 300, 'top': 0, 'bottom': 300},
                'solids': [{'x': 100, 'y': 100, 'width': 2, 'height': 20}], 'seats': [],
                'spawn': {'x': 200, 'y': 200}}
        with patch.dict(world.INTERIORS, {'test-room': room}):
            self.place(60, 110, 'interior', 'test-room')
            result = self.world.move(self.uid, {'scene': 'interior', 'interior_id': 'test-room', 'x': 160, 'y': 110})
            self.assertEqual(result['position'], {'x': 86, 'y': 110})
            self.place(60, 110, 'interior', 'test-room')
            path = [{'x': 60, 'y': 160}, {'x': 160, 'y': 160}, {'x': 160, 'y': 110}]
            self.assertEqual(self.world.move(self.uid, {'scene': 'interior', 'interior_id': 'test-room',
                                                       'x': 160, 'y': 110, 'path': path})['position'], path[-1])

    def test_base_sweep_cannot_jump_through_furniture(self):
        item = {'id': 'solid-desk', 'type': 'desk', 'x': 5, 'y': 3, 'rotation': 0}
        self.save([item])
        box = world.base_footprints([item])[0]
        bx, by, width, height = box
        self.place(bx-30, by+height/2, 'base', self.cid)
        result = self.world.move(self.uid, {'scene': 'base', 'clan_id': self.cid,
                                           'x': bx+width+30, 'y': by+height/2})
        self.assertEqual(result['position'], {'x': bx-14, 'y': by+height/2})

    def test_browser_and_server_foot_sweeps_agree_at_edges_corners_and_multiple_supports(self):
        rng = random.Random(24014)
        boxes = ((100, 100, 20, 20), (180, 80, 2, 130), (80, 180, 90, 18))
        fixtures = []
        while len(fixtures)<240:
            a, b = [(rng.uniform(14, 286), rng.uniform(14, 286)) for _ in range(2)]
            if not world.body_footprint_contains(*a, boxes) and not world.body_footprint_contains(*b, boxes):
                fixtures.append({'a': dict(zip(('x', 'y'), a)), 'b': dict(zip(('x', 'y'), b))})
        code = """import {moveBetweenObstacles} from './web/city-collision.js';
        let input='';for await(const chunk of process.stdin)input+=chunk;
        const {fixtures,boxes}=JSON.parse(input),bounds={left:0,right:300,top:0,bottom:300};
        console.log(JSON.stringify(fixtures.map(({a,b})=>moveBetweenObstacles(a,b.x-a.x,b.y-a.y,boxes,bounds,14))));"""
        js = subprocess.run([shutil.which('node'), '--input-type=module', '-e', code],
                input=json.dumps({'fixtures': fixtures, 'boxes': [dict(zip(('x', 'y', 'width', 'height'), b)) for b in boxes]}),
                cwd=Path(__file__).resolve().parents[1], capture_output=True, text=True, check=True)
        for fixture, actual in zip(fixtures, json.loads(js.stdout)):
            expected = world.move_body_position(tuple(fixture['a'].values()), tuple(fixture['b'].values()), boxes)
            for coordinate, value in zip(('x', 'y'), expected):
                self.assertAlmostEqual(actual[coordinate], value, delta=1e-7, msg=str(fixture))

    def test_boat_curved_path_preserves_ownership_phone_and_cannot_skip_an_island_segment(self):
        lake = {'x': 150, 'y': 150, 'radius_x': 150, 'radius_y': 150,
                'outline': [[0, 0], [300, 0], [300, 300], [0, 300]],
                'islands': [{'x': 150, 'y': 150, 'radius_x': 25, 'radius_y': 25}]}
        boat = WORLD_MAP['boats'][0]['id']
        with patch.object(world, 'LAKE', lake):
            self.place(80, 150)
            with self.game.transaction() as db:
                db.execute('UPDATE world_boats SET x=80,y=150,occupant_id=?,updated=? WHERE id=?', (self.uid, self.now, boat))
            self.world.activity(self.uid, {'action': 'phone', 'open': True})
            for path in (None, [{'x': 220, 'y': 150}, {'x': 220, 'y': 80}, {'x': 220, 'y': 150}]):
                with self.subTest(path=path), self.assertRaises(GameError) as error:
                    self.world.move(self.uid, {'scene': 'city', 'boat_id': boat, 'x': 220, 'y': 150,
                                               **({'path': path} if path else {})})
                self.assertEqual(error.exception.code, 'boat_water_only')
                self.assertEqual(self.world.snapshot(self.uid)['position'], {'x': 80, 'y': 150})
            path = [{'x': 80, 'y': 80}, {'x': 220, 'y': 80}, {'x': 220, 'y': 150}]
            result = self.world.move(self.uid, {'scene': 'city', 'boat_id': boat, 'x': 220, 'y': 150, 'path': path})
            self.assertEqual(result['position'], path[-1])
            self.assertEqual(result['boat']['id'], boat)
            self.assertTrue(result['phone_open'])
            with self.game.transaction() as db:
                row = db.execute('SELECT x,y FROM world_boats WHERE occupant_id=?', (self.uid,)).fetchone()
                self.assertEqual((row['x'], row['y']), (220, 150))

    def test_pedestrian_foot_respects_shore_and_a_bridge_landing_as_one_dry_union(self):
        lake = {'x': 150, 'y': 150, 'radius_x': 150, 'radius_y': 150,
                'outline': [[0, 0], [300, 0], [300, 300], [0, 300]],
                'walkways': [{'id': 'bridge', 'width': 40, 'points': [[310, 150], [200, 150]]}]}
        self.assertFalse(water.pedestrian_lake_contains(lake, 310, 185))
        self.assertTrue(water.pedestrian_lake_contains(lake, 310, 185, 14), 'Dry center cannot put part of the foot in water')
        self.assertFalse(water.pedestrian_lake_contains(lake, 310, 157, 14), 'The bank and rounded bridge cap share the footprint')
        self.assertFalse(water.pedestrian_lake_contains(lake, 250, 156, 14), 'Touching the bridge edge is allowed')
        self.assertTrue(water.pedestrian_lake_contains(lake, 250, 157, 14))
        self.assertFalse(water.pedestrian_segment_crosses_lake(lake, (310, 150), (250, 150), 14))
        self.assertTrue(water.pedestrian_segment_crosses_lake(lake, (-20, -8), (320, -8), 14), 'A dry center path cannot sweep its lower half through water')

    def test_small_water_region_inside_a_foot_or_swept_capsule_is_not_missed(self):
        pond = {'x': 5, 'y': 5, 'radius_x': 1, 'radius_y': 1,
                'outline': [[4, 4], [6, 4], [6, 6], [4, 6]]}
        self.assertTrue(water.pedestrian_lake_contains(pond, 0, 0, 14))
        pond = {**pond, 'outline': [[44, 4], [46, 4], [46, 6], [44, 6]]}
        self.assertTrue(water.pedestrian_segment_crosses_lake(pond, (0, 0), (100, 0), 14))

    def test_body_water_recovery_keeps_the_local_bridge_instead_of_jump_to_a_distant_bank(self):
        lake = {'x': 150, 'y': 150, 'radius_x': 150, 'radius_y': 150,
                'outline': [[0, 0], [300, 0], [300, 300], [0, 300]],
                'walkways': [{'id': 'bridge', 'width': 40, 'points': [[310, 150], [200, 150]]}]}
        repaired = water.nearest_pedestrian_shore(lake, 250, 157, 14)
        self.assertEqual(repaired, (250, 156))
        self.assertFalse(water.pedestrian_lake_contains(lake, *repaired, 14))
        self.assertTrue(water.pedestrian_lake_contains(world.LAKE, 7912, 2748, 14))
        self.assertFalse(valid_position('city', 7912, 2748))
        actual = nearest_city_position(7912, 2748)
        self.assertTrue(valid_position('city', *actual))
        self.assertLess(math.dist(actual, (7912, 2748)), 64)

    def test_combined_water_and_support_recovery_never_places_a_foot_inside_a_tree(self):
        point = (8576, 2980)
        standalone_shore = water.nearest_pedestrian_shore(world.LAKE, *point, 14)
        self.assertTrue(world.body_footprint_contains(*standalone_shore, world.CITY_FOOTPRINTS))
        allowed = lambda p:not world.body_footprint_contains(*p, world.CITY_FOOTPRINTS)
        filtered_shore = water.nearest_pedestrian_shore(world.LAKE, *point, 14, allowed)
        self.assertTrue(allowed(filtered_shore))
        self.assertFalse(water.pedestrian_lake_contains(world.LAKE, *filtered_shore, 14))
        repaired = nearest_city_position(*point)
        self.assertTrue(valid_position('city', *repaired))
        self.assertLess(math.dist(repaired, point), 160)

    def test_browser_and_server_agree_on_whole_feet_and_capsules_at_water_bridge_and_island_boundaries(self):
        rng = random.Random(2414)
        square = {'x': 150, 'y': 150, 'radius_x': 150, 'radius_y': 150,
                  'outline': [[0, 0], [300, 0], [300, 300], [0, 300]],
                  'walkways': [{'id': 'bridge', 'width': 40, 'points': [[310, 150], [200, 150]]}]}
        ellipse = {'x': 150, 'y': 100, 'radius_x': 130, 'radius_y': 70, 'rotation': .43,
                   'islands': [{'x': 130, 'y': 110, 'radius_x': 22, 'radius_y': 12, 'rotation': -.4}]}
        groups = []
        for lake in (square, ellipse, world.LAKE):
            if lake is world.LAKE:
                xs, ys = zip(*lake['outline']);left,right,top,bottom=min(xs)-30,max(xs)+30,min(ys)-30,max(ys)+30
            else:left,right,top,bottom=-30,330,-30,330
            fixtures = [{'a': [rng.uniform(left,right), rng.uniform(top,bottom)],
                         'b': [rng.uniform(left,right), rng.uniform(top,bottom)]} for _ in range(48)]
            if lake is square:
                fixtures.extend({'a': [310, y], 'b': [250, y]} for y in (150,156,157,164,185))
            groups.append({'lake': lake, 'fixtures': fixtures})
        code = """import * as w from './web/water.js';
        let input='';for await(const chunk of process.stdin)input+=chunk;
        console.log(JSON.stringify(JSON.parse(input).map(({lake,fixtures})=>fixtures.map(({a,b})=>{
          const p={x:a[0],y:a[1]},q={x:b[0],y:b[1]};return {contains:w.pedestrianLakeContains(lake,p,14),
          crosses:w.pedestrianSegmentCrossesLake(lake,p,q,14),shore:w.nearestPedestrianShore(lake,p,14)};
        }))));"""
        js = subprocess.run([shutil.which('node'), '--input-type=module', '-e', code],
                             input=json.dumps(groups), cwd=Path(__file__).resolve().parents[1],
                             capture_output=True, text=True, check=True)
        for group, results in zip(groups, json.loads(js.stdout)):
            lake = group['lake']
            for fixture, actual in zip(group['fixtures'], results):
                a,b = fixture['a'],fixture['b']
                self.assertEqual(actual['contains'], water.pedestrian_lake_contains(lake, *a, 14), str(fixture))
                self.assertEqual(actual['crosses'], water.pedestrian_segment_crosses_lake(lake, a, b, 14), str(fixture))
                for coordinate, value in zip(('x', 'y'), water.nearest_pedestrian_shore(lake, *a, 14)):
                    self.assertAlmostEqual(actual['shore'][coordinate], value, delta=2e-5, msg=str(fixture))

    def test_standing_up_from_a_city_seat_places_the_full_body_outside_solids(self):
        bid, seat = next((bid, seat) for bid, seat in BENCHES.items()
                         if any(s['x'] < seat[0] < s['x'] + s['width'] and
                                s['y'] < seat[1] < s['y'] + s['height'] for s in CITY_OBSTACLES))
        self.place(*nearest_city_position(*seat))
        seated = self.world.activity(self.uid, {'action': 'sit', 'bench_id': bid})
        self.world.activity(self.uid, {'action': 'phone', 'open': True})
        standing = self.world.activity(self.uid, {'action': 'stand'})
        self.assertIsNone(standing['bench_id'])
        self.assertTrue(standing['phone_open'])
        self.assertTrue(self.solid_clear(standing['position'], CITY_OBSTACLES))
        self.assertLess(math.dist(tuple(standing['position'].values()), seat), 120)
        self.assertEqual(seated['position'], dict(zip(('x', 'y'), seat)))

    def test_saving_furniture_over_the_base_spawn_is_rejected_without_changing_layout(self):
        previous = self.save([])['base']['items']
        with self.assertRaises(GameError) as error:
            self.save([{'id': 'blocked-entry', 'type': 'desk', 'x': 5, 'y': 7, 'rotation': 0}])
        self.assertEqual(error.exception.code, 'base_entry_blocked')
        self.assertEqual(self.world.clan_snapshot(self.uid, self.cid)['base']['items'], previous)

    def test_saving_a_wall_of_furniture_cannot_disconnect_a_seat_from_the_entry(self):
        wall = [{'id': f'wall-{i}', 'type': 'cabinet', 'x': i*2, 'y': 5, 'rotation': 0} for i in range(6)]
        isolated = {'id': 'isolated-seat', 'type': 'chair', 'x': 2, 'y': 2, 'rotation': 0}
        with self.assertRaises(GameError) as error:
            self.save(wall+[isolated])
        self.assertEqual(error.exception.code, 'base_layout_blocked')
        self.assertEqual(self.world.clan_snapshot(self.uid, self.cid)['base']['items'], [])

    def test_retained_old_blocked_base_layout_repairs_the_player_locally_without_changing_furniture(self):
        blocked = {'id': 'legacy-block', 'type': 'desk', 'x': 5, 'y': 7, 'rotation': 0}
        self.world.move(self.uid, {'scene': 'base', **WORLD_MAP['base']['spawn']})
        self.world.activity(self.uid, {'action': 'phone', 'open': True})
        with self.game.transaction() as db:
            base = json.loads(db.execute('SELECT base FROM clans WHERE id=?', (self.cid,)).fetchone()['base'])
            base['items'] = [blocked]
            db.execute('UPDATE clans SET base=? WHERE id=?', (json.dumps(base), self.cid))
        repaired = self.world.snapshot(self.uid)
        with self.game.transaction() as db:
            self.assertTrue(valid_base_position(db, self.cid, **repaired['position']))
        self.assertEqual(repaired['scene_id'], self.cid)
        self.assertTrue(repaired['phone_open'])
        self.assertLess(math.dist(tuple(repaired['position'].values()), tuple(WORLD_MAP['base']['spawn'].values())), 100)
        with self.game.transaction() as db:
            self.assertEqual(json.loads(db.execute('SELECT base FROM clans WHERE id=?', (self.cid,)).fetchone()['base'])['items'], [blocked])
        self.now += 46
        again = WorldService(GameService(self.game.db_path), clock=lambda: self.now)
        self.assertEqual(again.snapshot(self.uid)['position'], repaired['position'])


if __name__ == '__main__':
    unittest.main()
