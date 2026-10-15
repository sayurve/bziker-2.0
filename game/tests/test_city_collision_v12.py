import tempfile
import unittest
from pathlib import Path
from game import GameService,GameError
from world import WorldService,WORLD_MAP,BENCHES,CITY_FOOTPRINTS,PRESENCE_TTL,valid_position,nearest_city_position
from economy import EconomyService,change_inventory
from world_fixtures import fixture_position


class PhysicalCityTests(unittest.TestCase):
    def test_movement_cannot_enter_an_unclaimed_or_someone_elses_city_seat(self):
        with tempfile.TemporaryDirectory() as tmp:
            game=GameService(Path(tmp)/'seats.db');world=WorldService(game,clock=lambda:1000)
            owner,walker=[game.create_account() for _ in range(2)]
            for uid,name in ((owner,'Владелец места'),(walker,'Прохожий')):game.profile(uid,{'name':name})
            bench,(x,y)=next(iter(BENCHES.items()));approach=nearest_city_position(x,y+70)
            fixture_position(world,walker,*approach)
            with self.assertRaises(GameError) as unclaimed:
                world.move(walker,{'scene':'city','x':x,'y':y})
            self.assertEqual(unclaimed.exception.code,'bench_pose_required')
            fixture_position(world,owner,*approach)
            world.activity(owner,{'action':'sit','bench_id':bench})
            with self.assertRaises(GameError) as occupied:
                world.move(walker,{'scene':'city','x':x,'y':y})
            self.assertEqual(occupied.exception.code,'bench_pose_required')
            self.assertEqual(world.snapshot(walker)['position'],dict(zip(('x','y'),approach)))

    def test_authorized_city_seat_accepts_idle_writes_and_phone_without_losing_claim(self):
        with tempfile.TemporaryDirectory() as tmp:
            game=GameService(Path(tmp)/'seated-phone.db');world=WorldService(game,clock=lambda:1000)
            uid=game.create_account();game.profile(uid,{'name':'Телефон на скамье'})
            bench,(x,y)=next(iter(BENCHES.items()));approach=nearest_city_position(x,y+70)
            fixture_position(world,uid,*approach)
            world.activity(uid,{'action':'sit','bench_id':bench})
            world.activity(uid,{'action':'phone','open':True})
            snap=world.move(uid,{'scene':'city','x':x,'y':y})
            self.assertEqual(snap['position'],{'x':x,'y':y});self.assertEqual(snap['pose'],'sit')
            self.assertEqual(snap['bench_id'],bench);self.assertTrue(snap['phone_open'])
            with self.assertRaises(GameError):world.move(uid,{'scene':'city','x':x+.005,'y':y})
            self.assertEqual(world.snapshot(uid)['bench_id'],bench)
            with game.transaction() as db:
                self.assertEqual(db.execute('SELECT sit_since FROM presence WHERE account_id=?',(uid,)).fetchone()['sit_since'],1000)

    def test_standing_and_expired_city_seats_return_to_a_nearby_physical_edge(self):
        with tempfile.TemporaryDirectory() as tmp:
            game=GameService(Path(tmp)/'seat-release.db');now=[1000];world=WorldService(game,clock=lambda:now[0])
            uid=game.create_account();game.profile(uid,{'name':'Выход со скамьи'})
            bench,(x,y)=next(iter(BENCHES.items()));approach=nearest_city_position(x,y+70)
            fixture_position(world,uid,*approach)
            world.activity(uid,{'action':'sit','bench_id':bench})
            stood=world.activity(uid,{'action':'stand'})
            world.activity(uid,{'action':'sit','bench_id':bench});now[0]+=PRESENCE_TTL+1
            expired=world.snapshot(uid)
            for snap in (stood,expired):
                px,py=snap['position']['x'],snap['position']['y']
                self.assertFalse(any(bx<px<bx+w and by<py<by+h for bx,by,w,h in CITY_FOOTPRINTS))
                self.assertLess(((px-x)**2+(py-y)**2)**.5,40)
                self.assertEqual(snap['pose'],'idle');self.assertIsNone(snap['bench_id'])
            world.move(uid,{'scene':'city',**expired['position']})

    def test_all_small_ground_supports_block_their_center(self):
        from world import CITY_OBSTACLES
        groups={kind:[b for b in CITY_OBSTACLES if b['kind']==kind] for kind in ('tree','lamp','bin','bench','planter')}
        for kind,objects in groups.items():
            self.assertTrue(objects,kind)
            for b in objects:
                self.assertFalse(valid_position('city',b['x']+b['width']/2,b['y']+b['height']/2),b.get('id',b))

    def test_renovated_position_is_repaired_locally_and_valid_positions_stay_exact(self):
        from world import CITY_OBSTACLES
        b=next(b for b in CITY_OBSTACLES if b['kind']=='lamp');x,y=b['x']+b['width']/2,b['y']+b['height']/2
        self.assertFalse(valid_position('city',x,y))
        p=nearest_city_position(x,y);self.assertTrue(valid_position('city',*p));self.assertLess(((p[0]-x)**2+(p[1]-y)**2)**.5,30)
        spawn=WORLD_MAP['spawn'];self.assertEqual(nearest_city_position(spawn['x'],spawn['y']),(spawn['x'],spawn['y']))

    def test_smoking_uses_server_time_and_shares_the_same_eight_second_action(self):
        with tempfile.TemporaryDirectory() as tmp:
            game=GameService(Path(tmp)/'fixture.db');world=WorldService(game,clock=lambda:1000);economy=EconomyService(game,world)
            uid=game.create_account();game.profile(uid,{'name':'Тест анимации'})
            zone=WORLD_MAP['smoking']
            spot={'x':zone['x']+zone['width']/2,'y':zone['y']+zone['height']-10}
            self.assertTrue(valid_position('city',**spot))
            world.move(uid,{'scene':'city','teleport':True,**WORLD_MAP['landmarks']['smoking']})
            world.move(uid,{'scene':'city',**spot})
            with game.transaction() as db:change_inventory(db,uid,'cigarette',1)
            result=economy.use(uid,{'item_id':'cigarette'});effect=result['action_effect']
            self.assertEqual((effect['type'],effect['started_at'],effect['duration']),('smoke',1000,8))
            self.assertEqual(world.snapshot(uid)['action_effect'],effect)


if __name__=='__main__':unittest.main()
