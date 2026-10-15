import tempfile
import http.client
import json
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from game import GameService, GameError
from world import nearest_city_position, WorldService, WORLD_MAP, BENCHES, valid_position
from economy import EconomyService, change_balance, inventory_quantity
from server import make_server
from world_fixtures import fixture_position


class ActivitiesV5Tests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.g=GameService(Path(self.tmp.name)/'activities.db');self.now=1791579599
        self.w=WorldService(self.g,clock=lambda:self.now);self.e=EconomyService(self.g,self.w)
        self.a,self.b=[self.g.create_account() for _ in range(2)]
        self.g.profile(self.a,{'name':'ActivityAlpha'});self.g.profile(self.b,{'name':'ActivityBeta'})

    def deny(self,fn,*args,code):
        with self.assertRaises(GameError) as e:fn(*args)
        self.assertEqual(e.exception.code,code)

    def near(self,uid,action):
        point=next(a for a in WORLD_MAP['activities'] if a['action']==action)
        route = next(route for route in WORLD_MAP['action_routes'] if route['id'] == point['id'])
        origin = WORLD_MAP['landmarks'][route['from']]
        self.assertEqual(self.w.move(uid, {'scene': 'city', 'teleport': True, **origin})['position'], origin)
        for x, y in route['points']:
            self.assertEqual(self.w.move(uid, {'scene': 'city', 'x': x, 'y': y})['position'], {'x': x, 'y': y})
        self.assertEqual(self.w.snapshot(uid)['position'], {key: point[key] for key in ('x', 'y')})
        if action in ('pet-dog','pet-cat'):
            # An animal has moved since its map spawn. The successful action
            # must target the current server-authored position, not that spawn.
            animal=next(a for a in self.w.snapshot(uid)['animals'] if a['id']==point['id'])
            current={key:animal[key] for key in ('x','y')}
            self.assertTrue(valid_position('city',**current))
            self.assertEqual(self.w.move(uid,{'scene':'city',**current})['position'],current)
        return point['id']

    def test_actual_events_once_and_daily_claims_use_moscow_day_and_30_cap(self):
        self.deny(self.e.claim,self.a,'parkvisit',code='quest_unavailable')
        self.w.move(self.a,{'scene':'city','teleport':True,**WORLD_MAP['landmarks']['park']})
        self.e.claim(self.a,'parkvisit');self.e.claim(self.a,'parkvisit')
        from world import PARK_BENCHES
        self.assertTrue(PARK_BENCHES,'The current map must expose real park seats for the timed park quest')
        bench=next(iter(sorted(PARK_BENCHES)))
        x,y=nearest_city_position(*BENCHES[bench]);fixture_position(self.w,self.a,x,y)
        self.w.activity(self.a,{'action':'sit','bench_id':bench})
        self.w.activity(self.a,{'action':'phone','open':True})
        self.now+=9;self.deny(self.e.claim,self.a,'sit10s',code='quest_unavailable')
        self.now+=1;self.e.claim(self.a,'sit10s')
        litter=self.near(self.a,'pick-litter');self.e.action(self.a,{'action':'pick-litter','target_id':litter})
        bin_id=self.near(self.a,'trash-bin');self.e.action(self.a,{'action':'trash-bin','target_id':bin_id})
        before=self.e.snapshot(self.a)['balance']
        with ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(lambda _:self.e.claim(self.a,'dailypark'),range(3)))
        self.e.claim(self.a,'dailysit');result=self.e.claim(self.a,'dailytrash')
        self.assertEqual(result['balance']-before,30);self.assertEqual(result['daily']['remaining'],0)
        first_day=result['daily']['day'];self.now+=86400
        snapshot=self.e.snapshot(self.a);self.assertNotEqual(snapshot['daily']['day'],first_day)
        self.assertEqual(snapshot['daily']['remaining'],30)
        self.deny(self.e.claim,self.a,'dailytrash',code='quest_unavailable')
        self.w.move(self.a,{'scene':'city','teleport':True,**WORLD_MAP['landmarks']['park']})
        self.e.claim(self.a,'dailypark')

    def test_fishing_requires_owned_rod_near_spot_wait_and_atomic_retry(self):
        spot=self.near(self.a,'fishing')
        self.deny(self.e.start_fishing,self.a,{'spot_id':spot},code='rod_required')
        with self.g.transaction() as db:change_balance(db,self.a,100,'test:fishing')
        self.e.buy(self.a,{'item_id':'rod'})
        pending=self.e.start_fishing(self.a,{'spot_id':spot})['active']
        self.assertEqual(self.e.start_fishing(self.a,{'spot_id':spot})['active']['id'],pending['id'])
        self.deny(self.e.catch_fish,self.b,pending['id'],code='forbidden')
        self.deny(self.e.catch_fish,self.a,pending['id'],code='fish_not_ready')
        self.now+=2;self.assertEqual(self.e.fishing(self.a)['active']['state'],'ready')
        with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(lambda _:self.e.catch_fish(self.a,pending['id']),range(2)))
        self.assertEqual(results[0],results[1]);self.assertEqual(results[0]['active']['state'],'caught')
        with self.g.transaction() as db:self.assertEqual(inventory_quantity(db,self.a,'fish'),1)
        self.assertTrue(next(q for q in self.e.snapshot(self.a)['quests'] if q['id']=='firstfish')['eligible'])

    def test_litter_dog_pet_and_funny_outfits_are_real_owned_state(self):
        dog=self.near(self.a,'pet-dog');self.e.action(self.a,{'action':'pet-dog','target_id':dog})
        self.e.claim(self.a,'petdog')
        litter=self.near(self.a,'pick-litter')
        self.e.action(self.a,{'action':'pick-litter','target_id':litter});self.e.action(self.a,{'action':'pick-litter','target_id':litter})
        with self.g.transaction() as db:self.assertEqual(inventory_quantity(db,self.a,'trash'),1)
        self.deny(self.e.action,self.a,{'action':'trash-bin','target_id':litter},code='not_found')
        bin_id=self.near(self.a,'trash-bin');self.e.action(self.a,{'action':'trash-bin','target_id':bin_id})
        self.deny(self.e.action,self.a,{'action':'trash-bin','target_id':bin_id},code='item_missing')
        self.deny(self.e.use,self.a,{'item_id':'pet-dog'},code='item_missing')
        self.deny(self.g.profile,self.a,{'avatar':{'outfit':4}},code='outfit_locked')
        with self.g.transaction() as db:change_balance(db,self.a,1000,'test:cosmetics')
        self.e.buy(self.a,{'item_id':'pet-dog'});self.e.use(self.a,{'item_id':'pet-dog'})
        self.e.buy(self.a,{'item_id':'outfit-4'});self.g.profile(self.a,{'avatar':{'outfit':4}})
        self.assertEqual(self.w.snapshot(self.a)['pet'],{'id':'pet-dog','kind':'dog'})
        visible=next(p for p in self.w.snapshot(self.b)['players'] if p['id']==self.a)
        self.assertEqual(visible['pet'],{'id':'pet-dog','kind':'dog'})
        again=EconomyService(GameService(self.g.db_path),self.w)
        self.assertEqual(again.snapshot(self.a)['selected_pet'],'pet-dog')

    def test_moscow_day_rolls_at_2100_utc_and_room_visits_are_server_derived(self):
        before=self.e.snapshot(self.a)['daily']['day']
        self.assertEqual(before,'2026-10-09');self.now+=1
        self.assertEqual(self.e.snapshot(self.a)['daily']['day'],'2026-10-10')
        from world import INTERIORS
        for room_id,qid in (('terrace','terracevisit'),('casino','casinovisit')):
            self.deny(self.e.claim,self.a,qid,code='quest_unavailable')
            door=INTERIORS[room_id]['door']
            self.w.move(self.a,{'scene':'city','teleport':True,'x':door['x'],'y':door['y']+24})
            self.w.move(self.a,{'scene':'city',**INTERIORS[room_id]['door']})
            self.w.enter(self.a,{'building_id':room_id})
            self.assertTrue(next(q for q in self.e.snapshot(self.a)['quests'] if q['id']==qid)['eligible'])
            self.e.claim(self.a,qid)


