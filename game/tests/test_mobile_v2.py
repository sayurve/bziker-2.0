import importlib.util
import json
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from game import GameService, GameError
from world import nearest_city_position, WorldService, WORLD_MAP, CITY_SPAWN, CITY_BOUNDS, DISTRICT_BUILDINGS
from world_fixtures import fixture_position


class MobileV2Tests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.g=GameService(Path(self.tmp.name)/'game.db')
        self.w=WorldService(self.g,clock=lambda:1000)
        self.a,self.b,self.c=[self.g.create_account() for _ in range(3)]
        for uid,name in zip((self.a,self.b,self.c),('Alpha','Beta','Gamma')):
            self.g.profile(uid,{'name':name})

    def denied(self,fn,*args,status=None):
        with self.assertRaises(GameError) as raised: fn(*args)
        if status: self.assertEqual(raised.exception.status,status)

    def social(self):
        self.assertIsNotNone(importlib.util.find_spec('social'),'Persistent SocialService is missing')
        from social import SocialService
        return SocialService(self.g,self.w)

    def clan(self,uid,name):
        return self.w.create_clan(uid,{'name':name,'color':'#112233','flag':'!'})['id']

    def fill_clan(self,uid,cid):
        members=[]
        for index in range(3):
            member=self.g.create_account();self.g.profile(member,{'name':f'{cid[:8]} Builder {index}'})
            self.w.mutate_clan(member,cid,'apply',{})
            self.w.mutate_clan(uid,cid,'accept',{'account_id':member});members.append(member)
        return members

    def approach_plot(self,uid,plot):
        point=next(b['door'] for b in DISTRICT_BUILDINGS if b['id']==plot)
        fixture_position(self.w,uid,**point)
        return self.w.snapshot(uid)

    def build(self,uid,cid,plot):
        return self.w.mutate_clan(uid,cid,'building',{'building_id':plot,'exterior_style':0,'exterior_color':'#faf8f2'})

    def test_nickname_is_immutable_and_unicode_unique(self):
        self.denied(self.g.profile,self.a,{'name':'Renamed'},status=409)
        for name in ['alpha','Ａｌｐｈａ',' Alpha ']:
            self.denied(self.g.profile,self.g.create_account(),{'name':name},status=409)
        first=self.g.create_account(); self.g.profile(first,{'name':'Écho'})
        self.denied(self.g.profile,self.g.create_account(),{'name':'E\u0301CHO'},status=409)
        self.assertEqual(self.g.bootstrap(self.a)['profile']['name'],'Alpha')

    def test_expanded_avatar_validates_every_range_and_keeps_legacy_values(self):
        maxima={'gender':1,'skin':7,'hairStyle':11,'hairColor':9,'shirtStyle':3,'shirtColor':11,'pantsStyle':3,'pantsColor':7,'accessory':5,'shoesColor':5}
        p=self.g.profile(self.a,{'name':'Alpha','avatar':maxima})
        self.assertEqual(p['avatar'],maxima | {'outfit':0,'headwear':0})
        for key,maximum in maxima.items():
            for value in (maximum+1,-1,True,0.5):
                self.denied(self.g.profile,self.a,{'name':'Alpha','avatar':{key:value}})
        legacy={'skin':3,'hairStyle':2,'hairColor':4,'shirtColor':5,'pantsColor':3,'accessory':2}
        with self.g.transaction() as db:
            for uid,name in ((self.a,'Same'),(self.b,'same')):
                db.execute('UPDATE accounts SET profile=? WHERE id=?',(json.dumps({'id':uid,'name':name,'avatar':legacy}),uid))
        again=GameService(self.g.db_path)
        for uid,name in ((self.a,'Same'),(self.b,'same')):
            p=again.bootstrap(uid)['profile']; self.assertEqual(p['name'],name)
            self.assertEqual({key:p['avatar'][key] for key in legacy},legacy)
            self.assertEqual(set(p['avatar']),set(maxima)|{'outfit','headwear'})
            again.profile(uid,{'name':name,'avatar':p['avatar']})
        self.denied(again.profile,again.create_account(),{'name':'SAME'},status=409)

    def test_nickname_registration_is_atomic(self):
        users=[self.g.create_account() for _ in range(10)]
        def create(uid):
            try: self.g.profile(uid,{'name':'Одно имя'}); return True
            except GameError as err: self.assertEqual(err.status,409); return False
        with ThreadPoolExecutor(max_workers=10) as pool: self.assertEqual(sum(pool.map(create,users)),1)

    def test_social_search_messages_ownership_and_unread(self):
        s=self.social(); self.w.admit(self.b)
        result=s.search(self.a,'ＢＥＴ'); self.assertEqual([p['id'] for p in result['players']],[self.b])
        self.assertTrue(result['players'][0]['online'])
        s.message(self.a,self.b,{'text':'Hello <b>Beta</b>'})
        self.assertEqual(s.phone(self.b)['unread'],1)
        self.assertEqual(s.phone(self.b)['conversations'][0]['peer']['id'],self.a)
        self.assertEqual(s.conversation(self.c,self.b)['messages'],[])
        msgs=s.conversation(self.b,self.a)['messages']
        self.assertEqual(msgs[0]['text'],'Hello <b>Beta</b>')
        self.assertEqual(s.phone(self.b)['unread'],0)
        self.denied(s.message,self.a,self.a,{'text':'Self'})
        self.denied(s.message,self.a,self.b,{'text':' '})
        self.denied(s.conversation,self.a,'missing',status=404)
        again=self.social(); self.assertEqual(len(again.conversation(self.a,self.b)['messages']),1)

    def test_invitations_choose_server_codes_and_preserve_permissions(self):
        s=self.social()
        lid=self.g.create_lobby(self.a,{'title':'Team','mode':'team'})['id']
        team=self.g.mutate(self.a,lid,'teams',{'name':'Own'})['teams'][0]['id']
        s.invite(self.a,{'to_id':self.b,'lobby_id':lid,'role':'player','team_id':team})
        invitation=s.phone(self.b)['notifications'][0]
        self.assertEqual(invitation['lobby'],{'id':lid,'title':'Team'})
        self.assertNotIn('code',json.dumps(invitation))
        self.denied(s.respond,self.c,invitation['id'],'accept',status=403)
        self.assertEqual(s.respond(self.b,invitation['id'],'accept'),{'accepted':True,'lobby_id':lid})
        with self.g.transaction() as db: self.assertEqual(self.g._load(db,lid,self.b)['members'][self.b]['team'],team)
        self.assertEqual(s.respond(self.b,invitation['id'],'accept')['lobby_id'],lid)
        self.denied(s.invite,self.b,{'to_id':self.c,'lobby_id':lid,'role':'curator'},status=403)
        self.denied(s.invite,self.b,{'to_id':self.c,'lobby_id':lid,'role':'player','team_id':team},status=403)
        self.denied(s.invite,self.c,{'to_id':self.b,'lobby_id':lid,'role':'player'},status=403)
        s.invite(self.a,{'to_id':self.c,'lobby_id':lid,'role':'curator'})
        inv=s.phone(self.c)['notifications'][0]
        s.respond(self.c,inv['id'],'accept')
        for fn,args in ((s.search,(self.c,'')),(s.phone,(self.c,)),(s.conversation,(self.c,self.a)),(s.message,(self.c,self.a,{'text':'hidden'})),(s.invite,(self.c,{'to_id':self.b,'lobby_id':lid,'role':'player'})),(s.respond,(self.c,inv['id'],'dismiss'))):
            self.denied(fn,*args,status=403)
        self.denied(s.message,self.a,self.c,{'text':'Do not expose authors'},status=403)

    def test_invitation_dismiss_and_stale_accept_are_transactional(self):
        s=self.social(); lid=self.g.create_lobby(self.a,{'title':'Solo','mode':'individual'})['id']
        s.invite(self.a,{'to_id':self.b,'lobby_id':lid,'role':'player'})
        inv=s.phone(self.b)['notifications'][0]
        self.assertEqual(s.respond(self.b,inv['id'],'dismiss'),{'dismissed':True})
        self.denied(s.respond,self.b,inv['id'],'accept',status=409)
        s.invite(self.a,{'to_id':self.c,'lobby_id':lid,'role':'player'})
        inv=s.phone(self.c)['notifications'][0]
        with self.g.transaction() as db:
            lobby=self.g._load(db,lid,self.a); lobby['state']='finished'; self.g._save(db,lobby)
        self.denied(s.respond,self.c,inv['id'],'accept',status=409)
        self.assertEqual(s.phone(self.c)['notifications'][0]['state'],'pending')

    def test_city_bounds_collision_and_legacy_relocation(self):
        self.assertEqual(self.w.snapshot(self.a)['position'],dict(zip(('x','y'),CITY_SPAWN)))
        left,right,top,bottom=CITY_BOUNDS
        left,right,top,bottom=left+14,right-14,top+14,bottom-14
        for x,y in ((left,top),(right,bottom),CITY_SPAWN):
            # Bounds validation is independent of unrelated obstacles between
            # opposite corners. Actual sweeps have their own wall regressions.
            fixture_position(self.w,self.a,x,y)
            self.assertEqual(self.w.move(self.a,{'scene':'city','x':x,'y':y})['position'],{'x':x,'y':y})
        for x,y in [(left-1,top),(right+1,bottom),(left,top-1),(right,bottom+1)]+[(b['x']+b['width']/2,b['y']+b['height']/2) for b in WORLD_MAP['solids']]:
            self.denied(self.w.move,self.a,{'scene':'city','x':x,'y':y})
        station = next(b for b in WORLD_MAP['buildings'] if b['id'] == 'railway')
        with self.g.transaction() as db: db.execute("UPDATE presence SET x=?,y=? WHERE account_id=?",(station['x']+station['width']/2,station['y']+station['height']/2,self.a))
        self.assertEqual(self.w.snapshot(self.a)['position'],dict(zip(('x','y'),nearest_city_position(station['x']+station['width']/2,station['y']+station['height']/2))))
        self.assertEqual(self.g.bootstrap(self.a)['profile']['name'],'Alpha')

    def test_world_snapshot_relocates_other_legacy_players_inside_buildings(self):
        self.w.snapshot(self.b)
        with self.g.transaction() as db:
            station = next(b for b in WORLD_MAP['buildings'] if b['id'] == 'railway')
            db.execute('UPDATE presence SET x=?,y=? WHERE account_id=?',(station['x']+station['width']/2,station['y']+station['height']/2,self.b))
        players={p['id']:p for p in self.w.snapshot(self.a)['players']}
        self.assertEqual((players[self.b]['x'],players[self.b]['y']),nearest_city_position(station['x']+station['width']/2,station['y']+station['height']/2))

    def test_district_construction_is_atomic_leader_only_and_keeps_separate_interiors(self):
        first=self.clan(self.a,'A'); second=self.clan(self.b,'B')
        snapshot=self.w.move(self.a,{'scene':'district','x':900,'y':800})
        self.assertEqual(len(snapshot['buildings']),8)
        self.assertIsNone(snapshot['my_clan']['base']['building_id'])
        self.assertIsNone(self.w.clan_snapshot(self.b,second)['base']['building_id'])
        self.fill_clan(self.a,first);self.fill_clan(self.b,second)
        items=[{'id':'p','type':'plant','x':1,'y':1}]
        self.w.mutate_clan(self.c,first,'apply',{}); self.w.mutate_clan(self.a,first,'accept',{'account_id':self.c})
        self.denied(self.w.mutate_clan,self.c,first,'building',{'building_id':'base-8'},status=403)
        self.approach_plot(self.a,'base-8');self.approach_plot(self.b,'base-8')
        def claim(pair):
            uid,cid=pair
            try: self.build(uid,cid,'base-8'); return True
            except GameError as error: self.assertEqual(error.status,409); return False
        with ThreadPoolExecutor(max_workers=2) as pool: self.assertEqual(sum(pool.map(claim,((self.a,first),(self.b,second)))),1)
        for uid,cid in ((self.a,first),(self.b,second)):
            if self.w.clan_snapshot(uid,cid)['base']['building_id'] is None:
                self.approach_plot(uid,'base-7');self.build(uid,cid,'base-7')
        self.w.mutate_clan(self.a,first,'base',{'items':items})
        self.assertEqual(self.w.clan_snapshot(self.a,first)['base']['items'],[item | {'color':'#faf8f2','variant':'standard'} for item in items])
        for x,y in [(b['footprint']['x']+b['footprint']['width']/2,b['footprint']['y']+b['footprint']['height']/2) for b in DISTRICT_BUILDINGS]:
            self.denied(self.w.move,self.a,{'scene':'city','x':x,'y':y})
        self.w.move(self.a,{'scene':'base','x':600,'y':510})
        self.w.move(self.b,{'scene':'base','x':600,'y':510})
        self.assertNotIn(self.b,{p['id'] for p in self.w.snapshot(self.a)['players']})
        again=WorldService(GameService(self.g.db_path),clock=lambda:1000)
        self.assertEqual(again.clan_snapshot(self.a,first)['base'],self.w.clan_snapshot(self.a,first)['base'])

    def test_full_district_allows_unhoused_clan_and_archive_releases_building(self):
        clans=[]
        for i in range(9):
            uid=self.g.create_account(); self.g.profile(uid,{'name':f'Leader {i}'})
            cid=self.clan(uid,f'Clan {i}'); members=self.fill_clan(uid,cid);clans.append((uid,cid,members))
            if i<8:
                self.approach_plot(uid,f'base-{i+1}');self.build(uid,cid,f'base-{i+1}')
        self.assertIsNone(self.w.clan_snapshot(*clans[-1][:2])['base']['building_id'])
        self.approach_plot(clans[-1][0],'base-1')
        self.denied(self.build,*clans[-1][:2],'base-1',status=409)
        for member in clans[0][2]:self.w.mutate_clan(member,clans[0][1],'leave',{})
        self.w.mutate_clan(*clans[0][:2],'leave',{})
        housed=self.build(*clans[-1][:2],'base-1')
        self.assertEqual(housed['base']['building_id'],'base-1')
        self.assertEqual(sum(b['clan'] is not None for b in self.w.snapshot(self.a)['buildings']),8)
