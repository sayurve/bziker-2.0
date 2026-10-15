import tempfile
import unittest
from pathlib import Path
from game import GameService
from world import nearest_city_position, WorldService, BENCHES
from world_fixtures import fixture_position


class PhoneV5Tests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.game=GameService(Path(self.tmp.name)/'phone.db')
        self.now=1000;self.world=WorldService(self.game,clock=lambda:self.now)
        self.uid=self.game.create_account();self.game.profile(self.uid,{'name':'PhonePerson'})

    def test_phone_is_an_overlay_over_sitting_and_preserves_room_position(self):
        bench,(x,y)=next(iter(BENCHES.items()))
        fixture_position(self.world,self.uid,*nearest_city_position(x,y))
        seated=self.world.activity(self.uid,{'action':'sit','bench_id':bench})
        opened=self.world.activity(self.uid,{'action':'phone','open':True})
        self.assertEqual(opened['pose'],'sit')
        self.assertTrue(opened['phone_open'])
        self.assertEqual(opened['position'],seated['position']);self.assertEqual(opened['bench_id'],seated['bench_id'])
        self.assertTrue(opened['players'][0]['phone_open'])
        closed=self.world.activity(self.uid,{'action':'phone','open':False})
        self.assertFalse(closed['phone_open']);self.assertEqual(closed['pose'],'sit')
        self.assertEqual(closed['position'],seated['position']);self.assertEqual(closed['bench_id'],seated['bench_id'])

    def test_phone_reload_and_repeated_close_never_change_interior_identity(self):
        from world import INTERIORS
        room=next(iter(INTERIORS.values()))
        fixture_position(self.world,self.uid,**room['door'])
        self.world.activity(self.uid,{'action':'phone','open':True})
        self.assertIs(self.world.enter(self.uid,{'building_id':room['id']})['phone_open'],False)
        initial=self.world.snapshot(self.uid)
        self.world.activity(self.uid,{'action':'phone','open':True})
        restarted=WorldService(GameService(self.game.db_path),clock=lambda:self.now)
        for _ in range(2):
            closed=restarted.activity(self.uid,{'action':'phone','open':False})
            self.assertEqual(closed['scene'],'interior');self.assertEqual(closed['interior_id'],room['id'])
            self.assertEqual(closed['position'],initial['position']);self.assertIs(closed.get('phone_open'),False)

    def test_delayed_phone_close_and_old_city_move_cannot_undo_quiz_takeover(self):
        from game import GameError
        participant,juror=[self.game.create_account() for _ in range(2)]
        self.game.profile(participant,{'name':'PhoneParticipant'});self.game.profile(juror,{'name':'PhoneJuror'})
        self.world.activity(self.uid,{'action':'phone','open':True})
        lobby=self.game.create_lobby(self.uid,{'title':'Phone takeover','mode':'individual'})
        codes=self.game.snapshot(self.uid,lobby['id'])
        self.game.join(participant,codes['player_code']);self.game.join(juror,codes['jury_code'])
        self.game.mutate(self.uid,lobby['id'],'start',{})
        canonical=self.world.snapshot(self.uid)
        closed=self.world.activity(self.uid,{'action':'phone','open':False})
        self.assertEqual(closed['scene'],'arena');self.assertEqual(closed['position'],canonical['position'])
        self.assertFalse(closed['phone_open']);self.assertIsNone(closed['bench_id'])
        with self.assertRaises(GameError):self.world.move(self.uid,{'scene':'city','x':760,'y':2610})
