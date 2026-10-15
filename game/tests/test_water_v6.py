import json
import math
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from economy import EconomyService, change_balance, inventory_quantity
from game import GameError, GameService
from world import nearest_city_position, BENCHES, CITY_OBSTACLES, WORLD_MAP, WorldService, valid_position
from water import nearest_shore, lake_contains, segment_stays_in_lake, pedestrian_segment_crosses_lake
from world_fixtures import fixture_position


class WaterV6Tests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.g = GameService(Path(self.tmp.name) / 'water.db')
        self.now = 1000
        self.w = WorldService(self.g, clock=lambda: self.now)
        self.e = EconomyService(self.g, self.w)
        self.a, self.b = [self.g.create_account() for _ in range(2)]
        for uid, name in ((self.a, 'Water Alpha'), (self.b, 'Water Beta')):
            self.g.profile(uid, {'name': name})
            with self.g.transaction() as db: change_balance(db, uid, 1000, 'test:water')
        self.boat = WORLD_MAP['boats'][0]

    def deny(self, fn, *args, code):
        with self.assertRaises(GameError) as error: fn(*args)
        self.assertEqual(error.exception.code, code)

    def approach(self, uid, boat=None):
        boat = boat or self.boat
        route = next(route for route in WORLD_MAP['action_routes'] if route['id'] == 'boat-board-' + boat['id'])
        origin = WORLD_MAP['landmarks'][route['from']]
        self.assertEqual(self.w.move(uid, {'scene': 'city', 'teleport': True, **origin})['position'], origin)
        # The authored grid route may start a few pixels from the named
        # arrival. Walk that first segment too, through the actual water guard.
        for x, y in route['points']:
            result = self.w.move(uid, {'scene': 'city', 'x': x, 'y': y})
            self.assertEqual(result['position'], {'x': x, 'y': y})
        self.assertEqual(result['position'], {key: boat['boarding'][key] for key in ('x', 'y')})
        return result

    def action(self, uid, action, boat=None):
        return self.e.action(uid, {'action': action, 'target_id': (boat or self.boat)['id']})

    def board(self, uid=None):
        uid = uid or self.a; self.approach(uid)
        return self.action(uid, 'boat-board')

    def city_start(self,uid,point):
        """Prepare a nearby walker for a behavior test, never bypass its target."""
        self.assertTrue(valid_position('city',point['x'],point['y']))
        self.assertEqual(self.w.snapshot(uid)['scene'],'city')
        with self.g.transaction() as db:
            for table in ('presence','world_positions'):
                db.execute(f'UPDATE {table} SET x=?,y=? WHERE account_id=?', (point['x'],point['y'],uid))

    def water_point(self):
        """An actual navigable point reachable from this boat, not the lake centre
        (the redesigned centre may be occupied by a dry island)."""
        lake = WORLD_MAP['lake']; dock = self.boat['dock']
        for fraction in (.45,.35,.25,.55):
            point = {key:dock[key]+(lake[key]-dock[key])*fraction for key in ('x','y')}
            if (lake_contains(lake,**point,inset=12) and
                segment_stays_in_lake(lake,(dock['x'],dock['y']),(point['x'],point['y']),12) and
                math.hypot(point['x']-dock['x'],point['y']-dock['y'])>150):
                return point
        self.fail('Map has no navigable fishing approach from the first dock')

    def dry_crossing(self):
        """Isolate the water guard using two actual dry banks and no solid
        props along the crossing. Each endpoint has 14px body clearance."""
        lake=WORLD_MAP['lake'];xs,ys=zip(*lake['outline'])
        def clear(point):
            return valid_position('city',**point) and not any(
                math.hypot(max(b['x']-point['x'],0,point['x']-b['x']-b['width']),
                           max(b['y']-point['y'],0,point['y']-b['y']-b['height']))<14
                for b in CITY_OBSTACLES)
        for i in range(29):
            for padding in (40,60,80,100):
                left={'x':min(xs)-padding,'y':min(ys)+(max(ys)-min(ys))*(.15+i*.025)}
                right={'x':max(xs)+padding,'y':left['y']}
                solid_crossing=any(b['y']<left['y']<b['y']+b['height'] and
                                   b['x']<right['x'] and b['x']+b['width']>left['x']
                                   for b in CITY_OBSTACLES)
                if (clear(left) and clear(right) and not solid_crossing and
                        pedestrian_segment_crosses_lake(lake,(left['x'],left['y']),(right['x'],right['y']))):
                    return left,right
        self.fail('The actual lake has no dry 14px-clear shore pair with water as the crossing barrier')

    def test_water_is_not_walkable_and_segments_cannot_cut_through_the_lake(self):
        lake = WORLD_MAP['lake']
        point=self.water_point()
        self.assertFalse(valid_position('city', **point))
        self.deny(self.w.move, self.a, {'scene': 'city', **point}, code='water_blocked')
        left,right=self.dry_crossing()
        self.assertTrue(valid_position('city',**left));self.assertTrue(valid_position('city',**right))
        self.assertTrue(pedestrian_segment_crosses_lake(lake,(left['x'],left['y']),(right['x'],right['y'])))
        fixture_position(self.w,self.a,**left)
        self.deny(self.w.move, self.a, {'scene': 'city', **right}, code='water_blocked')
        self.assertEqual(self.w.snapshot(self.a)['position'], left)

    def test_explicit_travel_accepts_only_known_safe_destinations(self):
        lake = WORLD_MAP['lake']
        start = {'x': lake['x'] + lake['radius_x'] + 45, 'y': lake['y']}
        self.w.snapshot(self.a)
        with self.g.transaction() as db:
            db.execute('UPDATE presence SET x=?,y=? WHERE account_id=?',(start['x'],start['y'],self.a))
        arbitrary = {'x': lake['x'] - lake['radius_x'] - 45, 'y': lake['y']}
        self.deny(self.w.move, self.a, {'scene': 'city', 'teleport': True, **arbitrary}, code='travel_destination')
        self.assertEqual(self.w.snapshot(self.a)['position'], start)
        target = WORLD_MAP['landmarks']['plaza']
        self.assertEqual(self.w.move(self.a, {'scene': 'city', 'teleport': True, **target})['position'], target)

    def test_boat_ownership_is_atomic_one_seat_and_idempotent_for_owner(self):
        self.deny(self.e.action, self.a, {'action': 'boat-board', 'target_id': self.boat['id']}, code='boat_distance')
        self.approach(self.a); self.approach(self.b)
        def claim(uid):
            try: return self.action(uid, 'boat-board')['boat']
            except GameError as error:
                self.assertEqual(error.code, 'boat_occupied'); return None
        with ThreadPoolExecutor(max_workers=2) as pool: results = list(pool.map(claim, (self.a, self.b)))
        self.assertEqual(sum(result is not None for result in results), 1)
        owner = self.a if results[0] else self.b
        own = self.w.snapshot(owner)
        self.assertEqual(self.action(owner, 'boat-board')['boat'], own['boat'])
        self.assertEqual(next(boat for boat in own['boats'] if boat['id'] == self.boat['id'])['occupant_id'], owner)

    def test_boat_moves_only_in_water_and_phone_survives_board_move_and_exit(self):
        self.approach(self.a); self.w.activity(self.a, {'action': 'phone', 'open': True})
        boarded = self.action(self.a, 'boat-board')
        self.assertTrue(boarded['phone_open']); self.assertEqual(boarded['boat']['id'], self.boat['id'])
        lake = WORLD_MAP['lake']; point = self.water_point()
        moved = self.w.move(self.a, {'scene': 'city', 'boat_id': self.boat['id'], **point})
        self.assertEqual(moved['position'], point); self.assertTrue(moved['phone_open'])
        self.deny(self.w.move, self.a, {'scene': 'city', 'boat_id': self.boat['id'], **WORLD_MAP['landmarks']['plaza']}, code='boat_water_only')
        self.deny(self.action, self.a, 'boat-exit', code='boat_dock_distance')
        self.assertEqual(self.w.snapshot(self.a)['position'], point)
        self.w.move(self.a, {'scene': 'city', 'boat_id': self.boat['id'], **self.boat['dock']})
        exited = self.action(self.a, 'boat-exit')
        self.assertIsNone(exited['boat']); self.assertTrue(exited['phone_open'])
        self.assertEqual(exited['position'], {key: self.boat['boarding'][key] for key in ('x', 'y')})

    def test_other_account_cannot_move_or_exit_a_boat(self):
        self.board()
        self.approach(self.b)
        self.deny(self.w.move, self.b, {'scene': 'city', 'boat_id': self.boat['id'], **self.boat['dock']}, code='boat_not_owned')
        self.deny(self.action, self.b, 'boat-exit', code='boat_not_owned')
        self.assertEqual(self.w.snapshot(self.a)['boat']['id'], self.boat['id'])

    def test_disconnected_owner_returns_to_shore_and_boat_can_be_reclaimed(self):
        self.board(); lake = WORLD_MAP['lake']
        self.w.move(self.a, {'scene': 'city', 'boat_id': self.boat['id'], **self.water_point()})
        self.now += 46
        self.approach(self.b); self.action(self.b, 'boat-board')
        restored = self.w.snapshot(self.a)
        self.assertIsNone(restored['boat'])
        self.assertEqual(restored['position'], {key: self.boat['boarding'][key] for key in ('x', 'y')})
        self.assertEqual(self.w.snapshot(self.b)['boat']['id'], self.boat['id'])

    def test_restart_keeps_active_boat_owner_and_position(self):
        self.board(); lake = WORLD_MAP['lake']
        point = self.water_point()
        self.w.move(self.a, {'scene': 'city', 'boat_id': self.boat['id'], **point})
        again = WorldService(GameService(self.g.db_path), clock=lambda: self.now + 10)
        restored = again.snapshot(self.a)
        self.assertEqual(restored['boat']['id'], self.boat['id']); self.assertEqual(restored['position'], point)

    def test_legacy_player_in_water_is_relocated_to_shore_and_keeps_progress(self):
        lake = WORLD_MAP['lake']; point=self.water_point(); self.w.snapshot(self.a)
        with self.g.transaction() as db:
            db.execute('UPDATE presence SET x=?,y=? WHERE account_id=?', (point['x'], point['y'], self.a))
            db.execute('UPDATE world_positions SET x=?,y=? WHERE account_id=?', (point['x'], point['y'], self.a))
        restored = self.w.snapshot(self.a)
        self.assertTrue(valid_position('city', **restored['position']))
        # Whole-foot recovery chooses a dry bank jointly with city supports;
        # projecting to the point-only shore first can choose a blocked tree.
        self.assertEqual(restored['position'],dict(zip(('x','y'),nearest_city_position(point['x'],point['y']))))
        self.assertLessEqual(math.hypot(restored['position']['x']-lake['x'],restored['position']['y']-lake['y']),
                             max(lake['radius_x'],lake['radius_y'])+18)
        self.assertEqual(self.e.snapshot(self.a)['balance'], 1000)
        self.assertEqual(self.g.bootstrap(self.a)['profile']['name'], 'Water Alpha')

    def test_boat_fishing_requires_owned_rod_and_current_own_boat_and_is_idempotent(self):
        self.board(); spot = 'boat:' + self.boat['id']
        self.deny(self.e.start_fishing, self.a, {'spot_id': spot}, code='rod_required')
        self.e.buy(self.a, {'item_id': 'rod'})
        session = self.e.start_fishing(self.a, {'spot_id': spot})['active']
        self.assertEqual(self.e.start_fishing(self.a, {'spot_id': spot})['active']['id'], session['id'])
        self.deny(self.e.start_fishing, self.b, {'spot_id': spot}, code='boat_not_owned')
        self.now += 2
        with ThreadPoolExecutor(max_workers=2) as pool: caught = list(pool.map(lambda _: self.e.catch_fish(self.a, session['id']), range(2)))
        self.assertEqual(caught[0], caught[1])
        with self.g.transaction() as db: self.assertEqual(inventory_quantity(db, self.a, 'fish'), 1)
        self.action(self.a, 'boat-exit')
        self.assertEqual(self.e.catch_fish(self.a, session['id']), caught[0])
        self.deny(self.e.start_fishing, self.a, {'spot_id': spot}, code='boat_not_owned')

    def test_exiting_before_a_catch_cancels_boat_fishing_and_allows_a_new_shore_cast(self):
        self.board();self.e.buy(self.a,{'item_id':'rod'})
        pending=self.e.start_fishing(self.a,{'spot_id':'boat:'+self.boat['id']})['active']
        self.action(self.a,'boat-exit')
        self.assertIsNone(self.e.fishing(self.a)['active'])
        point=next(p for p in WORLD_MAP['activities'] if p['action']=='fishing')
        self.city_start(self.a,point)
        self.w.move(self.a,{'scene':'city','x':point['x'],'y':point['y']})
        new=self.e.start_fishing(self.a,{'spot_id':point['id']})['active']
        self.assertNotEqual(new['id'],pending['id']);self.assertEqual(new['spot_id'],point['id'])
        self.now+=2
        self.deny(self.e.catch_fish,self.a,pending['id'],code='fishing_cancelled')
        self.e.catch_fish(self.a,new['id'])
        with self.g.transaction() as db:self.assertEqual(inventory_quantity(db,self.a,'fish'),1)

    def test_pet_effect_is_authoritative_visible_and_expires_without_moving_the_actor(self):
        for action, kind in (('pet-dog', 'dog'), ('pet-cat', 'cat')):
            point = next(p for p in WORLD_MAP['activities'] if p['action'] == action)
            animal=next(a for a in self.w.snapshot(self.a)['animals'] if a['id']==point['id'])
            position={key:animal[key] for key in ('x','y')}
            # Isolate effect authority using the animal's current real position.
            # The stationary map marker is only its initial spawn.
            self.city_start(self.a,position)
            self.assertEqual(self.w.move(self.a, {'scene': 'city', **position})['position'],position)
            self.w.activity(self.a, {'action': 'phone', 'open': True})
            before = self.w.snapshot(self.a)
            result = self.e.action(self.a, {'action': action, 'target_id': point['id']})
            effect = result['pet_effect']
            self.assertEqual(effect['kind'], kind); self.assertEqual(effect['target_id'], point['id'])
            self.assertEqual(effect['started_at'], self.now); self.assertEqual(effect['duration'], 2)
            after = self.w.snapshot(self.a)
            self.assertEqual(after['position'], before['position']); self.assertEqual(after['pose'], before['pose'])
            self.assertTrue(after['phone_open'])
            self.assertEqual(next(p for p in self.w.snapshot(self.b)['players'] if p['id'] == self.a)['pet_effect']['id'], effect['id'])
            self.now += 3; self.assertIsNone(self.w.snapshot(self.a)['pet_effect'])

    def test_own_pet_action_requires_an_equipped_owned_pet_and_preserves_seat(self):
        self.deny(self.e.action, self.a, {'action': 'pet', 'target_id': 'pet-cat'}, code='pet_not_owned')
        self.e.buy(self.a, {'item_id': 'pet-cat'}); self.e.use(self.a, {'item_id': 'pet-cat'})
        bench, (x, y) = next(iter(BENCHES.items()))
        fixture_position(self.w,self.a,*nearest_city_position(x,y))
        self.w.activity(self.a, {'action': 'sit', 'bench_id': bench})
        self.w.activity(self.a, {'action': 'phone', 'open': True})
        result = self.e.action(self.a, {'action': 'pet', 'target_id': 'pet-cat'})
        after = self.w.snapshot(self.a)
        self.assertEqual(result['pet_effect']['kind'], 'cat')
        self.assertEqual(after['pose'], 'sit'); self.assertEqual(after['bench_id'], bench)
        self.assertEqual(after['position'], {'x': x, 'y': y}); self.assertTrue(after['phone_open'])

    def test_jury_blackout_releases_boat_and_does_not_expose_effects(self):
        self.board()
        lid = self.g.create_lobby(self.b, {'title': 'Boat juror', 'mode': 'individual'})['id']
        self.g.join(self.a, self.g.snapshot(self.b, lid)['jury_code'])
        restricted = self.w.snapshot(self.a)
        self.assertIsNone(restricted['boat']); self.assertEqual(restricted['boats'], [])
        self.assertIsNone(restricted['pet_effect'])
        self.deny(self.action, self.a, 'boat-board', code='jury_restricted')
        self.approach(self.b)
        self.assertEqual(self.action(self.b, 'boat-board')['boat']['id'], self.boat['id'])

    def test_quiz_start_releases_boat_and_active_participant_cannot_reboard(self):
        self.board()
        lid=self.g.create_lobby(self.b,{'title':'Boat quiz','mode':'individual'})['id']
        lobby=self.g.snapshot(self.b,lid)
        self.g.join(self.a,lobby['player_code'])
        juror=self.g.create_account();self.g.profile(juror,{'name':'Boat Curator'})
        self.g.join(juror,lobby['jury_code'])
        self.g.mutate(self.b,lid,'start',{})
        current=self.w.snapshot(self.a)
        self.assertEqual(current['scene'],'arena');self.assertIsNone(current['boat'])
        self.deny(self.action,self.a,'boat-board',code='match_conflict')
        with self.g.transaction() as db:
            self.assertIsNone(db.execute('SELECT occupant_id FROM world_boats WHERE id=?',(self.boat['id'],)).fetchone()['occupant_id'])

    def test_card_start_releases_boat_and_active_player_cannot_reboard(self):
        from cards import CardService
        self.board()
        cards=CardService(self.g,self.e,clock=lambda:self.now)
        table=cards.create(self.a,{'game':'poker','title':'Boat cards','source':'casino','stake':10})
        cards.mutate(self.b,table['id'],'join',{});cards.mutate(self.a,table['id'],'start',{})
        self.deny(self.action,self.a,'boat-board',code='match_conflict')
        current=self.w.snapshot(self.a)
        self.assertEqual(current['scene'],'cards');self.assertIsNone(current['boat'])
        with self.g.transaction() as db:
            self.assertIsNone(db.execute('SELECT occupant_id FROM world_boats WHERE id=?',(self.boat['id'],)).fetchone()['occupant_id'])

    def test_boating_prevents_other_scene_seat_teleport_and_own_pet_actions(self):
        self.e.buy(self.a,{'item_id':'pet-cat'});self.e.use(self.a,{'item_id':'pet-cat'})
        before=self.board()['position']
        self.deny(self.w.move,self.a,{'scene':'city','teleport':True,**WORLD_MAP['landmarks']['plaza']},code='boat_exit_required')
        self.deny(self.w.move,self.a,{'scene':'base','x':600,'y':510},code='boat_exit_required')
        self.deny(self.w.activity,self.a,{'action':'sit','bench_id':next(iter(BENCHES))},code='boat_exit_required')
        self.deny(self.e.action,self.a,{'action':'pet','target_id':'pet-cat'},code='boat_exit_required')
        self.assertEqual(self.w.snapshot(self.a)['position'],before)

    def test_pet_effect_preserves_interior_and_clan_base_presence(self):
        from world import INTERIORS
        from clan_fixtures import legacy_home
        self.e.buy(self.a,{'item_id':'pet-cat'});self.e.use(self.a,{'item_id':'pet-cat'})
        room=INTERIORS['clans']
        # Enter via the real authorized frontage; a direct cross-city segment
        # from the fishing side would correctly be rejected at the lake.
        self.w.move(self.a,{'scene':'city','teleport':True,'x':room['door']['x'],'y':room['door']['y']+24})
        self.w.enter(self.a,{'building_id':room['id']})
        clan=self.w.create_clan(self.a,{'name':'Water Base','color':'#010203','flag':'W'})
        legacy_home(self.g,clan['id'])
        for scene in ('interior','base'):
            if scene=='base':self.w.move(self.a,{'scene':'base','clan_id':clan['id'],'x':600,'y':510})
            before=self.w.activity(self.a,{'action':'phone','open':True})
            result=self.e.action(self.a,{'action':'pet','target_id':'pet-cat'})
            after=self.w.snapshot(self.a)
            self.assertEqual(after['scene'],scene);self.assertEqual(after['position'],before['position'])
            self.assertEqual(after['pose'],before['pose']);self.assertTrue(after['phone_open'])
            self.assertEqual(after['pet_effect']['id'],result['pet_effect']['id'])


if __name__ == '__main__': unittest.main()
