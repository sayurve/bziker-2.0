"""A moved city bench retains occupied stable slots without moving bystanders."""
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch
from game import GameService
from world import nearest_city_position, city_footprint_contains, valid_position, BENCHES, PRESENCE_TTL, WorldService
from world_fixtures import fixture_position


class CityFixtureV7Tests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.game=GameService(Path(self.tmp.name)/'fixtures.db');self.now=1000
        self.world=WorldService(self.game,clock=lambda:self.now)
        self.a,self.b,self.reader=[self.game.create_account() for _ in range(3)]
        for index,uid in enumerate((self.a,self.b,self.reader)):self.game.profile(uid,{'name':'Fixture '+str(index)})
        self.seats=['city-bench-1:seat-1','city-bench-1:seat-2']
        self.before={sid:BENCHES[sid] for sid in self.seats}
        # Simulate the same stable slots after another future geometry correction.
        self.after={sid:(x-155,y-70) for sid,(x,y) in self.before.items()}

    def occupy(self):
        for uid,sid in zip((self.a,self.b),self.seats):
            x,y=self.before[sid]
            fixture_position(self.world,uid,*nearest_city_position(x,y))
            self.world.activity(uid,{'action':'sit','bench_id':sid})
        self.world.activity(self.a,{'action':'phone','open':True})

    def test_relocated_occupied_slots_preserve_phone_pose_timer_and_durable_position(self):
        self.occupy()
        with patch.dict(BENCHES,self.after):
            self.world.snapshot(self.reader)
            with self.game.transaction() as db:
                for uid,sid in zip((self.a,self.b),self.seats):
                    row=db.execute('SELECT * FROM presence WHERE account_id=?',(uid,)).fetchone()
                    self.assertEqual((row['x'],row['y']),self.after[sid])
                    self.assertEqual(row['bench_id'],sid);self.assertEqual(row['pose'],'sit')
                    self.assertEqual(row['phone_open'],int(uid==self.a));self.assertEqual(row['sit_since'],1000)
                    saved=db.execute('SELECT * FROM world_positions WHERE account_id=?',(uid,)).fetchone()
                    self.assertEqual((saved['x'],saved['y']),self.after[sid])
            self.now+=PRESENCE_TTL+1
            restored=self.world.snapshot(self.a)
            expected=nearest_city_position(*self.after[self.seats[0]])
            self.assertEqual(restored['position'],dict(zip(('x','y'),expected)))
            self.assertFalse(city_footprint_contains(**restored['position']))
            self.assertIsNone(restored['bench_id']);self.assertEqual(restored['pose'],'idle')

    def test_relocation_does_not_move_standing_players_or_rewrite_repaired_seats(self):
        self.occupy();x,y=self.before[self.seats[0]]
        # Keep the bystander beside the actual bench, outside all solid fixtures.
        standing=nearest_city_position(x+20,y+60)
        self.assertTrue(valid_position('city',*standing))
        self.assertFalse(city_footprint_contains(*standing))
        self.assertLess(((standing[0]-x)**2+(standing[1]-y)**2)**.5,100)
        position=dict(zip(('x','y'),standing))
        fixture_position(self.world,self.reader,**position)
        with patch.dict(BENCHES,self.after):
            unchanged=self.world.snapshot(self.reader)
            self.assertEqual(unchanged['position'],position)
            self.assertEqual(unchanged['pose'],'idle');self.assertIsNone(unchanged['bench_id'])
            statements=[];original=self.game.transaction
            @contextmanager
            def traced():
                with original() as db:
                    db.set_trace_callback(statements.append);yield db
            self.game.transaction=traced
            self.world.snapshot(self.reader);self.world.snapshot(self.reader)
            self.assertFalse(any(sql.upper().startswith('UPDATE PRESENCE SET X=') for sql in statements),statements)

    def test_expired_seat_does_not_teleport_an_offline_player_after_the_bench_moves(self):
        self.occupy();self.now+=PRESENCE_TTL+1
        with patch.dict(BENCHES,self.after):
            result=self.world.snapshot(self.a)
            expected=nearest_city_position(*self.before[self.seats[0]])
            self.assertEqual(result['position'],dict(zip(('x','y'),expected)))
            self.assertFalse(city_footprint_contains(**result['position']))
            self.assertNotEqual(result['position'],dict(zip(('x','y'),self.after[self.seats[0]])))
            self.assertLess(((expected[0]-self.before[self.seats[0]][0])**2+(expected[1]-self.before[self.seats[0]][1])**2)**.5,20)
            self.assertIsNone(result['bench_id']);self.assertEqual(result['pose'],'idle')


if __name__=='__main__':unittest.main()
