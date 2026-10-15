"""Бзикер HTTP transport. TLS terminates at a trusted HTTPS reverse proxy in public mode."""
import argparse
import hmac
import ipaddress
import json
import mimetypes
import os
import re
import socket
import time
from contextlib import ExitStack
from http.cookies import SimpleCookie, CookieError
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit,unquote,parse_qs
from auth import validate_init_data, unique_object, AccountService
from game import GameService, GameError, require, token
from world import WorldService, MAX_ONLINE
from social import SocialService
from economy import EconomyService
from cards import CardService

ROOT=Path(__file__).resolve().parent
COOKIE='bziker_session'
SESSION_AGE=86400
MAX_BODY=32768


def controller_write_route(path):
    """HTTP writers which can change a player's position or visible pose."""
    return (path in ('/api/world/move','/api/world/enter','/api/world/exit','/api/world/activity',
                     '/api/world/action','/api/inventory/use','/api/fishing/start','/api/cards') or
            re.fullmatch(r'/api/fishing/[A-Za-z0-9_-]+/catch',path) is not None or
            re.fullmatch(r'/api/cards/[A-Za-z0-9_-]+/(invite|join|start|act|leave)',path) is not None or
            re.fullmatch(r'/api/lobbies/[A-Za-z0-9_-]+/(teams|start|question|buzz|answer|review|grade|review/finish|finish)',path) is not None or
            re.fullmatch(r'/api/clans/[A-Za-z0-9_-]+/leave',path) is not None)


STATIC={'/':'web/index.html','/index.html':'web/index.html', '/web/index.html':'web/index.html',
        '/app.js':'web/app.js','/styles.css':'web/styles.css',
        '/web/app.js':'web/app.js','/web/styles.css':'web/styles.css',
        '/web/avatar.js':'web/avatar.js','/avatar.js':'web/avatar.js',
        '/web/actor-sprite.js':'web/actor-sprite.js','/actor-sprite.js':'web/actor-sprite.js',
        '/web/actor-atlas-data.js':'web/actor-atlas-data.js','/actor-atlas-data.js':'web/actor-atlas-data.js',
        '/web/actor-custom-data.js':'web/actor-custom-data.js','/actor-custom-data.js':'web/actor-custom-data.js',
        '/web/actor-hair-data.js':'web/actor-hair-data.js','/actor-hair-data.js':'web/actor-hair-data.js',
        '/web/world.js':'web/world.js','/world.js':'web/world.js',
        '/web/city-collision.js':'web/city-collision.js','/city-collision.js':'web/city-collision.js',
        '/web/city-collisions.json':'web/city-collisions.json','/city-collisions.json':'web/city-collisions.json',
        '/web/world-camera.js':'web/world-camera.js','/world-camera.js':'web/world-camera.js',
        '/web/city-architecture.js':'web/city-architecture.js','/city-architecture.js':'web/city-architecture.js',
        '/web/pixel-mascot.js':'web/pixel-mascot.js','/pixel-mascot.js':'web/pixel-mascot.js',
        '/web/inventory-ui.js':'web/inventory-ui.js','/inventory-ui.js':'web/inventory-ui.js',
        '/web/gameplay-ui.js':'web/gameplay-ui.js','/gameplay-ui.js':'web/gameplay-ui.js',
        '/web/water.js':'web/water.js','/water.js':'web/water.js',
        '/web/waterfront.js':'web/waterfront.js','/waterfront.js':'web/waterfront.js',
        '/web/color-picker.js':'web/color-picker.js','/color-picker.js':'web/color-picker.js',
        '/web/world.css':'web/world.css','/world.css':'web/world.css',
        '/web/city-features.js':'web/city-features.js','/city-features.js':'web/city-features.js',
        '/web/account-ui.js':'web/account-ui.js','/account-ui.js':'web/account-ui.js',
        '/web/audio.js':'web/audio.js','/audio.js':'web/audio.js',
        '/web/action-effects.js':'web/action-effects.js','/action-effects.js':'web/action-effects.js',
        '/web/construction-ui.js':'web/construction-ui.js','/construction-ui.js':'web/construction-ui.js',
        '/web/construction.css':'web/construction.css','/construction.css':'web/construction.css',
        '/web/house-models.js':'web/house-models.js','/house-models.js':'web/house-models.js',
        '/web/house-catalog.json':'web/house-catalog.json','/house-catalog.json':'web/house-catalog.json',
        '/web/profile-builder.js':'web/profile-builder.js','/profile-builder.js':'web/profile-builder.js',
        '/web/card-games.js':'web/card-games.js','/card-games.js':'web/card-games.js',
        '/web/casino-room.js':'web/casino-room.js','/casino-room.js':'web/casino-room.js',
        '/web/city-ground.js':'web/city-ground.js','/city-ground.js':'web/city-ground.js',
        '/web/road-topology.js':'web/road-topology.js','/road-topology.js':'web/road-topology.js',
        '/web/walk-cycle.js':'web/walk-cycle.js','/walk-cycle.js':'web/walk-cycle.js',
        '/web/street-details.js':'web/street-details.js','/street-details.js':'web/street-details.js',
        '/web/ambient-animals.js':'web/ambient-animals.js','/ambient-animals.js':'web/ambient-animals.js',
        '/web/animals-map.json':'web/animals-map.json','/animals-map.json':'web/animals-map.json',
        '/web/interiors.js':'web/interiors.js','/interiors.js':'web/interiors.js',
        '/web/interior-props.js':'web/interior-props.js','/interior-props.js':'web/interior-props.js',
        '/web/furniture-views.js':'web/furniture-views.js','/furniture-views.js':'web/furniture-views.js',
        '/web/interiors-map.json':'web/interiors-map.json','/interiors-map.json':'web/interiors-map.json',
        '/web/world-map.json':'web/world-map.json','/world-map.json':'web/world-map.json',
        '/web/furniture-map.json':'web/furniture-map.json','/furniture-map.json':'web/furniture-map.json'}

