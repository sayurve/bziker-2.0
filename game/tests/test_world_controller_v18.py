import json
import threading
import unittest

from game import GameError
import test_server as http_fixtures
from world import WORLD_MAP


class WorldControllerTests(unittest.TestCase):
    # Reuse the genuine HTTP fixture without inheriting its unrelated tests.
    setUp = http_fixtures.ServerTests.setUp
    stop = http_fixtures.ServerTests.stop
    req = http_fixtures.ServerTests.req
    bootstrap = http_fixtures.ServerTests.bootstrap

    def player(self, name='ControllerPlayer'):
        self.bootstrap()
        status, _, body = self.req('/api/profile', {'name': name, 'avatar': {}})
        self.assertEqual(status, 200)
        return json.loads(body)['id']

    def claim(self):
        status, _, body = self.req('/api/world/controller', {})
        self.assertEqual(status, 200)
        claimed = json.loads(body)
        self.assertIsInstance(claimed['controller_token'], str)
        self.assertGreaterEqual(len(claimed['controller_token']), 24)
        return claimed['controller_token']

    def test_legacy_client_remains_usable_until_the_first_explicit_claim(self):
        uid = self.player()
        destination = WORLD_MAP['landmarks']['park']
        status, _, body = self.req('/api/world/move', {'scene': 'city', **destination, 'teleport': True})
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)['position'], destination)
        status, _, body = self.req('/api/world/activity', {'action': 'phone', 'open': True})
        self.assertEqual(status, 200)
        self.assertTrue(json.loads(body)['phone_open'])
        self.assertEqual(self.server.game.bootstrap(uid)['profile']['name'], 'ControllerPlayer')

    def test_new_controller_fences_old_and_missing_tokens_without_phone_warp_or_progress_loss(self):
        uid = self.player()
        first = self.claim()
        before = self.server.economy.snapshot(uid)
        latest = self.claim()
        self.assertNotEqual(first, latest)
        destination = WORLD_MAP['landmarks']['park']
        active = {'X-World-Controller': latest}
        status, _, body = self.req('/api/world/move', {'scene': 'city', **destination, 'teleport': True}, active)
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)['position'], destination)
        clothes = next(b['door'] for b in WORLD_MAP['buildings'] if b['id'] == 'shop-clothes')
        for headers in ({}, {'X-World-Controller': first}, {'X-World-Controller': 'wrong-token'}):
            for path, payload in (
                ('/api/world/move', {'scene': 'city', 'x': clothes['x'], 'y': clothes['y'] + 24}),
                ('/api/world/activity', {'action': 'phone', 'open': True}),
                ('/api/world/activity', {'action': 'phone', 'open': False}),
            ):
                status, _, body = self.req(path, payload, headers)
                self.assertEqual(status, 409, (path, body))
                self.assertEqual(json.loads(body)['error']['code'], 'world_controller_lost')
        for opened in (True, False):
            status, _, body = self.req('/api/world/activity', {'action': 'phone', 'open': opened}, active)
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(body)['position'], destination)
            self.assertIs(json.loads(body)['phone_open'], opened)
        with self.server.game.transaction() as db:
            for table in ('presence', 'world_positions'):
                row = db.execute(f'SELECT x,y FROM {table} WHERE account_id=?', (uid,)).fetchone()
                self.assertEqual((row['x'], row['y']), (destination['x'], destination['y']))
        after = self.server.economy.snapshot(uid)
        for key in ('balance', 'inventory'):
            self.assertEqual(after[key], before[key])

    def test_claim_keeps_csrf_authentication_and_requires_a_real_profile(self):
        self.bootstrap()
        self.assertEqual(self.req('/api/world/controller', {}, {'X-CSRF-Token': 'wrong'})[0], 403)
        self.assertEqual(self.req('/api/world/controller', {})[0], 400)
        self.assertEqual(self.req('/api/profile', {'name': 'ProtectedController', 'avatar': {}})[0], 200)
        self.claim()

    def test_tokens_are_private_and_account_scoped(self):
        uid = self.player()
        first_cookie, first_csrf = self.cookie, self.csrf
        first = self.claim()
        self.cookie = self.csrf = None
        self.player('OtherController')
        other = self.claim()
        for path in ('/api/bootstrap', '/api/world', '/api/phone', '/api/economy'):
            status, _, body = self.req(path)
            self.assertEqual(status, 200)
            self.assertNotIn(first.encode(), body)
            self.assertNotIn(other.encode(), body)
            self.assertNotIn(b'controller_token', body)
        self.cookie, self.csrf = first_cookie, first_csrf
        status, _, _ = self.req('/api/world/activity', {'action': 'phone', 'open': True}, {'X-World-Controller': other})
        self.assertEqual(status, 409)
        self.assertEqual(self.req('/api/world/activity', {'action': 'phone', 'open': True}, {'X-World-Controller': first})[0], 200)
        self.assertEqual(self.server.game.bootstrap(uid)['profile']['name'], 'ControllerPlayer')

    def test_old_controller_cannot_bypass_world_fence_through_sky_cards_or_item_pose(self):
        self.player()
        old = self.claim()
        active = self.claim()
        for path, payload in (
            ('/api/world/move', {'scene': 'arena', 'lobby_id': 'stale', 'x': 600, 'y': 510}),
            ('/api/cards', {'kind': 'durak', 'source': 'deck'}),
            ('/api/cards/stale/leave', {}),
            ('/api/lobbies/stale/start', {}),
            ('/api/lobbies/stale/finish', {}),
            ('/api/inventory/use', {'item_id': 'cigarette'}),
            ('/api/fishing/start', {'spot_id': 'fish-west'}),
        ):
            status, _, body = self.req(path, payload, {'X-World-Controller': old})
            self.assertEqual(status, 409, (path, body))
            self.assertEqual(json.loads(body)['error']['code'], 'world_controller_lost')
        self.assertEqual(self.req('/api/world/activity', {'action': 'phone', 'open': False}, {'X-World-Controller': active})[0], 200)

    def test_claim_and_an_inflight_authorized_write_share_one_atomic_fence(self):
        uid = self.player()
        first = self.claim()
        started, finished = threading.Event(), threading.Event()
        result = []
        def claim_next():
            started.set()
            result.append(self.server.world.claim_controller(uid))
            finished.set()
        with self.server.world.controller_write(uid, first):
            worker = threading.Thread(target=claim_next)
            worker.start()
            self.assertTrue(started.wait(1))
            self.assertFalse(finished.wait(.05), 'A new generation cannot pass an older authorized write still in progress')
        worker.join(2)
        self.assertTrue(finished.is_set())
        with self.assertRaises(GameError) as error:
            with self.server.world.controller_write(uid, first):
                self.fail('An old generation must not mutate after the newer claim returns')
        self.assertEqual(error.exception.code, 'world_controller_lost')
        with self.server.world.controller_write(uid, result[0]['controller_token']):
            pass
