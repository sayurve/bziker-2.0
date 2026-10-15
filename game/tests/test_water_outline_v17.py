"""Direct authoritative geometry tests independent of the changing city layout."""
import unittest
import json
import random
import shutil
import subprocess
import tempfile
from pathlib import Path
from unittest.mock import patch
import water

BAY = {'x':150,'y':100,'radius_x':150,'radius_y':100,
       'outline':[[0,0],[100,0],[100,120],[200,120],[200,0],[300,0],[300,200],[0,200]],
       'islands':[{'x':55,'y':145,'radius_x':25,'radius_y':15,'rotation':.35}]}

class OrganicLakeTests(unittest.TestCase):
    def test_concave_shore_and_island_are_dry_and_boat_margins_follow_them(self):
        for x,y in ((150,40),(55,145),(0,180)):
            self.assertFalse(water.lake_contains(BAY,x,y))
        self.assertTrue(water.lake_contains(BAY,250,40))
        self.assertFalse(water.lake_contains(BAY,5,180,12))
        self.assertFalse(water.lake_contains(BAY,25,145,12))
        self.assertTrue(water.lake_contains({'x':0,'y':0,'radius_x':100,'radius_y':40},90,0))

    def test_whole_pedestrian_segments_block_only_water_not_dry_island_paths(self):
        self.assertFalse(water.segment_crosses_lake(BAY,(110,40),(190,40)))
        self.assertFalse(water.segment_crosses_lake(BAY,(50,145),(60,145)))
        self.assertFalse(water.segment_crosses_lake(BAY,(120,120),(180,120)))
        self.assertTrue(water.segment_crosses_lake(BAY,(-30,40),(330,40)))
        self.assertTrue(water.segment_crosses_lake(BAY,(120,119),(180,121)))

    def test_authoritative_boat_segment_cannot_cross_an_island_or_dry_headland(self):
        self.assertTrue(callable(getattr(water,'segment_stays_in_lake',None)))
        self.assertFalse(water.segment_stays_in_lake(BAY,(20,145),(90,145),2))
        self.assertFalse(water.segment_stays_in_lake(BAY,(50,40),(250,40),2))
        self.assertTrue(water.segment_stays_in_lake(BAY,(210,160),(280,160),2))
        # Endpoint-only validation would wrongly accept both illegal crossings.
        for point in ((20,145),(90,145),(50,40),(250,40)):
            self.assertTrue(water.lake_contains(BAY,*point,2))

    def test_nearest_shore_uses_concave_edge_and_can_recover_to_water_or_dry_island(self):
        shore=water.nearest_shore(BAY,110,140,5)
        self.assertAlmostEqual(shore[0],110);self.assertAlmostEqual(shore[1],115)
        self.assertFalse(water.lake_contains(BAY,*shore))
        island=water.nearest_shore(BAY,55,171,3)
        self.assertFalse(water.lake_contains(BAY,*island))
        self.assertLess((island[0]-55)**2+(island[1]-145)**2,26**2)
        self.assertTrue(water.lake_contains(BAY,*water.nearest_shore(BAY,110,140,-8),7))

BRIDGED_BAY={**BAY,'walkways':[{'id':'island-bridge','points':[[310,145],[55,145]],'width':20}]}

class PedestrianBridgeTests(unittest.TestCase):
    def test_only_authored_bridge_strip_allows_walkers_while_boats_keep_island_collision(self):
        self.assertTrue(callable(getattr(water,'pedestrian_lake_contains',None)))
        self.assertTrue(callable(getattr(water,'pedestrian_segment_crosses_lake',None)))
        self.assertTrue(water.lake_contains(BRIDGED_BAY,250,145))
        self.assertFalse(water.pedestrian_lake_contains(BRIDGED_BAY,250,154))
        self.assertTrue(water.pedestrian_lake_contains(BRIDGED_BAY,250,156))
        self.assertFalse(water.pedestrian_segment_crosses_lake(BRIDGED_BAY,(310,154),(55,154)))
        self.assertTrue(water.pedestrian_segment_crosses_lake(BRIDGED_BAY,(150,40),(55,145)))
        self.assertTrue(water.pedestrian_segment_crosses_lake(BRIDGED_BAY,(310,145),(55,190)))
        self.assertFalse(water.segment_stays_in_lake(BRIDGED_BAY,(20,145),(90,145),2))
        self.assertTrue(water.pedestrian_segment_crosses_lake(BAY,(310,145),(55,145)))