class ActivitiesV5HttpTests(unittest.TestCase):
    def test_route_contracts_session_csrf_fishing_and_addressed_guests(self):
        with tempfile.TemporaryDirectory() as tmp:
            server=make_server('127.0.0.1',0,Path(tmp)/'http.db');now=[1000]
            server.world.clock=lambda:now[0]
            thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            clients=[{'cookie':None,'csrf':None} for _ in range(2)]
            def req(client,path,data=None,csrf=True):
                headers={'Content-Type':'application/json'}
                if client['cookie']:headers['Cookie']=client['cookie']
                if csrf and client['csrf']:headers['X-CSRF-Token']=client['csrf']
                connection=http.client.HTTPConnection(*server.server_address)
                connection.request('GET' if data is None else 'POST',path,None if data is None else json.dumps(data),headers)
                response=connection.getresponse();result=json.loads(response.read());status=response.status
                cookie=response.getheader('Set-Cookie')
                if cookie:client['cookie']=cookie.split(';')[0]
                if 'csrf_token' in result:client['csrf']=result['csrf_token']
                connection.close();return status,result
            try:
                a,b=clients
                self.assertEqual(req(a,'/api/fishing')[0],401)
                ids=[]
                for index,client in enumerate(clients):
                    req(client,'/api/bootstrap');ids.append(req(client,'/api/profile',{'name':f'ActivityHTTP{index}'})[1]['id'])
                cid=req(a,'/api/clans',{'name':'HTTP guests','color':'#111111','flag':'!'})[1]['id']
                self.assertEqual(req(a,f'/api/clans/{cid}/invite',{'to_id':ids[1]})[0],409)
                for index in range(3):
                    member=server.game.create_account();server.game.profile(member,{'name':f'HTTP clan builder {index}'})
                    server.world.mutate_clan(member,cid,'apply',{})
                    server.world.mutate_clan(ids[0],cid,'accept',{'account_id':member})
                plot=WORLD_MAP['district']['buildings'][0]
                self.assertEqual(req(a,'/api/world/move',{'scene':'city','teleport':True,
                    'x':plot['door']['x'],'y':plot['door']['y']+24})[0],200)
                built=req(a,f'/api/clans/{cid}/building',{'building_id':plot['id'],'exterior_style':5,'exterior_color':'#ffffff'})
                self.assertEqual(built[0],200);self.assertEqual(built[1]['base']['exterior_style'],5)
                invitation=req(a,f'/api/clans/{cid}/invite',{'to_id':ids[1]})[1]['invitation']
                self.assertEqual(req(b,'/api/base-invitations')[1]['invitations'][0]['id'],invitation['id'])
                self.assertEqual(req(a,f'/api/base-invitations/{invitation["id"]}/accept',{})[0],403)
                self.assertEqual(req(b,f'/api/base-invitations/{invitation["id"]}/accept',{})[0],200)
                self.assertTrue(req(b,'/api/world/move',{'scene':'base','clan_id':cid,'x':600,'y':670})[1]['active_base']['is_guest'])
                with server.game.transaction() as db:change_balance(db,ids[0],100,'test:rod')
                req(a,'/api/shop/buy',{'item_id':'rod'})
                point=next(p for p in WORLD_MAP['activities'] if p['action']=='fishing')
                route=next(route for route in WORLD_MAP['action_routes'] if route['id']==point['id'])
                self.assertEqual(req(a,'/api/world/move',{'scene':'city','teleport':True,
                    **WORLD_MAP['landmarks'][route['from']]})[0],200)
                for x,y in route['points']:
                    status,walked=req(a,'/api/world/move',{'scene':'city','x':x,'y':y})
                    self.assertEqual(status,200,walked)
                    self.assertEqual(walked['position'],{'x':x,'y':y})
                self.assertEqual(walked['position'],{key:point[key] for key in ('x','y')})
                self.assertEqual(req(a,'/api/fishing/start',{'spot_id':point['id']},csrf=False)[0],403)
                rid=req(a,'/api/fishing/start',{'spot_id':point['id']})[1]['active']['id'];now[0]+=2
                self.assertEqual(req(a,'/api/fishing')[1]['active']['state'],'ready')
                result=req(a,f'/api/fishing/{rid}/catch',{})
                self.assertEqual(result[0],200);self.assertEqual(result[1]['active']['fish'],{'item_id':'fish','quantity':1})
                self.assertEqual(req(a,f'/api/fishing/{rid}/catch',{})[1],result[1])
                self.assertEqual(req(a,'/api/world/activity',{'action':'sit','bench_id':[]})[0],404)
                self.assertEqual(req(a,'/api/world/action',{'action':'pet-dog','target_id':'park-dog'})[0],409)
                self.assertEqual(req(a,'/furniture-map.json')[0],200)
            finally:server.shutdown();server.server_close();thread.join()


if __name__=='__main__':unittest.main()
