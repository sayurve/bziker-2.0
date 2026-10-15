import http.client
import importlib.util
import json
import sqlite3
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from game import GameError, GameService
from world import nearest_city_position, city_footprint_contains, WorldService, valid_position, WORLD_MAP, CITY_SPAWN, CITY_BOUNDS, DISTRICT_SPAWN, BENCHES
from server import make_server
from clan_fixtures import legacy_home
from world_fixtures import fixture_position


class CityV3Tests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.g = GameService(Path(self.tmp.name) / 'city.db')
        self.now = 1000
        self.w = WorldService(self.g, clock=lambda: self.now)
        self.a, self.b, self.c = [self.g.create_account() for _ in range(3)]
        for uid, name in zip((self.a, self.b, self.c), ('Alpha', 'Beta', 'Gamma')):
            self.g.profile(uid, {'name': name})

    def economy(self, fund=True):
        self.assertIsNotNone(importlib.util.find_spec('economy'), 'Persistent economy is missing')
        from economy import EconomyService
        service = EconomyService(self.g, self.w)
        if fund:
            from economy import change_balance
            with self.g.transaction() as db:
                for uid in (self.a, self.b, self.c):
                    change_balance(db, uid, 300, "test:fund")
        return service

    def denied(self, fn, *args, code=None):
        with self.assertRaises(GameError) as raised:
            fn(*args)
        if code:
            self.assertEqual(raised.exception.code, code)

    def quantity(self, uid, item):
        from economy import inventory_quantity
        with self.g.transaction() as db:
            return inventory_quantity(db, uid, item)

    def move_smoking(self, *users):
        zone=WORLD_MAP['smoking']
        inside={'x':zone['x']+zone['width']/2,'y':zone['y']+zone['height']-10}
        self.assertTrue(valid_position('city',**inside))
        for uid in users:
            # Named travel reaches this actual zone, then a short ordinary
            # step sets a shared, valid position for the consent tests.
            self.w.move(uid, {'scene': 'city', 'teleport': True, **WORLD_MAP['landmarks']['smoking']})
            self.w.move(uid, {'scene': 'city', **inside})

    def quiz(self):
        lid = self.g.create_lobby(self.a, {'title': 'Quiz', 'mode': 'individual'})['id']
        codes = self.g.snapshot(self.a, lid)
        self.g.join(self.b, codes['player_code'])
        self.g.join(self.c, codes['jury_code'])
        self.g.mutate(self.a, lid, 'start', {})
        return lid

    def test_quest_currency_and_claim_only_once_across_reload(self):
        e = self.economy(fund=False)
        self.assertEqual(e.snapshot(self.a)['balance'], 0)
        self.assertTrue(next(q for q in e.snapshot(self.a)['quests'] if q['id'] == 'firstprofile')['eligible'])
        e.claim(self.a, 'firstprofile')
        self.assertEqual(e.snapshot(self.a)['balance'], 30)
        e.buy(self.a, {'item_id': 'coffee'})
        e.claim(self.a, 'firstpurchase')
        self.assertEqual(e.snapshot(self.a)['balance'], 35)
        again = GameService(self.g.db_path)
        from economy import EconomyService
        e2 = EconomyService(again, WorldService(again, clock=lambda: self.now))
        self.assertEqual(e2.claim(self.a, 'firstprofile')['balance'], 35)
        self.assertEqual(e2.snapshot(self.b)['balance'], 0)
        self.assertEqual(e2.snapshot(self.a)['currency'], 'Бзинге')
        self.denied(e2.claim, self.a, 'fivefriends', code='quest_unavailable')
        self.denied(e2.claim, self.a, 'unknown', code='not_found')

    def test_mutual_friends_require_acceptance_and_unlock_actual_friend_quests(self):
        e = self.economy(fund=False)
        result = e.request_friend(self.a, {'to_id': self.b})
        rid = result['sent'][0]['id']
        self.assertEqual(e.friends(self.a)['count'], 0)
        self.denied(e.respond_friend, self.c, rid, 'accept', code='forbidden')
        self.denied(e.claim, self.a, 'firstfriend', code='quest_unavailable')
        e.respond_friend(self.b, rid, 'accept')
        e.respond_friend(self.b, rid, 'accept')
        self.assertEqual(e.friends(self.a)['count'], 1)
        self.assertEqual(e.friends(self.b)['count'], 1)
        self.assertEqual(e.claim(self.a, 'firstfriend')['balance'], 20)
        peers = [self.g.create_account() for _ in range(4)]
        for i, uid in enumerate(peers):
            self.g.profile(uid, {'name': f'Friend{i}'})
            rid = e.request_friend(self.a, {'to_id': uid})['sent'][-1]['id']
            e.respond_friend(uid, rid, 'accept')
        self.assertEqual(e.claim(self.a, 'fivefriends')['balance'], 120)
        req = e.request_friend(self.b, {'to_id': self.c})['sent'][0]
        e.respond_friend(self.c, req['id'], 'dismiss')
        self.denied(e.respond_friend, self.c, req['id'], 'accept', code='request_closed')

    def test_quest_clan_and_concurrent_claim_rewards_once(self):
        e = self.economy(fund=False)
        self.denied(e.claim, self.a, 'joinclan', code='quest_unavailable')
        self.w.create_clan(self.a, {'name': 'QuestClan', 'color': '#111111', 'flag': '!'})
        with ThreadPoolExecutor(max_workers=2) as pool:
            list(pool.map(lambda _: e.claim(self.a, 'joinclan'), range(2)))
        self.assertEqual(e.snapshot(self.a)['balance'], 40)

    def test_balance_reference_is_idempotent_and_insufficient_debit_rolls_back(self):
        e = self.economy()
        from economy import change_balance
        with self.g.transaction() as db:
            self.assertEqual(change_balance(db, self.a, -80, 'test-bet'), 220)
            self.assertEqual(change_balance(db, self.a, -80, 'test-bet'), 220)
        self.denied(lambda: self._balance_change(-221, 'too-large'), code='insufficient_funds')
        self.assertEqual(e.snapshot(self.a)['balance'], 220)
        self.denied(lambda: self._balance_change(80, 'test-bet'), code='reference_conflict')

    def _balance_change(self, amount, reference):
        from economy import change_balance
        with self.g.transaction() as db:
            return change_balance(db, self.a, amount, reference)

    def test_buy_is_atomic_with_stock_and_price_validation(self):
        e = self.economy()
        e.buy(self.a, {'item_id': 'cigarette', 'quantity': 2})
        self.assertEqual(self.quantity(self.a, 'cigarette'), 2)
        self.assertEqual(e.snapshot(self.a)['balance'], 280)
        for data in ({'item_id': 'no'}, {'item_id': 'coffee', 'quantity': True},
                     {'item_id': 'coffee', 'quantity': 0}, {'item_id': 'coffee', 'quantity': 100},
                     {'item_id': 'coffee', 'quantity': 1, 'price': 0}):
            self.denied(e.buy, self.a, data)
        self.denied(e.buy, self.a, {'item_id': 'snack', 'quantity': 15}, code='insufficient_funds')
        self.assertEqual(self.quantity(self.a, 'snack'), 0)
        def buy(_):
            try:
                e.buy(self.b, {'item_id': 'outfit-3', 'quantity': 1})
                return True
            except GameError:
                return False
        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(sum(pool.map(buy, range(2))), 1)
        self.assertEqual(e.snapshot(self.b)['balance'], 120)

    def test_food_consumes_one_item_and_deck_is_retained(self):
        e = self.economy()
        e.buy(self.a, {'item_id': 'coffee', 'quantity': 2})
        result = e.use(self.a, {'item_id': 'coffee'})
        self.assertEqual(result['used_item'], 'coffee')
        self.assertEqual(self.quantity(self.a, 'coffee'), 1)
        e.use(self.a, {'item_id': 'coffee'})
        self.denied(e.use, self.a, {'item_id': 'coffee'}, code='item_missing')
        e.buy(self.a, {'item_id': 'cards'})
        self.denied(e.use, self.a, {'item_id': 'cards'})
        self.assertEqual(self.quantity(self.a, 'cards'), 1)

    def test_outfit_requires_ownership_and_migrates_legacy_avatar(self):
        e = self.economy()
        self.assertEqual(self.g.bootstrap(self.a)['profile']['avatar'].get('outfit'), 0)
        self.denied(self.g.profile, self.a, {'avatar': {'outfit': 1}}, code='outfit_locked')
        e.buy(self.a, {'item_id': 'outfit-1'})
        self.assertIn(1, e.snapshot(self.a)['unlocked_outfits'])
        self.assertEqual(self.g.profile(self.a, {'avatar': {'outfit': 1}})['avatar']['outfit'], 1)
        self.assertEqual(self.g.profile(self.a, {'avatar': {'outfit': 0}})['avatar']['outfit'], 0)
        for bad in (True, -1, 4):
            self.denied(self.g.profile, self.a, {'avatar': {'outfit': bad}})

    def test_headwear_adds_free_selection_and_preserves_accessory(self):
        self.assertEqual(self.g.bootstrap(self.a)['profile']['avatar'].get('headwear'), 0)
        profile=self.g.profile(self.a, {'avatar': {'headwear': 4, 'accessory': 5}})
        self.assertEqual(profile['avatar']['headwear'],4)
        self.assertEqual(profile['avatar']['accessory'],5)
        for bad in (True,-1,5):
            self.denied(self.g.profile,self.a,{'avatar':{'headwear':bad}})

    def test_finished_quiz_quest_is_eligible_only_after_finish_and_claims_once(self):
        e = self.economy()
        self.denied(e.claim, self.a, 'firstfinishedquiz', code='quest_unavailable')
        lid = self.quiz()
        self.g.mutate(self.a, lid, 'question', {'question_id': 'idea_100'})
        self.g.mutate(self.a, lid, 'answer', {'text': 'Answer'})
        self.g.mutate(self.a, lid, 'review', {})
        card = self.g.snapshot(self.c, lid)['cards'][0]
        self.g.mutate(self.c, lid, 'grade', {'token': card['token'], 'score': 10})
        self.g.mutate(self.c, lid, 'review/finish', {})
        self.g.mutate(self.a, lid, 'finish', {})
        self.assertEqual(e.snapshot(self.a)['balance'], 300)
        self.assertEqual(e.claim(self.a, 'firstfinishedquiz')['balance'], 350)
        self.assertEqual(e.claim(self.a, 'firstfinishedquiz')['balance'], 350)
        self.assertEqual(e.claim(self.b, 'firstfinishedquiz')['balance'], 350)

    def test_phone_pose_is_public_and_close_restores_idle(self):
        self.assertTrue(callable(getattr(self.w, 'activity', None)), 'World activity API is missing')
        self.w.activity(self.a, {'action': 'phone', 'open': True})
        alpha = next(p for p in self.w.snapshot(self.b)['players'] if p['id'] == self.a)
        self.assertEqual(alpha['pose'], 'phone')
        self.w.activity(self.a, {'action': 'phone', 'open': False})
        self.assertEqual(next(p for p in self.w.snapshot(self.a)['players'] if p['id'] == self.a)['pose'], 'idle')
        self.denied(self.w.activity, self.a, {'action': 'phone', 'open': 1})

    def test_bench_claim_is_atomic_and_moving_releases_it(self):
        self.assertTrue(callable(getattr(self.w, 'activity', None)), 'Bench activity is missing')
        for uid in (self.a, self.b):
            fixture_position(self.w, uid, *nearest_city_position(*BENCHES['city-bench-1:seat-1']))
        def sit(uid):
            try:
                self.w.activity(uid, {'action': 'sit', 'bench_id': 'city-bench-1:seat-1'})
                return uid
            except GameError:
                return None
        with ThreadPoolExecutor(max_workers=2) as pool:
            seated = [u for u in pool.map(sit, (self.a, self.b)) if u]
        self.assertEqual(len(seated), 1)
        uid = seated[0]
        mine = next(p for p in self.w.snapshot(uid)['players'] if p['id'] == uid)
        self.assertEqual((mine['x'], mine['y'], mine['pose'], mine['bench_id']), (*BENCHES['city-bench-1:seat-1'], 'sit', 'city-bench-1:seat-1'))
        x,y=BENCHES['city-bench-1:seat-1']
        departure=dict(zip(('x','y'),nearest_city_position(x,y+45)))
        self.assertTrue(valid_position('city',**departure))
        self.assertNotEqual(departure,{'x':x,'y':y})
        self.assertEqual(self.w.move(uid, {'scene': 'city', **departure})['position'],departure)
        other = self.b if uid == self.a else self.a
        self.w.activity(other, {'action': 'sit', 'bench_id': 'city-bench-1:seat-1'})
        self.w.activity(other, {'action': 'sit', 'bench_id': 'city-bench-1:seat-1'})
        self.assertIsNone(next(p for p in self.w.snapshot(other)['players'] if p['id'] == other)['bench_id'])

    def test_bench_requires_nearby_correct_scene_and_claim_expires(self):
        self.assertTrue(callable(getattr(self.w, 'activity', None)), 'Bench activity is missing')
        self.denied(self.w.activity, self.a, {'action': 'sit', 'bench_id': 'city-bench-1:seat-1'})
        fixture_position(self.w, self.a, *nearest_city_position(*BENCHES['city-bench-1:seat-1']))
        self.denied(self.w.activity, self.a, {'action': 'sit', 'bench_id': 'district-bench-1'})
        self.w.activity(self.a, {'action': 'sit', 'bench_id': 'city-bench-1:seat-1'})
        self.now += 46
        fixture_position(self.w, self.b, *nearest_city_position(*BENCHES['city-bench-1:seat-1']))
        self.w.activity(self.b, {'action': 'sit', 'bench_id': 'city-bench-1:seat-1'})

    def test_smoke_requires_zone_consumes_and_pose_expires(self):
        e = self.economy()
        e.buy(self.a, {'item_id': 'cigarette'})
        self.denied(e.use, self.a, {'item_id': 'cigarette'}, code='smoking_zone')
        self.assertEqual(self.quantity(self.a, 'cigarette'), 1)
        self.move_smoking(self.a)
        e.use(self.a, {'item_id': 'cigarette'})
        self.assertEqual(self.quantity(self.a, 'cigarette'), 0)
        self.assertEqual(next(p for p in self.w.snapshot(self.a)['players'] if p['id'] == self.a)['pose'], 'smoke')
        self.now += 9
        self.assertEqual(next(p for p in self.w.snapshot(self.a)['players'] if p['id'] == self.a)['pose'], 'idle')

    def test_closing_phone_preserves_smoke_consumption_pose_and_original_expiry(self):
        e=self.economy()
        e.buy(self.a,{'item_id':'cigarette'})
        self.move_smoking(self.a)
        self.w.activity(self.a,{'action':'phone','open':True})
        e.use(self.a,{'item_id':'cigarette'})
        closed=self.w.activity(self.a,{'action':'phone','open':False})
        self.assertEqual(closed['pose'],'smoke')
        self.assertEqual(self.quantity(self.a,'cigarette'),0)
        with self.g.transaction() as db:
            self.assertEqual(db.execute('SELECT pose_until FROM presence WHERE account_id=?',(self.a,)).fetchone()['pose_until'],1008)
        self.now+=7
        self.assertEqual(self.w.snapshot(self.a)['pose'],'smoke')
        self.now+=1
        self.assertEqual(self.w.snapshot(self.a)['pose'],'idle')

    def test_smoking_transfer_requires_owner_consent_and_cannot_repeat(self):
        e = self.economy()
        e.buy(self.b, {'item_id': 'cigarette'})
        self.move_smoking(self.a, self.b, self.c)
        request = e.request(self.a, {'to_id': self.b})['request']
        self.assertEqual(self.quantity(self.a, 'cigarette'), 0)
        self.assertEqual(self.quantity(self.b, 'cigarette'), 1)
        self.denied(e.respond, self.c, request['id'], 'give', code='forbidden')
        def give(_):
            return e.respond(self.b, request['id'], 'give')['request']['state']
        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(list(pool.map(give, range(2))), ['given', 'given'])
        self.assertEqual(self.quantity(self.a, 'cigarette'), 1)
        self.assertEqual(self.quantity(self.b, 'cigarette'), 0)

    def test_smoking_transfer_revalidates_location_inventory_and_decline(self):
        e = self.economy()
        e.buy(self.b, {'item_id': 'cigarette'})
        self.move_smoking(self.a, self.b)
        req = e.request(self.a, {'to_id': self.b})['request']
        zone = WORLD_MAP['smoking']
        outside = {'x': zone['x'] + zone['width']/2, 'y': zone['y'] + zone['height'] + 30}
        self.assertTrue(valid_position('city', **outside))
        self.assertGreater(outside['y'], zone['y'] + zone['height'])
        self.assertEqual(self.w.move(self.a, {'scene': 'city', **outside})['position'], outside)
        self.denied(e.respond, self.b, req['id'], 'give', code='smoking_zone')
        self.assertEqual(self.quantity(self.b, 'cigarette'), 1)
        self.assertEqual(e.respond(self.b, req['id'], 'decline')['request']['state'], 'declined')
        self.denied(e.respond, self.b, req['id'], 'give', code='request_closed')

    def test_jury_blackout_applies_to_economy_activity_and_smoking(self):
        e = self.economy()
        lid = self.quiz()
        for fn, args in ((e.snapshot, (self.c,)), (e.buy, (self.c, {'item_id': 'coffee'})),
                         (e.use, (self.c, {'item_id': 'coffee'})), (e.request, (self.c, {'to_id': self.a})),
                         (self.w.activity, (self.c, {'action': 'phone', 'open': True}))):
            self.denied(fn, *args, code='jury_restricted')
        self.assertEqual(self.w.snapshot(self.c)['players'], [])
        self.denied(self.w.move, self.a, {'scene': 'city', **WORLD_MAP['landmarks']['smoking']}, code='active_match_scene')

    def test_furniture_colors_variants_permissions_and_existing_items_survive(self):
        e = self.economy()
        cid = self.w.create_clan(self.a, {'name': 'Clan', 'color': '#111111', 'flag': '!'})['id']
        legacy_home(self.g,cid)
        item = {'id': 'sofa', 'type': 'sofa', 'x': 2, 'y': 3, 'color': '#62cdb9', 'variant': 'premium'}
        body = {'items': [item], 'wall_color': '#faf8f2', 'floor_color': '#141414'}
        self.denied(self.w.mutate_clan, self.a, cid, 'base', body, code='furniture_locked')
        e.buy(self.a, {'item_id': 'furniture-sofa'})
        base = self.w.mutate_clan(self.a, cid, 'base', body)['base']
        self.assertEqual(base['items'], [item])
        self.assertEqual(base['wall_color'], '#faf8f2')
        for bad in (body | {'wall_color': '#12345'}, body | {'floor_color': 'url(x)'},
                    body | {'items': [item | {'color': '#gg3456'}]},
                    body | {'items': [item | {'variant': 'unknown'}]}):
            self.denied(self.w.mutate_clan, self.a, cid, 'base', bad)
        self.w.mutate_clan(self.b, cid, 'apply', {})
        self.w.mutate_clan(self.a, cid, 'accept', {'account_id': self.b})
        self.denied(self.w.mutate_clan, self.b, cid, 'base', body, code='forbidden')
        before = self.w.clan_snapshot(self.a, cid)['base']
        self.denied(self.w.mutate_clan, self.a, cid, 'building', {'building_id': 'base-2'}, code='base_already_built')
        after = self.w.clan_snapshot(self.b, cid)['base']
        self.assertEqual(after['items'], before['items'])

    def test_new_buildings_are_solid_and_bench_seats_are_legal(self):
        for solid in WORLD_MAP['solids']:
            self.assertFalse(valid_position('city',solid['x']+solid['width']/2,solid['y']+solid['height']/2))
        for x,y in BENCHES.values():
            self.assertTrue(valid_position('city',x,y,seated=True))
            self.assertFalse(valid_position('city',x,y))
        for point in WORLD_MAP['landmarks'].values():
            self.assertTrue(valid_position('city',point['x'],point['y']))

    def test_unified_city_normalizes_legacy_district_without_resetting_city(self):
        fixture_position(self.w, self.a, 900, 900)
        self.w.move(self.b, {'scene': 'district', 'x': 900, 'y': 800})
        self.assertEqual(self.w.snapshot(self.b)['scene'], 'city')
        self.assertEqual(self.w.snapshot(self.b)['position'], dict(zip(('x','y'),DISTRICT_SPAWN)))
        again = GameService(self.g.db_path)
        world = WorldService(again, clock=lambda: self.now)
        self.assertEqual(world.snapshot(self.a)['position'], {'x': 900, 'y': 900})
        self.assertEqual(world.snapshot(self.c)['position'], dict(zip(('x','y'),CITY_SPAWN)))
        self.assertTrue(valid_position('city', CITY_BOUNDS[1]-14, CITY_BOUNDS[3]-14))
        self.assertFalse(valid_position('city', CITY_BOUNDS[1], CITY_BOUNDS[3]))
        self.assertFalse(valid_position('city', CITY_BOUNDS[1]+1, CITY_BOUNDS[3]))

    def test_expired_city_and_base_positions_survive_cleanup_by_another_player(self):
        cid=self.w.create_clan(self.b,{'name':'ReturnBase','color':'#111111','flag':'!'})['id']
        legacy_home(self.g,cid)
        fixture_position(self.w,self.a,2330,760)
        self.w.move(self.b,{'scene':'base','x':740,'y':620})
        self.w.activity(self.a,{'action':'phone','open':True})
        self.now+=46
        third=self.w.snapshot(self.c)
        self.assertEqual(third['online_count'],1)
        self.assertNotIn(self.a,{p['id'] for p in third['players']})
        self.assertNotIn(self.b,{p['id'] for p in third['players']})
        alpha=self.w.snapshot(self.a)
        beta=self.w.snapshot(self.b)
        self.assertEqual(alpha['position'],{'x':2330,'y':760})
        self.assertEqual(alpha['pose'],'idle')
        self.assertEqual(beta['scene'],'base')
        self.assertEqual(beta['position'],{'x':740,'y':620})
        self.assertEqual(beta['my_clan']['id'],cid)
        again=GameService(self.g.db_path)
        world=WorldService(again,clock=lambda:self.now+46)
        self.assertEqual(world.snapshot(self.a)['position'],{'x':2330,'y':760})
        self.assertEqual(world.snapshot(self.b)['position'],{'x':740,'y':620})

    def test_expired_bench_position_stays_nearby_but_seat_and_pose_are_released(self):
        seat=BENCHES['city-bench-1:seat-1']
        approach=dict(zip(('x','y'),nearest_city_position(*seat)))
        fixture_position(self.w,self.a,**approach)
        self.w.activity(self.a,{'action':'sit','bench_id':'city-bench-1:seat-1'})
        self.now+=46
        fixture_position(self.w,self.b,**approach)
        self.w.activity(self.b,{'action':'sit','bench_id':'city-bench-1:seat-1'})
        alpha=self.w.snapshot(self.a)
        self.assertEqual(alpha['position'],approach)
        self.assertFalse(city_footprint_contains(**alpha['position']))
        self.assertLess(((alpha['position']['x']-seat[0])**2+(alpha['position']['y']-seat[1])**2)**.5,20)
        self.assertEqual(alpha['pose'],'idle')
        self.assertIsNone(alpha['bench_id'])

    def test_retained_base_position_never_restores_after_membership_is_lost(self):
        cid=self.w.create_clan(self.a,{'name':'ReturnRights','color':'#111111','flag':'!'})['id']
        legacy_home(self.g,cid)
        self.w.move(self.a,{'scene':'base','x':740,'y':620})
        self.now+=46
        self.w.snapshot(self.b)
        self.w.mutate_clan(self.a,cid,'leave',{})
        mine=self.w.snapshot(self.a)
        self.assertEqual(mine['scene'],'city')
        self.assertIsNone(mine['my_clan'])

    def test_constructed_exterior_style_is_fixed_and_in_public_building_summary(self):
        cid = self.w.create_clan(self.a, {'name': 'Style', 'color': '#111111', 'flag': '!'})['id']
        legacy_home(self.g,cid,exterior_style=3)
        own = self.w.clan_snapshot(self.a, cid)
        self.assertEqual(own['base'].get('exterior_style'), 3)
        summary = next(b for b in self.w.snapshot(self.b)['buildings'] if b['clan'])
        self.assertEqual(summary['clan'].get('exterior_style'), 3)
        self.denied(self.w.mutate_clan, self.a, cid, 'base', {'items': [], 'exterior_style': 4},code='exterior_locked')

    def test_legacy_presence_and_base_migrate_without_dropping_data(self):
        self.economy()
        cid = self.w.create_clan(self.a, {'name': 'Legacy', 'color': '#111111', 'flag': '!'})['id']
        with self.g.transaction() as db:
            db.execute('UPDATE clans SET base=? WHERE id=?', ('{"items":[{"id":"p","type":"plant","x":1,"y":1}]}', cid))
        again = GameService(self.g.db_path)
        base = WorldService(again, clock=lambda: self.now).clan_snapshot(self.a, cid)['base']
        self.assertEqual(base.get('wall_color'), '#faf8f2')
        self.assertEqual(base['items'][0].get('color'), '#faf8f2')
        self.assertEqual(base['items'][0]['id'], 'p')

    def test_six_column_presence_schema_adds_pose_and_keeps_accounts_and_city_positions(self):
        legacy=Path(self.tmp.name)/'six-column.db'
        with sqlite3.connect(legacy) as db:
            db.execute('CREATE TABLE accounts (id TEXT PRIMARY KEY,telegram_id TEXT UNIQUE,profile TEXT)')
            db.execute('CREATE TABLE presence (account_id TEXT PRIMARY KEY,x REAL NOT NULL,y REAL NOT NULL,scene TEXT NOT NULL,scene_id TEXT,updated REAL NOT NULL)')
            for uid,scene in (('street','city'),('quarter','district')):
                db.execute('INSERT INTO accounts VALUES (?,?,?)',(uid,None,json.dumps({'id':uid,'name':uid,'avatar':{'skin':3,'accessory':2}})))
                anchor=WORLD_MAP['previous_landmarks']['station' if scene=='city' else 'district']
                db.execute('INSERT INTO presence VALUES (?,?,?,?,?,?)',(uid,anchor['x'],anchor['y'],scene,None,self.now))
        db.close()
        game=GameService(legacy)
        world=WorldService(game,clock=lambda:self.now)
        for uid,name in (('street','station'),('quarter','district')):
            self.assertEqual(world.snapshot(uid)['position'],dict(zip(('x','y'),nearest_city_position(**WORLD_MAP['landmarks'][name]))))
        self.assertEqual(world.snapshot('street')['pose'],'idle')
        self.assertEqual(game.bootstrap('street')['profile']['avatar']['skin'],3)
        self.assertEqual(game.bootstrap('street')['profile']['avatar']['accessory'],2)
        with game.transaction() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM accounts').fetchone()[0],2)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM economy_ledger').fetchone()[0],2)
            self.assertEqual(db.execute('SELECT SUM(balance) FROM wallets').fetchone()[0],0)


