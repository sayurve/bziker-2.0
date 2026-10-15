import json
import tempfile
import unittest
from pathlib import Path
from game import GameService, GameError
from world import nearest_city_position, WorldService, CITY_SPAWN, CITY_BOUNDS, BENCHES, valid_position
from world_fixtures import fixture_position

ROOT=Path(__file__).resolve().parents[1]
MAP=json.loads((ROOT/'web/world-map.json').read_text())


class WorldV5Tests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.g=GameService(Path(self.tmp.name)/'world.db')
        self.w=WorldService(self.g,clock=lambda:1000)
        self.a,self.b,self.c=[self.g.create_account() for _ in range(3)]
        for uid,name in zip((self.a,self.b,self.c),('MapAlpha','MapBeta','MapGamma')):self.g.profile(uid,{'name':name})

    def test_shared_geometry_and_two_actual_slots_on_one_bench(self):
        self.assertEqual(CITY_SPAWN,tuple(MAP['spawn'].values()))
        bounds=MAP['walkable'];self.assertEqual(CITY_BOUNDS,(bounds['left'],bounds['right'],bounds['top'],bounds['bottom']))
        from world import CITY_OBSTACLES
        for solid in CITY_OBSTACLES:
            self.assertFalse(valid_position('city',solid['x']+solid['width']/2,solid['y']+solid['height']/2))
        slots=MAP['benches'][:2]
        for uid,slot in zip((self.a,self.b),slots):
            self.assertIn(slot['id'],BENCHES)
            fixture_position(self.w,uid,*nearest_city_position(**slot['seat']))
            seated=self.w.activity(uid,{'action':'sit','bench_id':slot['id']})
            self.assertEqual(seated['position'],slot['seat'])
        fixture_position(self.w,self.c,*nearest_city_position(**slots[0]['seat']))
        with self.assertRaises(GameError) as error:self.w.activity(self.c,{'action':'sit','bench_id':slots[0]['id']})
        self.assertEqual(error.exception.code,'bench_occupied')
        self.assertNotEqual(slots[0]['seat'],slots[1]['seat'])

    def test_one_time_legacy_map_migration_preserves_progress_and_newcomer_spawn(self):
        previous=MAP['previous_landmarks']
        with self.g.transaction() as db:
            db.execute('DELETE FROM world_metadata')
            for uid,name,scene in ((self.a,'station','city'),(self.b,'district','district')):
                x,y=previous[name]['x']+10,previous[name]['y']+15
                db.execute('INSERT OR REPLACE INTO presence(account_id,x,y,scene,scene_id,updated) VALUES (?,?,?,?,NULL,?)',(uid,x,y,scene,1000))
            db.execute('UPDATE wallets SET balance=77 WHERE account_id=?',(self.a,))
        again=WorldService(GameService(self.g.db_path),clock=lambda:1000)
        for uid,name in ((self.a,'station'),(self.b,'district')):
            point=MAP['landmarks'][name]
            self.assertEqual(again.snapshot(uid)['position'],dict(zip(('x','y'),nearest_city_position(point['x']+10,point['y']+15))))
        self.assertEqual(again.snapshot(self.c)['position'],MAP['spawn'])
        self.assertEqual(again.snapshot(self.a)['wallet']['balance'],77)
        room=next(iter(again.snapshot(self.a)['players']))
        self.assertEqual(room['name'],'MapAlpha')
        destination=MAP['landmarks']['welcome']
        again.move(self.a,{'scene':'city','teleport':True,**destination})
        restarted=WorldService(GameService(self.g.db_path),clock=lambda:1000)
        for opened in (True,False):
            self.assertEqual(restarted.activity(self.a,{'action':'phone','open':opened})['position'],destination)

    def test_room_identity_survives_map_migration_with_only_invalid_positions_normalized(self):
        from world import INTERIORS, valid_position
        room=INTERIORS['profile']
        retained={key:room['action'][key] for key in ('x','y')}
        invalid={'x':room['exit']['x'],'y':room['bounds']['bottom']+8}
        self.assertTrue(valid_position('interior',**retained,scene_id='profile'))
        self.assertFalse(valid_position('interior',**invalid,scene_id='profile'))
        self.assertNotEqual(retained,room['spawn'])
        with self.g.transaction() as db:
            db.execute('DELETE FROM world_metadata')
            for uid,point in ((self.a,retained),(self.b,invalid)):
                db.execute('INSERT OR REPLACE INTO world_positions VALUES (?,?,?,?,?)',(uid,point['x'],point['y'],'interior','profile'))
        again=WorldService(GameService(self.g.db_path),clock=lambda:1000)
        self.assertEqual(again.snapshot(self.a)['position'],retained)
        relocated=again.snapshot(self.b)['position']
        self.assertTrue(valid_position('interior',relocated['x'],relocated['y'],'profile'))
        self.assertNotEqual(relocated,INTERIORS['profile']['spawn'])
        self.assertLessEqual(abs(relocated['x']-invalid['x'])+abs(relocated['y']-invalid['y']),100)
        for uid in (self.a,self.b):self.assertEqual(again.snapshot(uid)['interior_id'],'profile')
        restarted=WorldService(GameService(self.g.db_path),clock=lambda:1000)
        self.assertEqual(restarted.snapshot(self.a)['position'],retained)
        self.assertEqual(restarted.snapshot(self.b)['position'],relocated)


if __name__=='__main__':unittest.main()