# Approved redesign modules keep the same root and /web aliases as the game.
# This remains an explicit list: unknown scripts and private data are not served.
for source_module in ('design-data.js','design-assets.js','source-city.js','city-scene.js','interaction-radii.js','source-ui.js','source-ui.css',
                      'source-actors.js','source-actors-data.js','source-interiors.js','source-furniture-grid.js','furniture-preview.js','source-water.js','source-house-materials.js','supplemental-environment.js','lake-walkways.js'):
    STATIC['/'+source_module]='web/'+source_module
    STATIC['/web/'+source_module]='web/'+source_module

for phaser_module in ('phaser-world-renderer.js','phaser-scene-paint.js','locomotion.js'):
    STATIC['/'+phaser_module]='web/'+phaser_module
    STATIC['/web/'+phaser_module]='web/'+phaser_module
STATIC['/web/vendor/phaser.min.js']='web/vendor/phaser.min.js'
STATIC['/pet-follow.js']='web/pet-follow.js'
STATIC['/web/pet-follow.js']='web/pet-follow.js'
STATIC['/canonical-actors-data.js']='web/canonical-actors-data.js'
STATIC['/web/canonical-actors-data.js']='web/canonical-actors-data.js'
STATIC['/locomotion-actors-data.js']='web/locomotion-actors-data.js'
STATIC['/web/locomotion-actors-data.js']='web/locomotion-actors-data.js'
STATIC['/interaction-actors-data.js']='web/interaction-actors-data.js'
STATIC['/web/interaction-actors-data.js']='web/interaction-actors-data.js'

# Account-free compatibility laboratory and explicit character module aliases.
STATIC['/character-lab']='web/character-lab.html'
for lab_file in ('character-lab.html','character-lab.js','character-lab.css'):
    STATIC['/'+lab_file]='web/'+lab_file
    STATIC['/web/'+lab_file]='web/'+lab_file
for character_module in ('definition.js','controller.js','phaser-view.js','clock.js','asset-loader.js'):
    character_target='web/character-system/'+character_module
    for character_alias in ('/'+character_module,'/character-system/'+character_module,'/'+character_target):
        STATIC[character_alias]=character_target


class BzikerHTTPServer(ThreadingHTTPServer):
    # Match the city admission limit rather than the stdlib's five-connection
    # listen backlog, which drops bursts even before account admission runs.
    request_queue_size=MAX_ONLINE


