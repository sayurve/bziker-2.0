import http.client
import json
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from game import GameError, GameService
from server import STATIC, make_server
from world import CITY_SPAWN, PRESENCE_TTL, WorldService, WORLD_MAP
from world_fixtures import fixture_position


MAP = Path(__file__).resolve().parents[1] / 'web' / 'interiors-map.json'
ROOM_IDS = {'railway', 'clans', 'arena', 'profile', 'results', 'messages', 'terrace',
            'shop-food', 'shop-clothes', 'shop-furniture', 'casino'}


class InteriorsV4Tests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.g = GameService(Path(self.tmp.name) / 'interiors.db')
        self.now = 1000
        self.w = WorldService(self.g, clock=lambda: self.now)
        self.a, self.b, self.c = [self.g.create_account() for _ in range(3)]
        for uid, name in zip((self.a, self.b, self.c), ('InteriorAlpha', 'InteriorBeta', 'InteriorGamma')):
            self.g.profile(uid, {'name': name})
        self.assertTrue(callable(getattr(self.w, 'enter', None)), 'Public physical interiors must be implemented')
        self.rooms = {room['id']: room for room in json.loads(MAP.read_text())['rooms']}

    def denied(self, fn, *args, code=None):
        with self.assertRaises(GameError) as raised:
            fn(*args)
        if code:
            self.assertEqual(raised.exception.code, code)

    def enter(self, uid, room_id='railway'):
        self.approach(uid,room_id)
        return self.w.enter(uid, {'building_id': room_id})

    def approach(self,uid,room_id):
        door = self.rooms[room_id]['door']
        # Enter-room tests start at an advertised safe travel destination. A
        # short physical approach still validates the actual door geometry.
        self.w.move(uid, {'scene':'city','teleport':True,'x':door['x'],'y':door['y']+24})
        self.w.move(uid, {'scene': 'city', **door})

    def move(self, uid, room_id, x, y):
        return self.w.move(uid, {'scene': 'interior', 'interior_id': room_id, 'x': x, 'y': y})

    def test_all_eleven_public_rooms_use_shared_geometry_and_clear_phone_on_entry(self):
        self.assertEqual(set(self.rooms), ROOM_IDS)
        for room_id, room in self.rooms.items():
            with self.subTest(room=room_id):
                self.approach(self.a,room_id)
                self.w.activity(self.a, {'action': 'phone', 'open': True})
                result = self.w.enter(self.a, {'building_id': room_id})
                self.assertEqual(result['scene'], 'interior')
                self.assertEqual(result['interior_id'], room_id)
                self.assertEqual(result['scene_id'], room_id)
                self.assertEqual(result['interior'], room)
                self.assertEqual(result['position'], room['spawn'])
                self.assertEqual(result['pose'], 'idle')
                self.assertIsNone(result['bench_id'])
        self.assertEqual(self.rooms['terrace']['door'],next(b['door'] for b in WORLD_MAP['buildings'] if b['id']=='terrace'))

    def test_entry_requires_current_city_and_nearby_known_door(self):
        self.w.move(self.a, {'scene':'city','teleport':True,**WORLD_MAP['landmarks']['district']})
        self.denied(self.w.enter, self.a, {'building_id': 'railway'}, code='door_distance')
        self.denied(self.w.enter, self.a, {'building_id': 'missing'}, code='not_found')
        self.enter(self.a)
        self.denied(self.w.enter, self.a, {'building_id': 'casino'}, code='forbidden')
        self.denied(self.move, self.b, 'railway', 600, 760, code='forbidden')

    def test_movement_is_same_room_bounded_and_cannot_pass_counter(self):
        self.enter(self.a)
        point=self.rooms['railway']['spawn']
        self.assertEqual(self.move(self.a, 'railway', **point)['position'], point)
        room=self.rooms['railway'];bounds=room['bounds'];solid=room['solids'][0]
        for x,y in ((bounds['left']-1,point['y']),(bounds['right']+1,point['y']),(point['x'],bounds['top']-1),(point['x'],bounds['bottom']+1),(solid['x']+solid['width']/2,solid['y']+solid['height']/2)):
            with self.subTest(position=(x, y)):
                self.denied(self.move, self.a, 'railway', x, y)
        self.denied(self.move, self.a, 'casino', 600, 760, code='forbidden')
        self.denied(self.move, self.a, 'missing', 600, 760, code='not_found')
        self.assertEqual(self.w.snapshot(self.a)['interior_id'], 'railway')

    def test_physical_exit_uses_current_room_door_and_releases_pose(self):
        room = self.rooms['casino']
        self.enter(self.a, 'casino')
        fixture_position(self.w,self.a,room['spawn']['x'],room['exit']['y']-190,'interior','casino')
        self.denied(self.w.exit, self.a, {}, code='door_distance')
        self.move(self.a, 'casino', **room['exit'])
        self.w.activity(self.a, {'action': 'phone', 'open': True})
        result = self.w.exit(self.a, {'building_id': 'railway', 'x': 50, 'y': 50})
        self.assertEqual(result['scene'], 'city')
        self.assertEqual(result['position'], {'x': room['door']['x'], 'y': room['door']['y'] + 24})
        self.assertEqual(result['pose'], 'idle')
        self.assertIsNone(result['interior'])
        self.denied(self.w.exit, self.a, {}, code='forbidden')

    def test_live_players_are_visible_only_in_their_current_public_room(self):
        self.enter(self.a, 'messages')
        self.enter(self.b, 'messages')
        self.enter(self.c, 'railway')
        self.assertEqual({p['id'] for p in self.w.snapshot(self.a)['players']}, {self.a, self.b})
        self.assertEqual({p['id'] for p in self.w.snapshot(self.c)['players']}, {self.c})

    def test_peer_room_identity_matches_client_filter_and_excludes_other_rooms(self):
        self.enter(self.a, 'messages')
        self.enter(self.b, 'messages')
        self.enter(self.c, 'casino')
        snapshot = self.w.snapshot(self.a)
        peers = [player for player in snapshot['players'] if player['id'] != self.a]
        self.assertEqual([player['id'] for player in peers], [self.b])
        peer = peers[0]
        self.assertEqual(peer.get('scene_id'), 'messages')
        self.assertEqual(peer.get('interior_id'), 'messages')
        rendered = [player['id'] for player in peers if player['scene'] == snapshot['scene']
                    and (player.get('interior_id') or player.get('scene_id')) == snapshot['interior_id']]
        self.assertEqual(rendered, [self.b])

    def test_expired_interior_position_restores_after_cleanup_and_restart(self):
        self.enter(self.a, 'profile')
        point=self.rooms['profile']['spawn']
        self.move(self.a, 'profile', **point)
        self.w.activity(self.a, {'action': 'phone', 'open': True})
        self.now += PRESENCE_TTL + 1
        self.w.snapshot(self.b)
        self.g = GameService(self.g.db_path)
        self.w = WorldService(self.g, clock=lambda: self.now)
        restored = self.w.snapshot(self.a)
        self.assertEqual(restored['interior_id'], 'profile')
        self.assertEqual(restored['position'], point)
        self.assertEqual(restored['pose'], 'idle')
        self.assertIsNone(restored['bench_id'])

    def test_existing_interior_presence_migrates_without_resetting_legacy_city(self):
        point=self.rooms['terrace']['spawn']
        with self.g.transaction() as db:
            db.execute('DELETE FROM world_positions WHERE account_id IN (?,?)', (self.a, self.b))
            db.execute('INSERT OR REPLACE INTO presence (account_id,x,y,scene,scene_id,updated) VALUES (?,?,?,?,?,?)',
                       (self.a, point['x'], point['y'], 'interior', 'terrace', self.now))
            db.execute('INSERT OR REPLACE INTO presence (account_id,x,y,scene,scene_id,updated) VALUES (?,?,?,?,?,?)',
                       (self.b, 730, 900, 'city', None, self.now))
        again = WorldService(GameService(self.g.db_path), clock=lambda: self.now + PRESENCE_TTL + 1)
        self.assertEqual(again.snapshot(self.a)['position'], point)
        self.assertEqual(again.snapshot(self.a)['interior_id'], 'terrace')
        self.assertEqual(again.snapshot(self.b)['position'], {'x': 730, 'y': 900})
        self.assertEqual(again.snapshot(self.c)['position'], {'x': CITY_SPAWN[0], 'y': CITY_SPAWN[1]})

    def test_restart_migration_keeps_existing_retained_room_and_scene_id(self):
        point=self.rooms['shop-clothes']['spawn']
        with self.g.transaction() as db:
            db.execute('INSERT OR REPLACE INTO world_positions (account_id,x,y,scene,scene_id) VALUES (?,?,?,?,?)',
                       (self.a, point['x'], point['y'], 'interior', 'shop-clothes'))
            db.execute('DELETE FROM presence WHERE account_id=?', (self.a,))
        restarted = GameService(self.g.db_path)
        with restarted.transaction() as db:
            self.assertEqual(dict(db.execute('SELECT * FROM world_positions WHERE account_id=?', (self.a,)).fetchone()),
                             {'account_id': self.a, **point, 'scene': 'interior', 'scene_id': 'shop-clothes'})
        result = WorldService(restarted, clock=lambda: self.now).snapshot(self.a)
        self.assertEqual(result['interior_id'], 'shop-clothes')
        self.assertEqual(result['position'], point)

    def test_room_consumables_keep_inventory_and_smoking_zone_rules(self):
        from economy import EconomyService, change_balance, inventory_quantity
        economy = EconomyService(self.g, self.w)
        with self.g.transaction() as db:
            change_balance(db, self.a, 40, 'test:food')
        economy.buy(self.a, {'item_id': 'cigarette'})
        economy.buy(self.a, {'item_id': 'coffee'})
        self.enter(self.a, 'messages')
        self.w.activity(self.a, {'action': 'phone', 'open': True})
        self.denied(economy.use, self.a, {'item_id': 'cigarette'}, code='smoking_zone')
        economy.use(self.a, {'item_id': 'coffee'})
        with self.g.transaction() as db:
            self.assertEqual(inventory_quantity(db, self.a, 'cigarette'), 1)
            self.assertEqual(inventory_quantity(db, self.a, 'coffee'), 0)
        self.assertEqual(self.w.activity(self.a, {'action': 'phone', 'open': False})['pose'], 'idle')

    def test_interior_seat_claim_is_atomic_room_scoped_and_expires(self):
        room_id = 'messages'
        seat = self.rooms[room_id]['seats'][0]
        seat_id = seat['id']
        point = seat['seat']
        self.assertTrue(seat_id.startswith('interior:messages:'))
        for uid in (self.a, self.b):
            self.enter(uid, room_id)
            fixture_position(self.w,uid,**seat['approach'],scene='interior',scene_id=room_id)
        self.enter(self.c, 'railway')
        self.denied(self.w.activity, self.c, {'action': 'sit', 'bench_id': seat_id}, code='forbidden')
        def sit(uid):
            try:
                return self.w.activity(uid, {'action': 'sit', 'bench_id': seat_id})
            except GameError as error:
                return error
        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(sit, (self.a, self.b)))
        self.assertEqual(sum(isinstance(o, dict) for o in outcomes), 1)
        self.assertEqual([o.code for o in outcomes if isinstance(o, GameError)], ['bench_occupied'])
        winner = (self.a, self.b)[next(i for i, value in enumerate(outcomes) if isinstance(value, dict))]
        self.w.activity(winner, {'action': 'phone', 'open': True})
        self.assertEqual(self.w.activity(winner, {'action': 'phone', 'open': False})['pose'], 'sit')
        self.now += PRESENCE_TTL + 1
        restored = self.w.snapshot(winner)
        from world import nearest_interior_position, valid_position
        self.assertEqual(restored['position'], dict(zip(('x','y'), nearest_interior_position(self.rooms[room_id], **point))))
        self.assertTrue(valid_position('interior', **restored['position'], scene_id=room_id))
        self.assertIsNone(restored['bench_id'])
        self.assertEqual(restored['pose'], 'idle')
        loser = self.b if winner == self.a else self.a
        self.assertEqual(self.w.activity(loser, {'action': 'sit', 'bench_id': seat_id})['pose'], 'sit')

    def test_public_clan_room_does_not_grant_access_to_private_base(self):
        clan = self.w.create_clan(self.a, {'name': 'PrivateInteriorClan', 'color': '#111111', 'flag': 'C'})
        self.assertEqual(self.enter(self.b, 'clans')['interior_id'], 'clans')
        self.denied(self.w.move, self.b, {'scene': 'base', 'x': 600, 'y': 600}, code='forbidden')
        self.denied(self.w.clan_snapshot, self.b, clan['id'], code='forbidden')

    def test_jury_blackout_removes_public_room_identity_and_rejects_entry(self):
        self.enter(self.a, 'results')
        self.enter(self.b, 'results')
        lobby = self.g.create_lobby(self.c, {'title': 'Jury privacy', 'mode': 'individual'})['id']
        self.g.join(self.b, self.g.snapshot(self.c, lobby)['jury_code'])
        result = self.w.snapshot(self.b)
        self.assertTrue(result['restricted'])
        self.assertEqual(result['players'], [])
        self.assertIsNone(result['interior'])
        self.assertNotIn(self.b, {p['id'] for p in self.w.snapshot(self.a)['players']})
        self.denied(self.w.enter, self.b, {'building_id': 'railway'}, code='jury_restricted')

    def test_quiz_takes_over_interior_and_cannot_be_escaped(self):
        self.enter(self.b, 'arena')
        lobby = self.g.create_lobby(self.a, {'title': 'Interior Quiz', 'mode': 'individual'})['id']
        codes = self.g.snapshot(self.a, lobby)
        self.g.join(self.b, codes['player_code'])
        self.g.join(self.c, codes['jury_code'])
        self.g.mutate(self.a, lobby, 'start', {})
        self.assertEqual(self.w.snapshot(self.b)['arena_lobby_id'], lobby)
        self.assertIsNone(self.w.snapshot(self.b)['interior'])
        self.denied(self.w.enter, self.b, {'building_id': 'railway'}, code='active_match_scene')
        self.denied(self.move, self.b, 'arena', 600, 760, code='active_match_scene')

    def test_cards_take_over_interior_and_cannot_be_escaped(self):
        from cards import CardService
        from economy import EconomyService, change_balance
        self.enter(self.a, 'casino')
        economy = EconomyService(self.g, self.w)
        with self.g.transaction() as db:
            change_balance(db, self.a, 30, 'test:cards')
        cards = CardService(self.g, economy, clock=lambda: self.now, shuffle=lambda deck: None)
        table = cards.create(self.a, {'game': 'blackjack', 'title': 'Interior Cards', 'stake': 5, 'source': 'casino'})
        cards.mutate(self.a, table['id'], 'start', {})
        self.assertEqual(self.w.snapshot(self.a)['card_table_id'], table['id'])
        self.assertIsNone(self.w.snapshot(self.a)['interior'])
        self.denied(self.w.enter, self.a, {'building_id': 'railway'}, code='active_match_scene')