class CrossRuntimeGeometryTests(unittest.TestCase):
    def test_browser_and_server_agree_on_every_boundary_and_shore_recovery(self):
        rng=random.Random(1706)
        ellipse={'x':150,'y':100,'radius_x':130,'radius_y':70,'rotation':.43,
                 'islands':[{'x':130,'y':110,'radius_x':22,'radius_y':12,'rotation':-.4}]}
        fixtures=[]
        for lake in (BAY,ellipse,BRIDGED_BAY):
            for _ in range(120):
                a=[rng.uniform(-40,340),rng.uniform(-40,240)]
                b=[rng.uniform(-40,340),rng.uniform(-40,240)]
                fixtures.append({'lake':lake,'a':a,'b':b})
        code="""import * as w from './web/water.js';
        let data='';for await(const c of process.stdin)data+=c;
        const result=JSON.parse(data).map(({lake,a,b})=>{
          const p={x:a[0],y:a[1]},q={x:b[0],y:b[1]};
          return {contains:[-5,0,2,12].map(i=>w.lakeContains(lake,p,i)),
            crosses:[0,2].map(i=>w.segmentCrossesLake(lake,p,q,i)),stays:w.segmentStaysInLake(lake,p,q,12),
            pedestrianContains:w.pedestrianLakeContains(lake,p),pedestrianCrosses:w.pedestrianSegmentCrossesLake(lake,p,q),
            shores:[18,-12].map(i=>Object.values(w.nearestShore(lake,p,i)))};
        });console.log(JSON.stringify(result));"""
        result=subprocess.run([shutil.which('node'),'--input-type=module','-e',code],
                              input=json.dumps(fixtures),text=True,capture_output=True,check=True,
                              cwd=Path(__file__).resolve().parents[1])
        actual=json.loads(result.stdout)
        for fixture,js in zip(fixtures,actual):
            lake,a,b=fixture['lake'],fixture['a'],fixture['b']
            self.assertEqual(js['contains'],[water.lake_contains(lake,*a,i) for i in (-5,0,2,12)])
            self.assertEqual(js['crosses'],[water.segment_crosses_lake(lake,a,b,i) for i in (0,2)])
            self.assertEqual(js['stays'],water.segment_stays_in_lake(lake,a,b,12))
            self.assertEqual(js['pedestrianContains'],water.pedestrian_lake_contains(lake,*a))
            self.assertEqual(js['pedestrianCrosses'],water.pedestrian_segment_crosses_lake(lake,a,b))
            for padding,shore in zip((18,-12),js['shores']):
                py=water.nearest_shore(lake,*a,padding)
                for left,right in zip(shore,py):self.assertAlmostEqual(left,right,delta=2e-5)

