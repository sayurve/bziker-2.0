"""Actual item use drives shared, short actions without changing position or rights."""
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path
from actions import ACTION_TYPES, action_snapshot, start_action
from game import GameService, GameError
from world import nearest_city_position, WorldService, WORLD_MAP, BENCHES
from economy import EconomyService, change_inventory, inventory_quantity
from world_fixtures import fixture_position


class ActionEffectTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.game=GameService(Path(self.tmp.name)/'actions.db');self.now=1000
        self.world=WorldService(self.game,clock=lambda:self.now);self.economy=EconomyService(self.game,self.world)
        self.a,self.b=[self.game.create_account() for _ in range(2)]
        self.game.profile(self.a,{'name':'Action A'});self.game.profile(self.b,{'name':'Action B'})

    def near(self,uid,action):
        point=next(p for p in WORLD_MAP['activities'] if p['action']==action)
        fixture_position(self.world,uid,*nearest_city_position(point['x'],point['y']))
        return point

    def inventory(self,item,quantity=1,uid=None):
        with self.game.transaction() as db:change_inventory(db,uid or self.a,item,quantity)

    def denied(self,fn,*args,code):
        with self.assertRaises(GameError) as error:fn(*args)
        self.assertEqual(error.exception.code,code)

    def test_owned_snack_and_coffee_make_three_second_shared_actions_with_four_phase_boundaries(self):
        self.inventory('coffee');self.inventory('snack')
        for item,kind in [('coffee','drink'),('snack','eat')]:
            result=self.economy.use(self.a,{'item_id':item});effect=result['action_effect']
            self.assertEqual(effect['type'],kind);self.assertEqual(effect['item_id'],item)
            self.assertEqual(effect['started_at'],self.now);self.assertEqual(effect['duration'],3)
            self.assertNotIn('account_id',effect)
            self.assertEqual(self.world.snapshot(self.a)['action_effect'],effect)
            peer=next(p for p in self.world.snapshot(self.b)['players'] if p['id']==self.a)
            self.assertEqual(peer['action_effect'],effect)
            for phase in range(4):
                self.now=effect['started_at']+phase*.75+.01
                self.assertEqual(int((self.now-effect['started_at'])/effect['duration']*4),phase)
                self.assertEqual(self.world.snapshot(self.a)['action_effect']['id'],effect['id'])
            self.now=effect['started_at']+3;self.assertIsNone(self.world.snapshot(self.a)['action_effect'])
            with self.game.transaction() as db:self.assertEqual(inventory_quantity(db,self.a,item),0)

    def test_seated_food_and_phone_keep_the_actual_bench_and_coordinates(self):
        bench,(x,y)=next(iter(BENCHES.items()))
        approach=nearest_city_position(x,y)
        fixture_position(self.world,self.a,*approach);self.world.activity(self.a,{'action':'sit','bench_id':bench});self.world.activity(self.a,{'action':'phone','open':True})
        before=self.world.snapshot(self.a);self.inventory('snack')
        self.economy.use(self.a,{'item_id':'snack'});after=self.world.snapshot(self.a)
        for key in ('position','pose','bench_id','phone_open'):self.assertEqual(after[key],before[key],key)
        self.assertEqual(after['action_effect']['type'],'eat')

    def test_litter_is_really_held_after_pickup_and_only_disappears_when_the_last_piece_is_binned(self):
        point=self.near(self.a,'pick-litter');result=self.economy.action(self.a,{'action':'pick-litter','target_id':point['id']})
        effect=result['action_effect'];self.assertEqual(effect['type'],'pick-litter');self.assertEqual(effect['target_id'],point['id']);self.assertEqual(effect['x'],point['x']);self.assertEqual(effect['y'],point['y'])
        self.assertEqual(result['holding'],'litter')
        retry=self.economy.action(self.a,{'action':'pick-litter','target_id':point['id']});self.assertEqual(retry['action_effect']['id'],effect['id'])
        with self.game.transaction() as db:self.assertEqual(inventory_quantity(db,self.a,'trash'),1)
        self.now+=4;after=self.world.snapshot(self.a);self.assertIsNone(after['action_effect']);self.assertEqual(after['holding'],'litter')
        replay=self.economy.action(self.a,{'action':'pick-litter','target_id':point['id']});self.assertIsNone(replay['action_effect']);self.assertEqual(replay['holding'],'litter')
        self.assertEqual(next(p for p in self.world.snapshot(self.b)['players'] if p['id']==self.a)['holding'],'litter')
        self.inventory('trash');bin=self.near(self.a,'trash-bin')
        first=self.economy.action(self.a,{'action':'trash-bin','target_id':bin['id']});self.assertEqual(first['action_effect']['type'],'throw-litter');self.assertEqual(first['holding'],'litter')
        last=self.economy.action(self.a,{'action':'trash-bin','target_id':bin['id']});self.assertIsNone(last['holding'])
        with self.game.transaction() as db:self.assertEqual(inventory_quantity(db,self.a,'trash'),0)

    def test_failed_use_wrong_target_and_forged_action_do_not_create_a_new_effect(self):
        self.denied(self.economy.use,self.a,{'item_id':'snack'},code='item_missing')
        self.denied(self.economy.action,self.a,{'action':'eat','target_id':'not-food'},code='not_found')
        point=next(p for p in WORLD_MAP['activities'] if p['action']=='pick-litter')
        self.denied(self.economy.action,self.a,{'action':'pick-litter','target_id':point['id']},code='activity_distance')
        self.denied(self.economy.action,self.a,{'action':'pick-litter','target_id':'bin-plaza'},code='not_found')
        self.assertIsNone(self.world.snapshot(self.a)['action_effect']);self.assertIsNone(self.world.snapshot(self.a)['holding'])
        self.inventory('snack');effect=self.economy.use(self.a,{'item_id':'snack','type':'drink','id':'forged-effect'})['action_effect']
        self.assertEqual(effect['type'],'eat');self.assertNotEqual(effect['id'],'forged-effect')
        self.denied(self.economy.use,self.a,{'item_id':'snack'},code='item_missing')
        self.assertEqual(self.world.snapshot(self.a)['action_effect'],effect)

    def test_effect_record_survives_restart_but_expires_without_periodic_writes(self):
        self.inventory('coffee');effect=self.economy.use(self.a,{'item_id':'coffee'})['action_effect']
        again=WorldService(GameService(self.game.db_path),clock=lambda:self.now+1)
        self.assertEqual(again.snapshot(self.a)['action_effect'],effect)
        statements=[];original=self.game.transaction
        @contextmanager
        def traced():
            with original() as db:
                db.set_trace_callback(statements.append);yield db
        self.game.transaction=traced
        self.now+=4;self.assertIsNone(self.world.snapshot(self.a)['action_effect']);self.world.snapshot(self.a)
        self.assertFalse(any('WORLD_ACTION_EFFECTS' in sql.upper() and sql.lstrip().upper().startswith(('INSERT','UPDATE','DELETE')) for sql in statements))

    def test_anonymous_juror_cannot_view_effects_and_is_hidden_from_other_players(self):
        self.inventory('snack');self.economy.use(self.a,{'item_id':'snack'});self.inventory('trash')
        lobby=self.game.create_lobby(self.b,{'mode':'individual','title':'Action jury'})['id'];jury=self.game.snapshot(self.b,lobby)['jury_code'];self.game.join(self.a,jury)
        restricted=self.world.snapshot(self.a)
        self.assertTrue(restricted['restricted']);self.assertIsNone(restricted['action_effect']);self.assertIsNone(restricted['holding']);self.assertEqual(restricted['players'],[])
        self.assertNotIn(self.a,{p['id'] for p in self.world.snapshot(self.b)['players']})

    def test_action_type_validation_rejects_internal_unsupported_effects(self):
        self.assertEqual(set(ACTION_TYPES),{'eat','drink','pick-litter','throw-litter','smoke','fishing','fish-catch'})
        with self.game.transaction() as db:
            with self.assertRaises(GameError):start_action(db,self.a,'fly',self.now,item_id='snack')
            self.assertIsNone(action_snapshot(db,self.a,self.now)['action_effect'])


if __name__=='__main__':unittest.main()