class InteriorsV4HttpTests(unittest.TestCase):
    def test_entry_exit_routes_require_session_csrf_and_static_assets_are_explicit(self):
        with tempfile.TemporaryDirectory() as temp:
            server = make_server('127.0.0.1', 0, Path(temp) / 'interiors-http.db')
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            cookie = csrf = None
            try:
                def request(path, body=None, token=True):
                    connection = http.client.HTTPConnection(*server.server_address)
                    headers = {'Content-Type': 'application/json'}
                    if cookie: headers['Cookie'] = cookie
                    if csrf and token: headers['X-CSRF-Token'] = csrf
                    connection.request('GET' if body is None else 'POST', path,
                                       None if body is None else json.dumps(body), headers)
                    response = connection.getresponse()
                    raw = response.read()
                    result = response.status, dict(response.getheaders()), json.loads(raw)
                    connection.close()
                    return result
                self.assertEqual(request('/api/world/enter', {'building_id': 'railway'})[0], 401)
                _, headers, bootstrap = request('/api/bootstrap')
                cookie = headers['Set-Cookie'].split(';')[0]
                csrf = bootstrap['csrf_token']
                request('/api/profile', {'name': 'InteriorHTTP'})
                self.assertEqual(request('/api/world/enter', {'building_id': 'railway'}, token=False)[0], 403)
                door=next(b['door'] for b in WORLD_MAP['buildings'] if b['id']=='railway')
                self.assertEqual(request('/api/world/move', {'scene':'city','teleport':True,'x':door['x'],'y':door['y']+24})[0],200)
                self.assertEqual(request('/api/world/move', {'scene':'city',**door})[0],200)
                entered = request('/api/world/enter', {'building_id': 'railway'})
                self.assertEqual(entered[0], 200)
                self.assertEqual(entered[2]['interior_id'], 'railway')
                self.assertEqual(request('/api/world/exit', {}, token=False)[0], 403)
                exited = request('/api/world/exit', {})
                self.assertEqual(exited[0], 200)
                door=next(b['door'] for b in WORLD_MAP['buildings'] if b['id']=='railway')
                self.assertEqual(exited[2]['position'],{'x':door['x'],'y':door['y']+24})
                self.assertEqual({r['id'] for r in request('/interiors-map.json')[2]['rooms']}, ROOM_IDS)
                self.assertEqual(STATIC['/interiors.js'], 'web/interiors.js')
                self.assertEqual(STATIC['/web/interiors.js'], 'web/interiors.js')
            finally:
                server.shutdown()
                server.server_close()
                thread.join()


if __name__ == '__main__':
    unittest.main()
