import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer

try:
    from server import make_server
except ImportError:
    # A genuine HTTP baseline returns unsupported-route 501 before API implementation.
    def make_server(host,port,db_path,**kwargs):
        return ThreadingHTTPServer((host,port),BaseHTTPRequestHandler)


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.server=make_server('127.0.0.1',0,Path(self.tmp.name)/'game.db')
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()
        self.addCleanup(self.stop)
        self.cookie=None
        self.csrf=None

    def stop(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def req(self,path,body=None,headers=None,method=None):
        connection=http.client.HTTPConnection(*self.server.server_address,timeout=3)
        h={'Content-Type':'application/json'}
        if self.cookie: h['Cookie']=self.cookie
        if self.csrf: h['X-CSRF-Token']=self.csrf
        h.update(headers or {})
        connection.request(method or ('POST' if body is not None else 'GET'),path,
                           body if isinstance(body,(bytes,str)) else json.dumps(body) if body is not None else None,h)
        response=connection.getresponse()
        payload=response.read()
        result=(response.status,dict(response.getheaders()),payload)
        connection.close()
        return result

    def bootstrap(self):
        status,headers,payload=self.req('/api/bootstrap')
        self.assertEqual(status,200,'Bootstrap endpoint should create a local session')
        self.cookie=headers['Set-Cookie'].split(';')[0]
        data=json.loads(payload)
        self.csrf=data['csrf_token']
        return headers,data

    def test_four_direction_furniture_module_is_available_at_both_document_roots(self):
        for path in ('/furniture-views.js', '/web/furniture-views.js'):
            status, headers, payload = self.req(path)
            self.assertEqual(status, 200)
            self.assertIn(b'drawFacingFurniture', payload)
            self.assertIn('javascript', headers['Content-Type'])

    def test_modular_world_dependencies_are_available_at_both_document_roots(self):
        for module in ('city-scene.js', 'interaction-radii.js'):
            source = (Path(__file__).resolve().parents[1] / 'web' / module).read_bytes()
            for path in ('/' + module, '/web/' + module):
                status, headers, payload = self.req(path)
                self.assertEqual(status, 200, 'The browser must receive its imported scene module: ' + path)
                self.assertEqual(payload, source)
                self.assertIn('javascript', headers['Content-Type'])

    def test_rotated_furniture_http_save_returns_the_matching_authoritative_seat(self):
        from clan_fixtures import legacy_home
        self.bootstrap()
        status, _, payload = self.req('/api/profile', {'name': 'RotationHTTP', 'avatar': {}})
        self.assertEqual(status, 200)
        uid = json.loads(payload)['id']
        status, _, payload = self.req('/api/clans', {'name': 'HTTP Rotation', 'color': '#111111', 'flag': '!'})
        self.assertEqual(status, 200)
        cid = json.loads(payload)['id']
        legacy_home(self.server.game, cid)
        self.server.world.move(uid, {'scene': 'base', 'x': 600, 'y': 670})
        sofa = {'id': 'http-sofa', 'type': 'sofa', 'x': 2, 'y': 2, 'rotation': 270}
        status, _, payload = self.req(f'/api/clans/{cid}/base', {'items': [sofa]})
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(payload)['base']['items'][0]['rotation'], 270)
        status, _, payload = self.req('/api/world')
        self.assertEqual(status, 200)
        base = json.loads(payload)['active_base']['base']
        self.assertEqual(base['items'][0]['rotation'], 270)
        self.assertEqual(base['seats'][0]['facing'], 'right')
        self.assertEqual(base['seats'][0]['seat'], {'x': 367, 'y': 481})

    def test_bootstrap_cookie_profile_and_independent_accounts(self):
        headers,data=self.bootstrap()
        self.assertIn('HttpOnly',headers['Set-Cookie'])
        self.assertIn('SameSite=Strict',headers['Set-Cookie'])
        self.assertNotIn('Secure',headers['Set-Cookie'])
        self.assertEqual(data['auth_mode'],'demo')
        self.assertTrue(data['authenticated'])
        self.assertIsNone(data['profile'])
        status,_,payload=self.req('/api/profile',{'name':'Тест','avatar':{}})
        self.assertEqual(status,200)
        ident=json.loads(payload)['id']
        self.cookie=None
        _,other=self.bootstrap()
        self.assertIsNone(other['profile'])
        status,_,payload=self.req('/api/profile',{'name':'Другой'})
        self.assertNotEqual(json.loads(payload)['id'],ident)

    def test_csrf_origin_invalid_json_body_limit_and_static_allowlist(self):
        self.bootstrap()
        for headers in [{'X-CSRF-Token':'wrong'},{'Origin':'https://evil.example'},
                        {'Origin':'null'},{'Sec-Fetch-Site':'cross-site'},{'Host':'evil.example'}]:
            status,_,payload=self.req('/api/profile',{'name':'Тест'},headers)
            self.assertEqual(status,403)
            self.assertIn('error',json.loads(payload))
        for body in ['[]','null','{','{"name":"x","name":"y"}']:
            status,_,payload=self.req('/api/profile',body)
            self.assertEqual(status,400)
            self.assertIn('error',json.loads(payload))
        status,_,payload=self.req('/api/profile','x'*32769)
        self.assertEqual(status,413)
        for path in ['/game.py','/.env','/data/game.db','/game-design.txt','/curator/index.html',
                     '/web/../server.py','/assets/scene-prompt.txt','/%2e%2e/server.py']:
            self.assertEqual(self.req(path)[0],404,path)

    def test_http_game_flow_and_curator_bootstrap_privacy(self):
        self.bootstrap()
        self.req('/api/profile',{'name':'Ведущий'})
        status,_,payload=self.req('/api/lobbies',{'title':'Игра','mode':'individual','context':{}})
        self.assertEqual(status,200)
        lid=json.loads(payload)['id']
        host_cookie,host_csrf=self.cookie,self.csrf
        snapshot=json.loads(self.req('/api/lobbies/'+lid)[2])
        self.cookie=None
        self.bootstrap()
        self.req('/api/profile',{'name':'Куратор'})
        self.req('/api/lobbies/join',{'code':snapshot['jury_code']})
        jury=json.loads(self.req('/api/lobbies/'+lid)[2])
        self.assertNotIn('profile',jury)
        bootstrap=json.loads(self.req('/api/bootstrap')[2])
        self.assertEqual(set(bootstrap['lobbies'][0]),{'id','title','mode','state','role'})
        self.assertEqual(self.req('/api/lobbies/'+lid+'/start',{})[0],403)
        self.cookie,self.csrf=host_cookie,host_csrf
        self.assertEqual(self.req('/api/lobbies/'+lid+'/start',{})[0],200)
        self.assertEqual(self.req('/api/lobbies/'+lid+'/question',{'question_id':'idea_100'})[0],200)

    def test_world_clan_routes_and_jury_blackout_are_server_authorized(self):
        from world import CITY_SPAWN
        self.bootstrap()
        self.req('/api/profile',{'name':'Лидер'})
        self.assertEqual(self.req('/api/world')[0],200)
        city_step={'x':CITY_SPAWN[0]+1,'y':CITY_SPAWN[1],'scene':'city'}
        self.assertEqual(self.req('/api/world/move',city_step,{'X-CSRF-Token':'wrong'})[0],403)
        self.assertEqual(self.req('/api/world/move',city_step)[0],200)
        status,_,payload=self.req('/api/clans',{'name':'Клан','color':'#FF8562','flag':'★'})
        self.assertEqual(status,200)
        cid=json.loads(payload)['id']
        self.assertEqual(self.req('/api/clans/'+cid+'/base',{'items':[]})[0],409)
        self.assertEqual(self.req('/api/clans/'+cid)[0],200)
        lid=json.loads(self.req('/api/lobbies',{'title':'Игра','mode':'individual','answer_policy':'first'})[2])['id']
        invitation=json.loads(self.req('/api/lobbies/'+lid)[2])['jury_code']
        host_cookie,host_csrf=self.cookie,self.csrf
        self.cookie=None;self.bootstrap();self.req('/api/profile',{'name':'Жюри'})
        self.req('/api/lobbies/join',{'code':invitation})
        self.assertTrue(json.loads(self.req('/api/world')[2])['restricted'])
        self.assertEqual(self.req('/api/clans/'+cid)[0],403)
        self.assertEqual(self.req('/api/clans/'+cid+'/apply',{})[0],403)
        self.assertEqual(self.req('/api/world/move',city_step)[0],403)
        self.cookie,self.csrf=host_cookie,host_csrf
        self.req('/api/lobbies/'+lid+'/start',{})
        self.req('/api/lobbies/'+lid+'/question',{'question_id':'idea_100'})
        self.assertEqual(self.req('/api/lobbies/'+lid+'/buzz',{})[0],200)
        self.assertEqual(self.req('/api/world/move',{'x':600,'y':510,'scene':'arena','lobby_id':lid})[0],200)

    def test_authenticated_bootstrap_lobby_and_jury_calls_refresh_global_admission(self):
        now=[1000]
        self.server.world.clock=lambda:now[0]
        self.bootstrap(); self.req('/api/profile',{'name':'Хозяин'})
        lid=json.loads(self.req('/api/lobbies',{'title':'Счёт','mode':'individual'})[2])['id']
        host_cookie,host_csrf=self.cookie,self.csrf
        invite=json.loads(self.req('/api/lobbies/'+lid)[2])['jury_code']
        self.cookie=None; self.bootstrap(); self.req('/api/profile',{'name':'Жюри'})
        self.req('/api/lobbies/join',{'code':invite})
        jury_cookie,jury_csrf=self.cookie,self.csrf
        now[0]+=44
        self.assertEqual(self.req('/api/lobbies/'+lid)[0],200)
        now[0]+=2
        self.cookie,self.csrf=host_cookie,host_csrf
        self.assertEqual(self.req('/api/lobbies/'+lid)[0],200)
        with self.server.game.transaction() as db:
            self.assertIsNotNone(db.execute("SELECT name FROM sqlite_master WHERE name='active_accounts'").fetchone())
            self.assertEqual(db.execute('SELECT COUNT(*) FROM active_accounts').fetchone()[0],2)
        world=json.loads(self.req('/api/world')[2])
        self.assertEqual(world['online_count'],2)
        self.assertEqual(len(world['players']),1)
        self.cookie,self.csrf=jury_cookie,jury_csrf
        hidden=json.loads(self.req('/api/world')[2])
        self.assertEqual(hidden['online_count'],0)
        self.assertEqual(hidden['players'],[])
        self.assertEqual(hidden['leaderboard'],[])

    def test_global_admission_denies_101st_bootstrap_without_profile_or_world(self):
        self.server.world.clock=lambda:1000
        first_cookie=None
        for i in range(100):
            self.cookie=None
            self.bootstrap()
            if first_cookie is None: first_cookie=self.cookie
        self.cookie=None
        status,_,payload=self.req('/api/bootstrap')
        self.assertEqual(status,409)
        self.assertEqual(set(json.loads(payload)),{'error'})
        self.cookie=first_cookie
        self.assertEqual(self.req('/api/bootstrap')[0],200)
        self.server.world.clock=lambda:1046
        self.cookie=None
        self.assertEqual(self.req('/api/bootstrap')[0],200)
        with self.server.game.transaction() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM active_accounts').fetchone()[0],1)

    def test_world_static_modules_only_are_allowlisted(self):
        public=Path(self.tmp.name)/'static'
        (public/'web').mkdir(parents=True)
        (public/'web'/'world.js').write_text('export const world = {};')
        (public/'web'/'world-map.json').write_text('{}')
        (public/'web'/'world.css').write_text('canvas {display:block}')
        (public/'web'/'account-ui.js').write_text('export const account = {};')
        (public/'web'/'profile-builder.js').write_text('export const builder = {};')
        (public/'web'/'furniture-map.json').write_text('{}')
        self.stop()
        self.server=make_server('127.0.0.1',0,Path(self.tmp.name)/'game.db',web_root=public)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()
        for path in ['/web/world.js','/world.js','/web/world-map.json','/world-map.json','/web/world.css','/world.css',
                     '/account-ui.js','/web/account-ui.js','/profile-builder.js','/web/profile-builder.js','/furniture-map.json','/web/furniture-map.json']:
            self.assertEqual(self.req(path)[0],200,path)
        self.assertEqual(self.req('/world.py')[0],404)

    def test_public_configuration_requires_auth_and_https(self):
        # Local mode must never bind publicly; public mode requires verified Telegram and HTTPS origin.
        with self.assertRaises(ValueError): make_server('0.0.0.0',0,Path(self.tmp.name)/'other.db')
        with self.assertRaises(ValueError): make_server('0.0.0.0',0,Path(self.tmp.name)/'other.db',auth_mode='telegram',bot_token='token',public_url='http://example.com')

    def test_unicode_csrf_is_denied_deliberately(self):
        self.bootstrap()
        status,_,payload=self.req('/api/profile',{'name':'Тест'},{'X-CSRF-Token':'é'})
        self.assertEqual(status,403)
        self.assertEqual(json.loads(payload)['error']['code'],'csrf')

    def test_phone_http_routes_account_ownership_invites_and_blackout(self):
        self.bootstrap()
        status,_,body=self.req('/api/profile',{'name':'Телефон Альфа'})
        self.assertEqual(status,200); alpha=json.loads(body)['id']
        first_cookie,first_csrf=self.cookie,self.csrf
        beta=self.server.game.create_account(); self.server.game.profile(beta,{'name':'Телефон Бета'})
        outsider=self.server.game.create_account(); self.server.game.profile(outsider,{'name':'Телефон Гамма'})
        status,_,body=self.req('/api/players?q=%D0%91%D0%95%D0%A2')
        self.assertEqual(status,200); self.assertEqual([p['id'] for p in json.loads(body)['players']],[beta])
        status,_,body=self.req('/api/messages/'+beta,{'text':'Привет'})
        self.assertEqual(status,200); self.assertEqual(json.loads(body)['messages'][0]['from_id'],alpha)
        self.assertEqual(self.req('/api/messages/'+alpha,{'text':'Самому себе'})[0],400)
        self.assertEqual(self.req('/api/profile',{'name':'Другой ник'})[0],409)
        lid=self.server.game.create_lobby(alpha,{'title':'Приглашение','mode':'individual'})['id']
        self.assertEqual(self.req('/api/invitations',{'to_id':beta,'lobby_id':lid,'role':'player'})[0],200)
        invitation=self.server.social.phone(beta)['notifications'][0]
        self.assertEqual(self.req('/api/invitations/'+invitation['id']+'/accept',{})[0],403)
        with self.server.game.transaction() as db:
            from game import token
            sid,csrf=token(),token()
            import time
            db.execute('INSERT INTO sessions VALUES (?,?,?,?)',(sid,beta,csrf,int(time.time())))
        self.cookie='bziker_session='+sid; self.csrf=csrf
        status,_,body=self.req('/api/phone'); self.assertEqual(status,200)
        self.assertEqual(json.loads(body)['unread'],2)
        self.assertEqual(self.req('/api/messages/'+alpha)[0],200)
        self.assertEqual(self.req('/api/invitations/'+invitation['id']+'/accept',{})[0],200)
        self.assertEqual(self.server.game.snapshot(beta,lid)['role'],'participant')
        cid=self.server.world.create_clan(beta,{'name':'Телефон клан','color':'#112233','flag':'!'})['id']
        for index in range(3):
            member=self.server.game.create_account();self.server.game.profile(member,{'name':f'Строитель {index}'})
            self.server.world.mutate_clan(member,cid,'apply',{})
            self.server.world.mutate_clan(beta,cid,'accept',{'account_id':member})
        from world import DISTRICT_BUILDINGS
        from world_fixtures import fixture_position
        door=DISTRICT_BUILDINGS[-1]['door']
        fixture_position(self.server.world,beta,door['x'],door['y'])
        self.assertEqual(self.req('/api/clans/'+cid+'/building',{'building_id':'base-8','exterior_style':5,'exterior_color':'#faf8f2'})[0],200)
        status,_,body=self.req('/api/world/move',{'scene':'district','x':900,'y':800})
        self.assertEqual(status,200); self.assertEqual(len(json.loads(body)['buildings']),8)
        with self.server.game.transaction() as db:
            lobby=self.server.game._load(db,lid,beta)
            lobby['members'][beta]={'role':'curator','team':None}; self.server.game._save(db,lobby)
        for path,data in [('/api/players?q=',None),('/api/phone',None),('/api/messages/'+alpha,None),
                          ('/api/messages/'+alpha,{'text':'Скрыто'}),('/api/invitations',{'to_id':alpha,'lobby_id':lid,'role':'player'}),
                          ('/api/invitations/'+invitation['id']+'/dismiss',{})]:
            status,_,body=self.req(path,data); self.assertEqual(status,403,path)
            self.assertEqual(json.loads(body)['error']['code'],'jury_restricted')
        self.cookie,self.csrf=first_cookie,first_csrf

    def test_avatar_module_allowlist(self):
        # Controlled temporary public root; sources stay forbidden.
        public=Path(self.tmp.name)/'static'
        (public/'web').mkdir(parents=True)
        (public/'web'/'avatar.js').write_text('export const avatar = {};')
        self.stop()
        self.server=make_server('127.0.0.1',0,Path(self.tmp.name)/'game.db',web_root=public)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()
        for path in ['/web/avatar.js','/avatar.js']:
            self.assertEqual(self.req(path)[0],200)

    def test_telegram_cookie_csrf_rotation_and_validated_identity(self):
        import time
        from test_auth import signed
        self.stop()
        self.server=make_server('127.0.0.1',0,Path(self.tmp.name)/'telegram.db',auth_mode='telegram',
                                bot_token='123:test',public_url='https://example.com')
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()
        headers={'Host':'example.com','Origin':'https://example.com'}
        status,response_headers,payload=self.req('/api/bootstrap',headers=headers)
        self.assertEqual(status,200)
        initial=json.loads(payload)
        self.assertFalse(initial['authenticated'])
        self.assertIn('Secure',response_headers['Set-Cookie'])
        self.cookie=response_headers['Set-Cookie'].split(';')[0]
        self.csrf=initial['csrf_token']
        self.assertEqual(self.req('/api/profile',{'name':'Нельзя'},headers)[0],401)
        self.assertEqual(self.req('/api/auth/telegram',{'init_data':'bad'},headers)[0],401)
        old_cookie,old_csrf=self.cookie,self.csrf
        init=signed({'auth_date':str(int(time.time())),'user':json.dumps({'id':42})})
        status,response_headers,payload=self.req('/api/auth/telegram',{'init_data':init,'user_id':99},headers)
        self.assertEqual(status,200)
        authenticated=json.loads(payload)
        self.assertTrue(authenticated['authenticated'])
        self.assertNotEqual(authenticated['csrf_token'],old_csrf)
        self.cookie=response_headers['Set-Cookie'].split(';')[0]
        self.csrf=authenticated['csrf_token']
        self.assertNotEqual(self.cookie,old_cookie)
        self.assertEqual(self.req('/api/profile',{'name':'Telegram'},headers)[0],200)
        with self.server.game.transaction() as db:
            self.assertEqual(db.execute('SELECT telegram_id FROM accounts').fetchone()[0],'42')
        self.cookie,self.csrf=old_cookie,old_csrf
        self.assertEqual(self.req('/api/profile',{'name':'Replay'},headers)[0],401)

    def test_concurrent_last_jury_finish_awards_exactly_once(self):
        from concurrent.futures import ThreadPoolExecutor
        self.bootstrap()
        self.req('/api/profile',{'name':'Хозяин'})
        lid=json.loads(self.req('/api/lobbies',{'title':'Гонка','mode':'individual','context':{}})[2])['id']
        host_cookie,host_csrf=self.cookie,self.csrf
        invite=json.loads(self.req('/api/lobbies/'+lid)[2])['jury_code']
        self.cookie=None
        self.bootstrap()
        self.req('/api/profile',{'name':'Жюри'})
        self.req('/api/lobbies/join',{'code':invite})
        jury_cookie,jury_csrf=self.cookie,self.csrf
        self.cookie,self.csrf=host_cookie,host_csrf
        self.req('/api/lobbies/'+lid+'/start',{})
        self.req('/api/lobbies/'+lid+'/question',{'question_id':'idea_100'})
        self.req('/api/lobbies/'+lid+'/answer',{'text':'Ответ'})
        self.req('/api/lobbies/'+lid+'/review',{})
        self.cookie,self.csrf=jury_cookie,jury_csrf
        card=json.loads(self.req('/api/lobbies/'+lid)[2])['cards'][0]
        self.req('/api/lobbies/'+lid+'/grade',{'token':card['token'],'score':10})
        with ThreadPoolExecutor(max_workers=2) as pool:
            results=list(pool.map(lambda _:self.req('/api/lobbies/'+lid+'/review/finish',{})[0],range(2)))
        self.assertEqual(sorted(results),[200,400])
        self.cookie,self.csrf=host_cookie,host_csrf
        self.assertEqual(json.loads(self.req('/api/lobbies/'+lid)[2])['players'][0]['score'],100)


class BotTests(unittest.TestCase):
    def test_invite_url_and_start_filter(self):
        try: from bot import invite_url,start_message
        except ImportError: self.fail('Optional bot launcher must be implemented')
        self.assertEqual(invite_url('https://example.com','abc_123'),'https://example.com?invite=abc_123')
        self.assertEqual(invite_url('https://example.com',''), 'https://example.com')
        update={'message':{'chat':{'id':12},'text':'/start abc_123'}}
        self.assertEqual(start_message(update),(12,'abc_123'))
        self.assertEqual(start_message({'message':{'chat':{'id':12},'text':'/start@bziker_bot'}}),(12,''))
        self.assertIsNone(start_message({'message':{'chat':{'id':12},'text':'/other'}}))
        with self.assertRaises(ValueError): invite_url('http://example.com','abc')

if __name__=='__main__': unittest.main()