def make_server(host,port,db_path,auth_mode='demo',bot_token='',public_url='',web_root=None):
    try: loopback=ipaddress.ip_address(host).is_loopback
    except ValueError: loopback=host=='localhost'
    if auth_mode not in ('demo','telegram'): raise ValueError('AUTH_MODE must be demo or telegram')
    if auth_mode=='demo' and not loopback: raise ValueError('Demo accounts require a loopback binding')
    if auth_mode=='telegram':
        try: public=urlsplit(public_url)
        except ValueError: raise ValueError('PUBLIC_URL must use HTTPS') from None
        if (not bot_token or public.scheme!='https' or not public.hostname or public.username or public.password
                or public.query or public.fragment or public.path not in ('','/')
                or any(c.isspace() for c in public_url)):
            raise ValueError('Telegram mode requires BOT_TOKEN and HTTPS PUBLIC_URL at site root')
        expected_origin=f'https://{public.netloc.lower()}'
    else: expected_origin=None
    service=GameService(db_path)
    world=WorldService(service)
    social=SocialService(service,world)
    economy=EconomyService(service,world)
    cards=CardService(service,economy,clock=world.clock)
    accounts=AccountService(service)
    static_root=Path(web_root or ROOT).resolve()

    class Handler(BaseHTTPRequestHandler):
        server_version='Bziker'
        sys_version=''

        def setup(self):
            super().setup()
            self.connection.settimeout(5)

        def log_message(self,*args):
            # Requests can contain sensitive query strings; never log raw request data.
            pass

        def _respond(self,status,payload,content_type='application/json; charset=utf-8',cookie=None):
            content=json.dumps(payload,ensure_ascii=False,allow_nan=False).encode() if isinstance(payload,(dict,list)) else payload
            self.send_response(status)
            self.send_header('Content-Type',content_type)
            self.send_header('Content-Length',str(len(content)))
            self.send_header('Cache-Control','no-store')
            self.send_header('X-Content-Type-Options','nosniff')
            self.send_header('Referrer-Policy','no-referrer')
            self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self' https://telegram.org; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors https://web.telegram.org https://*.telegram.org")
            if cookie:
                self.send_header('Set-Cookie',f'{COOKIE}={cookie}; Path=/; HttpOnly; SameSite=Strict; Max-Age={SESSION_AGE}'+('; Secure' if auth_mode=='telegram' else ''))
            self.end_headers()
            self.wfile.write(content)

        def _origin(self):
            hosts=self.headers.get_all('Host',[])
            require(len(hosts)==1,'Неверный источник запроса','forbidden',403)
            received=hosts[0].lower()
            if expected_origin:
                require(received==urlsplit(expected_origin).netloc,'Неверный источник запроса','forbidden',403)
                origin=expected_origin
            else:
                port=self.server.server_address[1]
                allowed={f'127.0.0.1:{port}',f'localhost:{port}'}
                require(received in allowed,'Неверный источник запроса','forbidden',403)
                origin='http://'+received
            if self.headers.get('Origin'):
                require(self.headers['Origin']==origin,'Неверный источник запроса','forbidden',403)
            require(self.headers.get('Sec-Fetch-Site','same-origin') in ('same-origin','none'),'Неверный источник запроса','forbidden',403)

        def _session(self):
            try:
                cookies=SimpleCookie()
                cookies.load(self.headers.get('Cookie',''))
                sid=cookies[COOKIE].value if COOKIE in cookies else ''
            except CookieError: sid=''
            if not sid or len(sid)>100: return None
            with service.transaction() as db:
                row=db.execute('SELECT * FROM sessions WHERE id=? AND created>=?',(sid,int(time.time())-SESSION_AGE)).fetchone()
                return dict(row) if row else None

        def _new_session(self,account_id,csrf=None,old=None):
            session={'id':token(),'csrf':csrf or token(),'account_id':account_id,'created':int(time.time())}
            with service.transaction() as db:
                # Admission and rotation share a transaction: a full city must
                # not invalidate the browser's still usable previous session.
                if account_id: world._admit(db,account_id)
                db.execute('DELETE FROM sessions WHERE created<?',(int(time.time())-SESSION_AGE,))
                if old: db.execute('DELETE FROM sessions WHERE id=?',(old,))
                db.execute('INSERT INTO sessions VALUES (?,?,?,?)',(session['id'],account_id,session['csrf'],session['created']))
            return session

        def _bootstrap(self,session):
            if session['account_id']: world.admit(session['account_id'])
            base={'auth_mode':auth_mode,'authenticated':bool(session['account_id']),'csrf_token':session['csrf'], 'profile':None,'lobbies':[],
                  'account':accounts.status(session['account_id'])}
            if session['account_id']: base.update(service.bootstrap(session['account_id']))
            return base

        def _body(self):
            require(self.headers.get('Transfer-Encoding') is None,'Передача частями не поддерживается')
            lengths=self.headers.get_all('Content-Length',[])
            require(len(lengths)==1 and lengths[0].isascii() and lengths[0].isdigit(),'Требуется длина тела запроса')
            # Bound the decimal text before conversion (Python also limits
            # integer digits); large headers are input errors, never HTTP 500.
            significant=lengths[0].lstrip('0') or '0'
            require(len(significant)<=len(str(MAX_BODY)),'Тело запроса превышает 32 КиБ','body_too_large',413)
            length=int(significant)
            require(length<=MAX_BODY,'Тело запроса превышает 32 КиБ','body_too_large',413)
            require(self.headers.get('Content-Type','').split(';')[0].strip().lower()=='application/json','Требуется JSON','unsupported_media_type',415)
            try:
                raw=self.rfile.read(length)
                require(len(raw)==length,'Неполное тело запроса')
                data=json.loads(raw.decode('utf-8'),object_pairs_hook=unique_object,parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
            except (ValueError,UnicodeError,RecursionError): raise GameError('invalid_json','Неверный JSON') from None
            require(isinstance(data,dict),'Требуется JSON объект','invalid_json')
            return data

        def do_GET(self): self._handle(False)
        def do_POST(self): self._handle(True)
        def do_PUT(self): self._respond(405,{'error':{'code':'method_not_allowed','message':'Метод недоступен'}})
        do_DELETE=do_PUT
        do_PATCH=do_PUT
        do_OPTIONS=do_PUT

        def _handle(self,mutation):
            scopes=ExitStack()
            try:
                self._origin()
                path=urlsplit(self.path).path
                if not path.startswith('/api/') and not mutation:
                    target=STATIC.get(path)
                    # Browser image/font assets are eligible; scripts and data
                    # still require an explicit STATIC route above.
                    if not target and re.fullmatch(r'/assets/(?:(?:canonical-idle-v2|locomotion-v27|interaction-v29)/)?[a-zA-Z0-9_-]+\.(png|webp|jpg|svg|ttf|woff2)',path): target=path[1:]
                    require(target is not None,'Страница не найдена','not_found',404)
                    file=(static_root/target).resolve()
                    require(file.is_relative_to(static_root) and file.is_file(),'Страница не найдена','not_found',404)
                    self._respond(200,file.read_bytes(),mimetypes.guess_type(file)[0] or 'application/octet-stream')
                    return
                session=self._session()
                if path=='/api/bootstrap' and not mutation:
                    fresh=session is None
                    if fresh: session=self._new_session(service.create_account() if auth_mode=='demo' else None)
                    self._respond(200,self._bootstrap(session),cookie=session['id'] if fresh else None)
                    return
                require(session is not None,'Сначала откройте игру','unauthorized',401)
                if mutation:
                    csrf=self.headers.get_all('X-CSRF-Token',[])
                    require(len(csrf)==1 and csrf[0].isascii() and hmac.compare_digest(csrf[0],session['csrf']),'Неверный защитный токен','csrf',403)
                    data=self._body()
                    if path in ('/api/account/register','/api/account/claim','/api/account/login','/api/account/logout'):
                        uid=session['account_id']
                        if path.endswith('/login'):
                            uid=accounts.login(data,remote_key=self.client_address[0])
                        elif path.endswith('/logout'):
                            uid=None
                        else:
                            if uid is None:
                                require(auth_mode=='demo','Нужна авторизация','unauthorized',401)
                                uid=service.create_account()
                            accounts.register(uid,data,remote_key=self.client_address[0])
                        new=self._new_session(uid,old=session['id'])
                        self._respond(200,self._bootstrap(new),cookie=new['id'])
                        return
                    if path=='/api/auth/telegram':
                        require(auth_mode=='telegram','Авторизация Telegram недоступна')
                        user=validate_init_data(data.get('init_data'),bot_token)
                        # An authenticated browser cannot silently switch accounts and roles.
                        account=service.create_account(user['id'])
                        require(not session['account_id'] or session['account_id']==account,'Сначала завершите текущую сессию','forbidden',403)
                        new=self._new_session(account,old=session['id'])
                        self._respond(200,self._bootstrap(new),cookie=new['id'])
                        return
                if not mutation and path=='/api/account/status':
                    self._respond(200,accounts.status(session['account_id']))
                    return
                require(session['account_id'] is not None,'Нужна авторизация Telegram','unauthorized',401)
                account=session['account_id']
                world.admit(account)
                if mutation and controller_write_route(path):
                    controllers=self.headers.get_all('X-World-Controller',[])
                    require(len(controllers)<=1 and (not controllers or len(controllers[0])<=100 and controllers[0].isascii()),
                            'Неверный токен управления','world_controller_lost',409)
                    scopes.enter_context(world.controller_write(account,controllers[0] if controllers else None))
                if mutation and path=='/api/world/controller': result=world.claim_controller(account)
                elif mutation and path=='/api/profile': result=service.profile(account,data)
                elif mutation and path=='/api/lobbies': result=service.create_lobby(account,data)
                elif mutation and path=='/api/lobbies/join': result=service.join(account,data.get('code'))
                elif not mutation and path=='/api/players': result=social.search(account,parse_qs(urlsplit(self.path).query).get('q',[''])[0])
                elif not mutation and path=='/api/phone': result=social.phone(account)
                elif path.startswith('/api/messages/'):
                    match=re.fullmatch(r'/api/messages/([A-Za-z0-9_-]+)',path)
                    require(match is not None,'Маршрут не найден','not_found',404)
                    result=social.message(account,match[1],data) if mutation else social.conversation(account,match[1])
                elif mutation and path=='/api/invitations': result=social.invite(account,data)
                elif path.startswith('/api/invitations/'):
                    match=re.fullmatch(r'/api/invitations/([A-Za-z0-9_-]+)/(accept|dismiss)',path)
                    require(match is not None,'Маршрут не найден','not_found',404)
                    require(mutation,'Метод недоступен','method_not_allowed',405)
                    result=social.respond(account,match[1],match[2])
                elif not mutation and path=='/api/world': result=world.snapshot(account)
                elif mutation and path=='/api/world/move': result=world.move(account,data)
                elif mutation and path=='/api/world/enter': result=world.enter(account,data)
                elif mutation and path=='/api/world/exit': result=world.exit(account,data)
                elif mutation and path=='/api/world/activity': result=world.activity(account,data)
                elif mutation and path=='/api/world/action': result=economy.action(account,data)
                elif not mutation and path=='/api/fishing': result=economy.fishing(account)
                elif mutation and path=='/api/fishing/start': result=economy.start_fishing(account,data)
                elif mutation and re.fullmatch(r'/api/fishing/[A-Za-z0-9_-]+/catch',path): result=economy.catch_fish(account,path.split('/')[3])
                elif not mutation and path=='/api/base-invitations': result=world.base_invitations(account)
                elif mutation and re.fullmatch(r'/api/clans/[A-Za-z0-9_-]+/invite',path): result=world.invite_base(account,path.split('/')[3],data)
                elif mutation and re.fullmatch(r'/api/base-invitations/[A-Za-z0-9_-]+/(accept|dismiss)',path): result=world.respond_base_invitation(account,path.split('/')[3],path.split('/')[4])
                elif not mutation and path=='/api/economy': result=economy.snapshot(account)
                elif mutation and path=='/api/shop/buy': result=economy.buy(account,data)
                elif mutation and path=='/api/inventory/use': result=economy.use(account,data)
                elif mutation and path=='/api/smoking/request': result=economy.request(account,data)
                elif path.startswith('/api/smoking/requests/'):
                    match=re.fullmatch(r'/api/smoking/requests/([A-Za-z0-9_-]+)/(give|decline)',path)
                    require(match is not None,'Маршрут не найден','not_found',404)
                    require(mutation,'Метод недоступен','method_not_allowed',405)
                    result=economy.respond(account,match[1],match[2])
                elif path.startswith('/api/quests/'):
                    match=re.fullmatch(r'/api/quests/([A-Za-z0-9_-]+)/claim',path)
                    require(match is not None,'Маршрут не найден','not_found',404)
                    require(mutation,'Метод недоступен','method_not_allowed',405)
                    result=economy.claim(account,match[1])
                elif not mutation and path=='/api/friends': result=economy.friends(account)
                elif mutation and path=='/api/friends/request': result=economy.request_friend(account,data)
                elif path.startswith('/api/friends/requests/'):
                    match=re.fullmatch(r'/api/friends/requests/([A-Za-z0-9_-]+)/(accept|dismiss)',path)
                    require(match is not None,'Маршрут не найден','not_found',404)
                    require(mutation,'Метод недоступен','method_not_allowed',405)
                    result=economy.respond_friend(account,match[1],match[2])
                elif not mutation and path=='/api/cards': result=cards.all(account)
                elif mutation and path=='/api/cards': result=cards.create(account,data)
                elif path.startswith('/api/cards/'):
                    match=re.fullmatch(r'/api/cards/([A-Za-z0-9_-]+)(?:/(invite|join|start|act|leave))?',path)
                    require(match is not None,'Маршрут не найден','not_found',404)
                    tid,action=match.groups()
                    require(mutation==bool(action),'Метод недоступен','method_not_allowed',405)
                    result=cards.mutate(account,tid,action,data) if mutation else cards.snapshot(account,tid)
                elif path.startswith('/api/card-invitations/'):
                    match=re.fullmatch(r'/api/card-invitations/([A-Za-z0-9_-]+)/(accept|dismiss)',path)
                    require(match is not None,'Маршрут не найден','not_found',404)
                    require(mutation,'Метод недоступен','method_not_allowed',405)
                    result=cards.respond_invitation(account,match[1],match[2])
                elif mutation and path=='/api/casino/slots': result=cards.slots(account,data)
                elif mutation and path=='/api/clans': result=world.create_clan(account,data)
                elif path.startswith('/api/clans/'):
                    match=re.fullmatch(r'/api/clans/([A-Za-z0-9_-]+)(?:/(apply|accept|leave|transfer|base|building))?',path)
                    require(match is not None,'Маршрут не найден','not_found',404)
                    cid,action=match.groups()
                    require(mutation==bool(action),'Метод недоступен','method_not_allowed',405)
                    result=world.mutate_clan(account,cid,action,data) if mutation else world.clan_snapshot(account,cid)
                else:
                    match=re.fullmatch(r'/api/lobbies/([A-Za-z0-9_-]+)(?:/(teams|start|question|buzz|answer|review|grade|review/finish|finish))?',path)
                    require(match is not None,'Маршрут не найден','not_found',404)
                    lid,action=match.groups()
                    require(mutation==bool(action),'Метод недоступен','method_not_allowed',405)
                    result=service.mutate(account,lid,action,data) if mutation else service.snapshot(account,lid)
                self._respond(200,result)
            except GameError as error:
                self.close_connection=True
                self._respond(error.status,{'error':{'code':error.code,'message':error.message}})
            except (socket.timeout,ConnectionError,BrokenPipeError):
                self.close_connection=True
            except Exception:
                # Do not print tokens, initData, bodies or SQL on unexpected errors.
                self.close_connection=True
                self._respond(500,{'error':{'code':'internal_error','message':'Внутренняя ошибка сервера'}})
            finally:
                scopes.close()

    server=BzikerHTTPServer((host,port),Handler)
    server.daemon_threads=True
    server.game=service
    server.world=world
    server.social=social
    server.economy=economy
    server.cards=cards
    return server


def main():
    parser=argparse.ArgumentParser(description='Бзикер')
    parser.add_argument('--host',default=os.environ.get('HOST','127.0.0.1'))
    parser.add_argument('--port',type=int,default=int(os.environ.get('PORT','8765')))
    parser.add_argument('--db',default=str(ROOT/'data'/'game.db'))
    args=parser.parse_args()
    try:
        server=make_server(args.host,args.port,args.db,auth_mode=os.environ.get('AUTH_MODE','demo'),
                           bot_token=os.environ.get('BOT_TOKEN',''),public_url=os.environ.get('PUBLIC_URL',''))
    except ValueError as error: parser.error(str(error))
    print(f'Бзикер: {args.host}:{args.port}')
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()


if __name__=='__main__': main()