class CityV3HttpTests(unittest.TestCase):
    def test_cards_routes_scene_assignment_private_room_and_virtual_slot_replay(self):
        with tempfile.TemporaryDirectory() as temp:
            server=make_server('127.0.0.1',0,Path(temp)/'cards-http.db')
            thread=threading.Thread(target=server.serve_forever,daemon=True)
            thread.start()
            cookie=csrf=None
            try:
                def request(path,body=None):
                    connection=http.client.HTTPConnection(*server.server_address)
                    headers={'Content-Type':'application/json'}
                    if cookie: headers['Cookie']=cookie
                    if csrf: headers['X-CSRF-Token']=csrf
                    connection.request('GET' if body is None else 'POST',path,None if body is None else json.dumps(body),headers)
                    response=connection.getresponse()
                    result=response.status,dict(response.getheaders()),json.loads(response.read())
                    connection.close()
                    return result
                _,headers,bootstrap=request('/api/bootstrap')
                cookie=headers['Set-Cookie'].split(';')[0];csrf=bootstrap['csrf_token']
                uid=request('/api/profile',{'name':'CardsHTTP'})[2]['id']
                request('/api/quests/firstprofile/claim',{})
                self.assertEqual(request('/api/cards')[0],200)
                server.cards.shuffle=lambda deck:None
                table=request('/api/cards',{'game':'blackjack','title':'21','stake':5,'source':'casino'})[2]
                tid=table['id']
                self.assertEqual(request('/api/cards/'+tid)[0],200)
                self.assertEqual(request('/api/cards/'+tid+'/start',{})[2]['state'],'playing')
                world=request('/api/world')[2]
                self.assertEqual(world['card_table_id'],tid)
                self.assertEqual(world['wallet']['balance'],25)
                self.assertEqual(request('/api/world/move',{'scene':'city','x':550,'y':275})[0],409)
                self.assertEqual(request('/api/shop/buy',{'item_id':'coffee'})[0],409)
                self.assertEqual(request('/api/world/activity',{'action':'phone','open':False})[0],200)
                self.assertEqual(request('/api/cards/'+tid+'/act',{'move':'stand'})[2]['state'],'finished')
                self.assertIsNone(request('/api/world')[2]['card_table_id'])
                self.assertEqual(request('/api/world')[2]['scene'],'city')
                first=request('/api/casino/slots',{'stake':1,'request_id':'http-slot'})
                second=request('/api/casino/slots',{'stake':1,'request_id':'http-slot'})
                self.assertEqual(first[0],200)
                self.assertEqual(first[2],second[2])
                self.assertEqual(request('/api/card-invitations/missing/accept',{})[0],404)
            finally:
                server.shutdown();server.server_close();thread.join()

    def test_economy_and_activity_routes_require_session_and_csrf(self):
        with tempfile.TemporaryDirectory() as temp:
            server = make_server('127.0.0.1', 0, Path(temp) / 'http.db')
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                def request(path, body=None, cookie=None, csrf=None):
                    connection = http.client.HTTPConnection(*server.server_address)
                    headers = {'Content-Type': 'application/json'}
                    if cookie: headers['Cookie'] = cookie
                    if csrf: headers['X-CSRF-Token'] = csrf
                    connection.request('GET' if body is None else 'POST', path, None if body is None else json.dumps(body), headers)
                    response = connection.getresponse()
                    result = response.status, dict(response.getheaders()), json.loads(response.read())
                    connection.close()
                    return result
                self.assertEqual(request('/api/economy')[0], 401)
                _, headers, bootstrap = request('/api/bootstrap')
                cookie = headers['Set-Cookie'].split(';')[0]
                csrf = bootstrap['csrf_token']
                self.assertEqual(request('/api/profile', {'name': 'HTTP'}, cookie, csrf)[0], 200)
                self.assertEqual(request('/api/economy', cookie=cookie)[0], 200)
                self.assertEqual(request('/api/shop/buy', {'item_id': 'coffee'}, cookie)[0], 403)
                self.assertEqual(request('/api/quests/firstprofile/claim', {}, cookie, csrf)[0], 200)
                self.assertEqual(request('/api/shop/buy', {'item_id': 'coffee'}, cookie, csrf)[0], 200)
                self.assertEqual(request('/api/inventory/use', {'item_id': 'coffee'}, cookie, csrf)[0], 200)
                result = request('/api/world/activity', {'action': 'phone', 'open': True}, cookie, csrf)
                self.assertEqual(result[0], 200)
                self.assertEqual(result[2]['players'][0]['pose'], 'phone')
            finally:
                server.shutdown()
                server.server_close()
                thread.join()


if __name__ == '__main__':
    unittest.main()
