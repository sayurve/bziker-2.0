"""Shared roaming paths, authority and backwards-compatible city snapshots."""
import json
import math
import subprocess
import tempfile
import unittest
from pathlib import Path
from contextlib import contextmanager
from animals import ANIMALS, animal_position, animals_at
from game import GameService, GameError
from world import WorldService, WORLD_MAP, CITY_OBSTACLES, valid_position
from water import segment_crosses_lake
from economy import EconomyService
from world_fixtures import fixture_position


class AmbientAnimalTests(unittest.TestCase):
    def test_catalog_retains_legacy_animals_and_adds_walkers(self):
        tree_supports={b['id']:b for b in CITY_OBSTACLES if b['kind']=='tree'}
        self.assertEqual(len(ANIMALS), 12)
        self.assertEqual(ANIMALS['park-dog']['kind'], 'dog')
        self.assertEqual(ANIMALS['park-cat']['kind'], 'cat')
        self.assertEqual({a['kind'] for a in ANIMALS.values()}, {'dog', 'cat'})
        for animal in ANIMALS.values():
            for a, b in zip(animal['route'], animal['route'][1:] + animal['route'][:1]):
                self.assertFalse(segment_crosses_lake(WORLD_MAP['lake'], (a['x'],a['y']), (b['x'],b['y'])))
                for index in range(41):
                    p={'x':a['x']+(b['x']-a['x'])*index/40,'y':a['y']+(b['y']-a['y'])*index/40}
                    self.assertTrue(valid_position('city', p['x'], p['y']), (animal['id'], p))
                    for tree in WORLD_MAP['decor']['trees']:
                        if 'radius' in tree:
                            clearance=math.hypot(p['x']-tree['x'],p['y']-tree['y'])-tree['radius']
                        else:
                            # New art uses scaled ground rectangles, rather
                            # than a canopy radius, shared with the server.
                            support=tree_supports[tree['id']]
                            clearance=math.hypot(max(support['x']-p['x'],0,p['x']-support['x']-support['width']),
                                                 max(support['y']-p['y'],0,p['y']-support['y']-support['height']))
                        self.assertGreaterEqual(clearance,18,(animal['id'],tree['id']))

    def test_route_has_real_movement_and_dwell_and_continuous_pause_resume(self):
        animal=next(iter(ANIMALS.values()))
        states=[animal_position(animal, i/50) for i in range(5000)]
        self.assertTrue(any(s['walking'] for s in states));self.assertTrue(any(not s['walking'] for s in states))
        self.assertGreater(len({(round(s['x']),round(s['y'])) for s in states}), 20)
        pause={'started_at':4.5,'duration':2}
        self.assertEqual(animal_position(animal, 4.5,pause)['x'], animal_position(animal,6.3,pause)['x'])
        before=animal_position(animal, 6.5-1e-5,pause);after=animal_position(animal,6.5+1e-5,pause)
        self.assertLess(math.hypot(after['x']-before['x'],after['y']-before['y']), .01)
        self.assertFalse(animal_position(animal,5,pause)['walking'])
        self.assertEqual(animal_position(animal,9,pause),animal_position(animal,9))

    def test_javascript_and_python_positions_match(self):
        times=[-10,0,.1,3,4.5,5,6,7,1000,1791579599.123]
        script="import {ambientAnimals,animalPosition} from './web/ambient-animals.js'; console.log(JSON.stringify(ambientAnimals.map(a=>"+json.dumps(times)+".map(t=>animalPosition(a,t,{started_at:3,duration:2,route_time:2.2})))));"
        result=json.loads(subprocess.check_output(['node','--input-type=module','-e',script],cwd=Path(__file__).resolve().parent.parent))
        for animal, states in zip(ANIMALS.values(), result):
            for time, js in zip(times, states):
                py=animal_position(animal,time,{'started_at':3,'duration':2,'route_time':2.2})
                for key in ('x','y'):self.assertAlmostEqual(py[key],js[key],places=7)
                for key in ('id','kind','walking','facing','walk_frame'):self.assertEqual(py[key],js[key])

    def test_actual_position_controls_pet_distance_and_pause_has_no_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            game=GameService(Path(directory)/'animals.db');now=[1000]
            world=WorldService(game,clock=lambda:now[0]);economy=EconomyService(game,world)
            uid=game.create_account();game.profile(uid,{'name':'Roaming tester'})
            animal=ANIMALS['plaza-dog'];point=animal_position(animal,now[0])
            fixture_position(world,uid,point['x']+150,point['y'])
            with self.assertRaises(GameError) as error:economy.action(uid,{'action':animal['action'],'target_id':animal['id']})
            self.assertEqual(error.exception.code,'activity_distance')
            fixture_position(world,uid,point['x'],point['y'])
            effect=economy.action(uid,{'action':animal['action'],'target_id':animal['id']})['pet_effect']
            now[0]+=.8;snapshot=world.snapshot(uid);actual=next(a for a in snapshot['animals'] if a['id']==animal['id'])
            self.assertEqual(snapshot['server_time'],now[0]);self.assertFalse(actual['walking'])
            self.assertAlmostEqual(actual['x'],point['x']);self.assertAlmostEqual(actual['y'],point['y'])
            self.assertEqual(actual['pause'],{'started_at':effect['started_at'],'duration':2,'route_time':effect['started_at']})
            self.assertNotIn('account_id',json.dumps(snapshot['animals']));self.assertNotIn(uid,json.dumps(snapshot['animals']))
            with game.transaction() as db:
                self.assertEqual(db.execute('SELECT COUNT(*) FROM world_pet_effects').fetchone()[0],1)
            now[0]+=4;self.assertNotIn('pause',next(a for a in world.snapshot(uid)['animals'] if a['id']==animal['id']))

    def test_overlapping_petters_keep_the_actual_frozen_point_then_resume_without_a_jump(self):
        with tempfile.TemporaryDirectory() as directory:
            game=GameService(Path(directory)/'overlap.db')
            animal=ANIMALS['plaza-dog']
            now=[next(t for t in range(1000,1100) if animal_position(animal,t)['walking'])]
            world=WorldService(game,clock=lambda:now[0]);economy=EconomyService(game,world)
            users=[game.create_account() for _ in range(2)]
            point=animal_position(animal,now[0])
            self.assertTrue(point['walking'])
            for index,uid in enumerate(users):
                game.profile(uid,{'name':'Overlapping petter '+str(index)})
                fixture_position(world,uid,point['x'],point['y'])
            economy.action(users[0],{'action':animal['action'],'target_id':animal['id']})
            now[0]+=.8;economy.action(users[1],{'action':animal['action'],'target_id':animal['id']})
            held=next(a for a in world.snapshot(users[0])['animals'] if a['id']==animal['id'])
            self.assertEqual(held['x'],point['x']);self.assertEqual(held['y'],point['y'])
            now[0]+=2-1e-5;before=next(a for a in world.snapshot(users[0])['animals'] if a['id']==animal['id'])
            now[0]+=2e-5;after=next(a for a in world.snapshot(users[0])['animals'] if a['id']==animal['id'])
            self.assertLess(math.hypot(after['x']-before['x'],after['y']-before['y']),.01)

    def test_snapshot_animals_add_no_sql_writes_or_private_room_animals(self):
        with tempfile.TemporaryDirectory() as directory:
            game=GameService(Path(directory)/'scope.db');world=WorldService(game,clock=lambda:1000)
            uid=game.create_account();game.profile(uid,{'name':'Animal scope'})
            city=world.snapshot(uid);self.assertEqual(len(city['animals']),12)
            statements=[];original=game.transaction
            @contextmanager
            def traced():
                with original() as db:
                    db.set_trace_callback(statements.append)
                    yield db
            game.transaction=traced
            world.snapshot(uid);world.snapshot(uid)
            self.assertFalse(any('WORLD_ANIMAL_PAUSES' in sql.upper() and sql.lstrip().upper().startswith(('INSERT','UPDATE','DELETE')) for sql in statements))
            world.enter(uid,{'building_id':'railway'})
            self.assertEqual(world.snapshot(uid)['animals'],[])


if __name__=='__main__':unittest.main()