class AuthoritativeIslandTests(unittest.TestCase):
    def test_forged_boat_move_across_island_is_rejected_and_does_not_write_position(self):
        from game import GameService,GameError
        from world import WorldService,WORLD_MAP
        from economy import EconomyService
        with tempfile.TemporaryDirectory() as folder:
            game=GameService(Path(folder)/'water.db');world=WorldService(game,clock=lambda:1000)
            economy=EconomyService(game,world);uid=game.create_account();game.profile(uid,{'name':'Island Sailor'})
            boat=WORLD_MAP['boats'][0]
            from world_fixtures import fixture_position
            fixture_position(world,uid,boat['boarding']['x'],boat['boarding']['y'])
            economy.action(uid,{'action':'boat-board','target_id':boat['id']})
            world.activity(uid,{'action':'phone','open':True})
            x,y=boat['dock']['x'],boat['dock']['y']
            # Keep real ownership/state, changing only geometry to a known bay
            # around the current dock. Both endpoints pass target-only checks.
            lake={'x':x,'y':y,'radius_x':400,'radius_y':300,
                  'outline':[[x-400,y-300],[x+400,y-300],[x+400,y+300],[x-400,y+300]],
                  'islands':[{'x':x+80,'y':y,'radius_x':22,'radius_y':35}],
                  'walkways':[{'id':'boat-cannot-use-pedestrian-bridge','points':[[x-50,y],[x+200,y]],'width':24}]}
            self.assertTrue(water.lake_contains(lake,x+160,y,12))
            with patch('world.LAKE',lake):
                before=world.snapshot(uid)
                with self.assertRaises(GameError) as error:
                    world.move(uid,{'scene':'city','boat_id':boat['id'],'x':x+160,'y':y})
                self.assertEqual(error.exception.code,'boat_water_only')
                after=world.snapshot(uid)
                self.assertEqual(after['position'],before['position']);self.assertTrue(after['phone_open'])
                self.assertEqual(after['boat'],before['boat'])
                with game.transaction() as db:
                    saved=db.execute('SELECT x,y FROM world_boats WHERE occupant_id=?',(uid,)).fetchone()
                    self.assertEqual((saved['x'],saved['y']),(x,y))
                # A genuine water path on the same boat remains allowed.
                safe={'x':x,'y':y+80}
                self.assertEqual(world.move(uid,{'scene':'city','boat_id':boat['id'],**safe})['position'],safe)

class AuthoritativePedestrianBridgeTests(unittest.TestCase):
    def test_bridge_walk_and_recovery_work_but_side_steps_and_diagonal_shortcuts_are_rejected(self):
        from game import GameService,GameError
        from world import WorldService,valid_position,nearest_city_position
        with tempfile.TemporaryDirectory() as folder:
            game=GameService(Path(folder)/'bridge.db');world=WorldService(game,clock=lambda:1000)
            uid=game.create_account();game.profile(uid,{'name':'Bridge Walker'});world.snapshot(uid)
            ox,oy=4000,2000
            lake={**BRIDGED_BAY,'x':BAY['x']+ox,'y':BAY['y']+oy,
                  'outline':[[x+ox,y+oy] for x,y in BAY['outline']],
                  'islands':[{**island,'x':island['x']+ox,'y':island['y']+oy} for island in BAY['islands']],
                  # A complete circular foot needs a 28px-wide passage.
                  'walkways':[{'id':'test-bridge','width':48,'points':[[310+ox,145+oy],[55+ox,145+oy]]}]}
            def start(x,y):
                with game.transaction() as db:
                    for table in ('presence','world_positions'):
                        db.execute(f'UPDATE {table} SET x=?,y=? WHERE account_id=?',(x+ox,y+oy,uid))
            # Isolate the water contract from unrelated city buildings; account,
            # API, saved position, phone state and all water checks remain real.
            with patch('world.LAKE',lake),patch('world.CITY_FOOTPRINTS',()):
                start(310,154);world.activity(uid,{'action':'phone','open':True})
                midpoint={'x':250+ox,'y':154+oy}
                self.assertTrue(valid_position('city',**midpoint))
                self.assertEqual(world.move(uid,{'scene':'city',**midpoint})['position'],midpoint)
                self.assertEqual(nearest_city_position(**midpoint),tuple(midpoint.values()),'restart repair keeps bridge feet in place')
                self.assertEqual(world.snapshot(uid)['position'],midpoint)
                island={'x':55+ox,'y':154+oy}
                self.assertEqual(world.move(uid,{'scene':'city',**island})['position'],island)
                self.assertTrue(world.snapshot(uid)['phone_open'])
                for initial,target in (((310,154),(250,156)),((150,40),(55,145))):
                    start(*initial)
                    with self.assertRaises(GameError) as error:
                        world.move(uid,{'scene':'city','x':target[0]+ox,'y':target[1]+oy})
                    self.assertEqual(error.exception.code,'water_blocked')
                    self.assertEqual(world.snapshot(uid)['position'],{'x':initial[0]+ox,'y':initial[1]+oy})

if __name__=='__main__': unittest.main()
