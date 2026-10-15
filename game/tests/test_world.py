import json
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from game import GameService, GameError
from clan_fixtures import legacy_home
try:
    from world import WorldService, CITY_BOUNDS, CITY_SPAWN
except ImportError:
    WorldService = None


class WorldTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(WorldService, 'WorldService must implement persistent world rules')
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.g = GameService(Path(self.tmp.name)/'game.db')
        self.now = 1000
        self.w = WorldService(self.g, clock=lambda: self.now)
        self.users = [self.g.create_account() for _ in range(4)]
        for i,u in enumerate(self.users): self.g.profile(u, {'name':f'Имя {i}'})
        self.host,self.mate,self.jury,self.outside=self.users

    def clan(self):
        return self.w.create_clan(self.host, {'name':'БЗИК','color':'#FF8562','flag':'★'})['id']

    def lobby(self, policy='all', mode='individual'):
        lid=self.g.create_lobby(self.host, {'title':'Тест','mode':mode,'answer_policy':policy})['id']
        s=self.g.snapshot(self.host,lid)
        self.g.join(self.mate,s['player_code'])
        self.g.join(self.jury,s['jury_code'])
        if mode=='team':
            self.g.mutate(self.host,lid,'teams',{'name':'А'})
            self.g.mutate(self.mate,lid,'teams',{'name':'Б'})
        self.g.mutate(self.host,lid,'start',{})
        self.g.mutate(self.host,lid,'question',{'question_id':'idea_100'})
        return lid

    def denied(self, fn, *args):
        with self.assertRaises(GameError): fn(*args)

    def test_active_admission_is_atomic_unique_counts_jury_and_reclaims_ttl(self):
        self.assertTrue(callable(getattr(self.w,'admit',None)),'Active-account admission must be implemented')
        lid=self.lobby()
        accounts=[self.host,self.jury]+[self.g.create_account() for _ in range(99)]
        with ThreadPoolExecutor(max_workers=12) as pool:
            def admit(u):
                try: self.w.admit(u); return u
                except GameError: return None
            result=list(pool.map(admit,accounts))
        self.assertEqual(sum(u is not None for u in result),100)
        admitted=next(u for u in result if u)
        self.w.admit(admitted)
        with self.g.transaction() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM active_accounts').fetchone()[0],100)
        self.now+=44
        self.w.admit(admitted)
        self.now+=2
        newcomer=self.g.create_account()
        self.w.admit(newcomer)
        with self.g.transaction() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM active_accounts').fetchone()[0],2)
        self.assertEqual(self.w.snapshot(self.jury)['online_count'],0)
        self.assertTrue(self.w.snapshot(self.jury)['restricted'])

    def test_last_leader_archives_clan_and_keeps_permanent_results(self):
        cid=self.clan()
        self.w.mutate_clan(self.outside,cid,'apply',{})
        lid=self.lobby()
        self.g.mutate(self.host,lid,'answer',{'text':'Ответ'})
        self.g.mutate(self.host,lid,'review',{})
        card=self.g.snapshot(self.jury,lid)['cards'][0]
        self.g.mutate(self.jury,lid,'grade',{'token':card['token'],'score':10})
        self.g.mutate(self.jury,lid,'review/finish',{})
        self.g.mutate(self.host,lid,'finish',{})
        self.w.mutate_clan(self.host,cid,'leave',{})
        snapshot=self.w.snapshot(self.host)
        self.assertIsNone(snapshot['my_clan'])
        self.assertEqual(snapshot['clans'],[])
        self.assertIn(cid,{c['id'] for c in snapshot['leaderboard']})
        historical=next(c for c in snapshot['leaderboard'] if c['id']==cid)
        self.assertEqual(historical['status'],'archived')
        self.assertEqual(historical['score'],100)
        self.assertEqual(historical['wins'],1)
        self.denied(self.w.mutate_clan,self.outside,cid,'apply',{})
        self.denied(self.w.mutate_clan,self.host,cid,'base',{'items':[]})
        self.denied(self.w.clan_snapshot,self.host,cid)
        self.denied(self.w.move,self.host,{'scene':'base','x':600,'y':510})
        with self.g.transaction() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM clan_requests WHERE clan_id=?',(cid,)).fetchone()[0],0)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM clan_results WHERE clan_id=?',(cid,)).fetchone()[0],1)
        again=WorldService(GameService(self.g.db_path),clock=lambda:self.now)
        self.assertEqual(again.snapshot(self.host)['leaderboard'][0],historical)

    def test_legacy_clan_schema_migrates_with_active_status_and_base_retained(self):
        import sqlite3
        legacy=Path(self.tmp.name)/'legacy.db'
        with sqlite3.connect(legacy) as db:
            db.execute('CREATE TABLE clans (id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE,color TEXT NOT NULL,flag TEXT NOT NULL,leader_id TEXT NOT NULL,base TEXT NOT NULL)')
            db.execute('INSERT INTO clans VALUES (?,?,?,?,?,?)',('old','Старый','#111111','!',self.host,'{"items":[]}'))
        db.close()
        game=GameService(legacy)
        world=WorldService(game,clock=lambda:self.now)
        user=game.create_account(); game.profile(user,{'name':'Старый лидер'})
        with game.transaction() as db:
            db.execute('UPDATE clans SET leader_id=? WHERE id=?',(user,'old'))
            db.execute('INSERT INTO clan_members VALUES (?,?)',(user,'old'))
        snapshot=world.clan_snapshot(user,'old')
        self.assertEqual(snapshot.get('status'),'active')
        self.assertEqual(snapshot['base'],{'items':[],'building_id':'base-1','wall_color':'#faf8f2','floor_color':'#141414','exterior_style':0,'exterior_color':'#111111','exterior_locked':True})

    def test_clan_membership_requests_transfer_and_persistence(self):
        cid=self.clan()
        self.denied(self.w.create_clan,self.host,{'name':'Ещё','color':'#111111','flag':'!'} )
        self.w.mutate_clan(self.mate,cid,'apply',{})
        self.w.mutate_clan(self.mate,cid,'apply',{})
        self.assertEqual(len(self.w.clan_snapshot(self.host,cid)['requests']),1)
        self.denied(self.w.clan_snapshot,self.outside,cid)
        self.denied(self.w.mutate_clan,self.mate,cid,'accept',{'account_id':self.mate})
        self.w.mutate_clan(self.host,cid,'accept',{'account_id':self.mate})
        self.assertEqual(self.w.clan_snapshot(self.mate,cid)['requests'],[])
        self.denied(self.w.mutate_clan,self.host,cid,'leave',{})
        self.w.mutate_clan(self.host,cid,'transfer',{'account_id':self.mate})
        self.w.mutate_clan(self.host,cid,'leave',{})
        again=WorldService(GameService(self.g.db_path),clock=lambda:self.now)
        self.assertTrue(again.clan_snapshot(self.mate,cid)['is_leader'])
        self.w.mutate_clan(self.mate,cid,'leave',{})
        self.assertEqual(self.w.snapshot(self.mate)['clans'],[])

    def test_leader_saved_base_validation_and_member_scene(self):
        cid=self.clan()
        legacy_home(self.g,cid)
        self.w.mutate_clan(self.mate,cid,'apply',{})
        self.w.mutate_clan(self.host,cid,'accept',{'account_id':self.mate})
        items=[{'id':'plant1','type':'plant','x':3,'y':2}]
        self.denied(self.w.mutate_clan,self.mate,cid,'base',{'items':items})
        self.w.mutate_clan(self.host,cid,'base',{'items':items})
        self.assertEqual(self.w.clan_snapshot(self.mate,cid)['base']['items'],[item | {'color':'#faf8f2','variant':'standard'} for item in items])
        for bad in [items*2,[{'id':'bad','type':'car','x':0,'y':0}],
                    [{'id':'bad','type':'plant','x':12,'y':0}],
                    [{'id':'bad','type':'plant','x':True,'y':0}]]:
            self.denied(self.w.mutate_clan,self.host,cid,'base',{'items':bad})
        self.denied(self.w.move,self.outside,{'scene':'base','x':600,'y':510})
        self.assertEqual(self.w.move(self.mate,{'scene':'base','x':600,'y':510})['scene'],'base')

    def test_movement_finite_bounds_ttl_and_presence_limit(self):
        sx,sy=CITY_SPAWN
        for x,y,scene in [(float('nan'),sy,'city'),(float('inf'),sy,'city'),(True,sy,'city'),(10**1000,sy,'city'),
                          (-1,sy,'city'),(sx,CITY_BOUNDS[3]+1,'city'),(sx,sy,'unknown')]:
            self.denied(self.w.move,self.host,{'x':x,'y':y,'scene':scene})
        # A legal step beside the current station spawn isolates admission/TTL
        # behavior from geometry belonging to an older city layout.
        self.w.move(self.host,{'x':CITY_SPAWN[0]+1,'y':CITY_SPAWN[1],'scene':'city'})
        self.assertEqual(self.w.snapshot(self.mate)['online_count'],2)
        self.now+=46
        self.assertEqual(self.w.snapshot(self.mate)['online_count'],1)
        for i in range(99):
            u=self.g.create_account();self.g.profile(u,{'name':str(i)});self.w.snapshot(u)
        self.denied(self.w.snapshot,self.host)
        self.now+=46
        self.assertEqual(self.w.snapshot(self.host)['online_count'],1)

    def test_any_unfinished_jury_assignment_blackouts_all_world_routes(self):
        cid=self.clan()
        lid=self.lobby()
        redacted=self.w.snapshot(self.jury)
        self.assertTrue(redacted['restricted'])
        self.assertIsNone(redacted['position'])
        self.assertEqual(redacted['players'],[])
        self.assertEqual(redacted['clans'],[])
        self.assertIsNone(redacted['my_clan'])
        self.assertEqual(redacted['leaderboard'],[])
        self.denied(self.w.create_clan,self.jury,{'name':'Скрытый','color':'#111111','flag':'!'} )
        self.denied(self.w.clan_snapshot,self.jury,cid)
        self.denied(self.w.mutate_clan,self.jury,cid,'apply',{})
        self.denied(self.w.move,self.jury,{'scene':'city','x':CITY_SPAWN[0],'y':CITY_SPAWN[1]})
        self.g.mutate(self.host,lid,'review',{})
        # Even after the jury has no more cards this match is still unfinished.
        self.assertTrue(self.w.snapshot(self.jury)['restricted'])
        self.g.mutate(self.host,lid,'finish',{})
        self.assertFalse(self.w.snapshot(self.jury)['restricted'])

    def test_start_atomically_moves_city_participants_and_finish_persists_return(self):
        self.w.snapshot(self.host);self.w.snapshot(self.mate);self.w.snapshot(self.outside)
        lid=self.lobby()
        with self.g.transaction() as db:
            for uid in (self.host,self.mate):
                row=db.execute('SELECT scene,scene_id FROM presence WHERE account_id=?',(uid,)).fetchone()
                self.assertEqual(dict(row),{'scene':'arena','scene_id':lid})
        snapshot=self.w.snapshot(self.mate)
        self.assertEqual(snapshot['scene'],'arena')
        self.assertEqual(snapshot['arena_lobby_id'],lid)
        street=self.w.snapshot(self.outside)
        self.assertTrue({self.host,self.mate}.isdisjoint({p['id'] for p in street['players']}))
        self.denied(self.w.move,self.mate,{'scene':'city','x':CITY_SPAWN[0],'y':CITY_SPAWN[1]})
        self.g.mutate(self.host,lid,'review',{})
        self.g.mutate(self.host,lid,'finish',{})
        with self.g.transaction() as db:
            for uid in (self.host,self.mate):
                row=db.execute('SELECT scene,scene_id FROM presence WHERE account_id=?',(uid,)).fetchone()
                self.assertEqual(dict(row),{'scene':'city','scene_id':None})
        self.assertEqual(self.w.snapshot(self.mate)['scene'],'city')

    def test_active_match_restores_arena_scene_when_presence_expires_or_is_legacy_city(self):
        lid=self.lobby()
        with self.g.transaction() as db:
            db.execute('DELETE FROM presence WHERE account_id=?',(self.mate,))
        self.assertEqual(self.w.snapshot(self.mate)['arena_lobby_id'],lid)
        with self.g.transaction() as db:
            db.execute("UPDATE presence SET scene='city',scene_id=NULL WHERE account_id=?",(self.mate,))
        street=self.w.snapshot(self.outside)
        self.assertNotIn(self.mate,{p['id'] for p in street['players']})
        self.assertEqual(self.w.snapshot(self.mate)['scene'],'arena')
        self.now+=46
        self.assertEqual(self.w.snapshot(self.mate)['scene'],'arena')

    def test_unfinished_curator_assignment_prevents_participant_match_start(self):
        duty=self.g.create_lobby(self.mate,{'title':'Жюри','mode':'individual'})['id']
        game=self.g.create_lobby(self.host,{'title':'Игра','mode':'individual'})['id']
        self.g.join(self.jury,self.g.snapshot(self.host,game)['jury_code'])
        self.g.join(self.host,self.g.snapshot(self.mate,duty)['jury_code'])
        # Jury duty also blacks out older participant rosters, so the host
        # cannot inspect the start controls until that assignment finishes.
        self.denied(self.g.snapshot,self.host,game)
        self.denied(self.g.mutate,self.host,game,'start',{})

    def test_active_participant_cannot_join_another_jury_assignment(self):
        lid=self.lobby()
        second=self.g.create_lobby(self.outside,{'title':'Жюри','mode':'individual'})['id']
        invite=self.g.snapshot(self.outside,second)['jury_code']
        self.denied(self.g.join,self.mate,invite)
        self.assertEqual(self.w.snapshot(self.mate)['arena_lobby_id'],lid)

    def test_second_match_start_waits_for_first_participant_match_to_finish(self):
        lid=self.lobby()
        second=self.g.create_lobby(self.mate,{'title':'Второй','mode':'individual'})['id']
        self.g.join(self.outside,self.g.snapshot(self.mate,second)['jury_code'])
        self.assertFalse(self.g.snapshot(self.mate,second)['can_start'])
        self.denied(self.g.mutate,self.mate,second,'start',{})
        self.g.mutate(self.host,lid,'review',{})
        self.g.mutate(self.host,lid,'finish',{})
        self.g.mutate(self.mate,second,'start',{})
        self.assertEqual(self.w.snapshot(self.mate)['arena_lobby_id'],second)

    def test_arena_access_is_active_match_scoped_and_returns_to_city(self):
        lid=self.lobby()
        self.denied(self.w.move,self.outside,{'scene':'arena','lobby_id':lid,'x':600,'y':510})
        self.w.move(self.host,{'scene':'arena','lobby_id':lid,'x':600,'y':510})
        arena=self.w.move(self.mate,{'scene':'arena','lobby_id':lid,'x':650,'y':510})
        self.assertEqual(arena['arena_lobby_id'],lid)
        self.assertEqual({p['id'] for p in arena['players']},{self.host,self.mate})
        self.g.mutate(self.host,lid,'review',{})
        self.g.mutate(self.host,lid,'finish',{})
        self.denied(self.w.move,self.host,{'scene':'arena','lobby_id':lid,'x':600,'y':510})
        self.assertEqual(self.w.move(self.host,{'scene':'city','x':CITY_SPAWN[0],'y':CITY_SPAWN[1]})['scene'],'city')

    def test_blackout_retains_other_unfinished_assignment_and_hides_presence(self):
        self.w.snapshot(self.jury)
        lid=self.lobby()
        self.assertNotIn(self.jury,{p['id'] for p in self.w.snapshot(self.host)['players']})
        second=self.g.create_lobby(self.mate,{'title':'Ещё','mode':'individual'})['id']
        self.g.join(self.jury,self.g.snapshot(self.mate,second)['jury_code'])
        self.g.mutate(self.host,lid,'review',{})
        self.g.mutate(self.host,lid,'finish',{})
        self.assertTrue(self.w.snapshot(self.jury)['restricted'])
        self.g.mutate(self.mate,second,'start',{})
        self.g.mutate(self.mate,second,'finish',{})
        self.assertFalse(self.w.snapshot(self.jury)['restricted'])

    def test_non_captain_cannot_buzz_for_team(self):
        lid=self.g.create_lobby(self.host,{'title':'Тест','mode':'team','answer_policy':'first'})['id']
        invitations=self.g.snapshot(self.host,lid)
        team=self.g.mutate(self.host,lid,'teams',{'name':'Команда'})['teams'][0]
        self.g.join(self.mate,team['code'])
        self.g.join(self.jury,invitations['jury_code'])
        self.g.mutate(self.host,lid,'start',{})
        self.g.mutate(self.host,lid,'question',{'question_id':'idea_100'})
        self.denied(self.g.mutate,self.mate,lid,'buzz',{})
        self.g.mutate(self.host,lid,'buzz',{})
        self.denied(self.g.mutate,self.mate,lid,'answer',{'text':'Ответ'})

    def test_exhausted_board_records_clan_once_and_affiliation_is_frozen(self):
        cid=self.clan()
        lid=self.lobby()
        self.g.mutate(self.host,lid,'answer',{'text':'Ответ'})
        self.g.mutate(self.host,lid,'review',{})
        card=self.g.snapshot(self.jury,lid)['cards'][0]
        self.g.mutate(self.jury,lid,'grade',{'token':card['token'],'score':10})
        self.g.mutate(self.jury,lid,'review/finish',{})
        # The original clan survives with a new leader; leaving cannot redirect match credit.
        self.w.mutate_clan(self.mate,cid,'apply',{})
        self.w.mutate_clan(self.host,cid,'accept',{'account_id':self.mate})
        self.w.mutate_clan(self.host,cid,'transfer',{'account_id':self.mate})
        self.w.mutate_clan(self.host,cid,'leave',{})
        new=self.w.create_clan(self.host,{'name':'Другой','color':'#111111','flag':'!'})['id']
        questions=[q['id'] for t in self.g.snapshot(self.host,lid)['board'] for q in t['questions'] if not q['used']]
        for qid in questions:
            self.g.mutate(self.host,lid,'question',{'question_id':qid})
            self.g.mutate(self.host,lid,'review',{})
        self.assertEqual(self.g.snapshot(self.host,lid)['state'],'finished')
        self.assertEqual(self.w.clan_snapshot(self.mate,cid)['score'],100)
        self.assertEqual(self.w.clan_snapshot(self.host,new)['score'],0)
        with self.g.transaction() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM clan_results WHERE lobby_id=?',(lid,)).fetchone()[0],1)

    def test_first_buzz_is_atomic_captain_only_and_resets(self):
        lid=self.lobby('first','team')
        with ThreadPoolExecutor(max_workers=2) as pool:
            def buzz(u):
                try: self.g.mutate(u,lid,'buzz',{});return u
                except GameError:return None
            winners=list(pool.map(buzz,[self.host,self.mate]))
        self.assertEqual(sum(bool(u) for u in winners),1)
        winner=next(u for u in winners if u)
        loser=self.mate if winner==self.host else self.host
        self.denied(self.g.mutate,loser,lid,'answer',{'text':'Опоздал'})
        self.denied(self.g.mutate,self.jury,lid,'buzz',{})
        self.g.mutate(winner,lid,'answer',{'text':'Первый'})
        s=self.g.snapshot(winner,lid)
        self.assertTrue(s['buzzed_by_me'])
        self.assertFalse(s['can_buzz'])
        self.assertNotIn('buzz_owner_name',self.g.snapshot(self.jury,lid))
        self.g.mutate(self.host,lid,'review',{})
        card=self.g.snapshot(self.jury,lid)['cards'][0]
        self.g.mutate(self.jury,lid,'grade',{'token':card['token'],'score':10})
        self.g.mutate(self.jury,lid,'review/finish',{})
        self.g.mutate(self.host,lid,'question',{'question_id':'idea_200'})
        self.assertTrue(self.g.snapshot(loser,lid)['can_buzz'])
        self.g.mutate(loser,lid,'buzz',{})

    def test_first_answer_requires_buzz_and_all_rejects_buzz(self):
        lid=self.lobby('first')
        self.denied(self.g.mutate,self.host,lid,'answer',{'text':'Нет звонка'})
        self.g.mutate(self.host,lid,'buzz',{})
        self.g.mutate(self.host,lid,'answer',{'text':'Есть звонок'})
        self.g.mutate(self.host,lid,'review',{})
        card=self.g.snapshot(self.jury,lid)['cards'][0]
        self.g.mutate(self.jury,lid,'grade',{'token':card['token'],'score':10})
        self.g.mutate(self.jury,lid,'review/finish',{})
        self.g.mutate(self.host,lid,'finish',{})
        all_lid=self.lobby('all')
        self.denied(self.g.mutate,self.host,all_lid,'buzz',{})
        self.g.mutate(self.host,all_lid,'answer',{'text':'Без звонка'})
        self.denied(self.g.create_lobby,self.host,{'title':'bad','mode':'team','answer_policy':'bogus'})

    def test_clan_raw_points_ledger_one_row_per_match_and_clan(self):
        cid=self.clan()
        self.w.mutate_clan(self.mate,cid,'apply',{})
        self.w.mutate_clan(self.host,cid,'accept',{'account_id':self.mate})
        lid=self.lobby(mode='team')
        for u in [self.host,self.mate]: self.g.mutate(u,lid,'answer',{'text':'Ответ'})
        self.g.mutate(self.host,lid,'review',{})
        for card in self.g.snapshot(self.jury,lid)['cards']:
            self.g.mutate(self.jury,lid,'grade',{'token':card['token'],'score':10})
        self.g.mutate(self.jury,lid,'review/finish',{})
        self.assertEqual(self.w.clan_snapshot(self.host,cid)['score'],0)
        self.g.mutate(self.host,lid,'finish',{})
        self.assertEqual(self.w.clan_snapshot(self.host,cid)['score'],200)
        self.assertEqual(self.w.clan_snapshot(self.host,cid)['wins'],1)
        self.denied(self.g.mutate,self.host,lid,'finish',{})
        with self.g.transaction() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM clan_results WHERE lobby_id=? AND clan_id=?',(lid,cid)).fetchone()[0],1)
        again=WorldService(GameService(self.g.db_path))
        self.assertEqual(again.clan_snapshot(self.host,cid)['score'],200)
