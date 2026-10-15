"""Regressions reproduced by the independent v6 backend audit, on disposable DBs."""
import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path

from auth import AccountService
from game import GameError, GameService
from server import make_server
from social import SocialService
from world import WorldService
from clan_fixtures import legacy_home


class AuditPrivacyV6Tests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.game = GameService(Path(self.tmp.name) / 'privacy.db')
        self.world = WorldService(self.game, clock=lambda: 1000)
        self.social = SocialService(self.game, self.world)
        self.viewer, self.peer, self.host = [self.game.create_account() for _ in range(3)]
        for uid, name in zip((self.viewer, self.peer, self.host), ('Viewer', 'Hidden juror', 'Duty host')):
            self.game.profile(uid, {'name': name})

    def jury_duty(self):
        lid = self.game.create_lobby(self.host, {'title': 'Duty', 'mode': 'individual'})['id']
        self.game.join(self.peer, self.game.snapshot(self.host, lid)['jury_code'])
        return lid

    def finish_duty(self, lid):
        self.game.mutate(self.host, lid, 'start', {})
        self.game.mutate(self.host, lid, 'finish', {})

    def test_phone_hides_restricted_conversation_without_deleting_or_marking_it_seen(self):
        self.social.message(self.peer, self.viewer, {'text': 'An unread conversation'})
        before = self.social.phone(self.viewer)
        self.assertEqual(before['unread'], 1)
        lid = self.jury_duty()
        hidden = self.social.phone(self.viewer)
        self.assertEqual(hidden['conversations'], [])
        self.assertEqual(hidden['unread'], 0)
        self.assertNotIn(self.peer, json.dumps(hidden))
        self.finish_duty(lid)
        self.assertEqual(self.social.phone(self.viewer), before)
        self.assertEqual(self.social.conversation(self.viewer, self.peer)['messages'][0]['text'],
                         'An unread conversation')

    def test_phone_hides_restricted_invitation_sender_then_restores_pending_invitation(self):
        waiting = self.game.create_lobby(self.peer, {'title': 'Earlier invite', 'mode': 'individual'})['id']
        self.social.invite(self.peer, {'to_id': self.viewer, 'lobby_id': waiting, 'role': 'player'})
        before = self.social.phone(self.viewer)
        lid = self.jury_duty()
        hidden = self.social.phone(self.viewer)
        self.assertEqual(hidden['notifications'], [])
        self.assertEqual(hidden['unread'], 0)
        self.assertNotIn(self.peer, json.dumps(hidden))
        self.finish_duty(lid)
        self.assertEqual(self.social.phone(self.viewer), before)

    def test_active_juror_cannot_read_identified_roster_from_an_earlier_participant_lobby(self):
        earlier = self.game.create_lobby(self.viewer, {'title': 'Earlier roster', 'mode': 'individual'})['id']
        self.game.join(self.peer, self.game.snapshot(self.viewer, earlier)['player_code'])
        before = self.game.snapshot(self.peer, earlier)
        lid = self.jury_duty()
        self.assertEqual(self.game.snapshot(self.peer, lid)['role'], 'curator')
        with self.assertRaises(GameError) as raised:
            self.game.snapshot(self.peer, earlier)
        self.assertEqual(raised.exception.code, 'jury_restricted')
        self.finish_duty(lid)
        self.assertEqual(self.game.snapshot(self.peer, earlier), before)


class AuditHttpV6Tests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.server = make_server('127.0.0.1', 0, Path(self.tmp.name) / 'http.db')
        self.server.world.clock = lambda: 1000
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop)
        self.cookie = self.csrf = None
        self.request('/api/bootstrap')

    def stop(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)

    def request(self, path, data=None, extra_headers=None):
        headers = {'Content-Type': 'application/json'}
        if self.cookie:
            headers['Cookie'] = self.cookie
        if self.csrf:
            headers['X-CSRF-Token'] = self.csrf
        headers.update(extra_headers or {})
        conn = http.client.HTTPConnection(*self.server.server_address, timeout=5)
        try:
            conn.request('GET' if data is None else 'POST', path,
                         None if data is None else json.dumps(data), headers)
            response = conn.getresponse()
            result = json.loads(response.read())
            if response.getheader('Set-Cookie'):
                self.cookie = response.getheader('Set-Cookie').split(';')[0]
            if 'csrf_token' in result:
                self.csrf = result['csrf_token']
            return response.status, result
        finally:
            conn.close()

    def test_full_login_keeps_previous_session_and_does_not_allocate_unusable_session(self):
        uid = self.request('/api/profile', {'name': 'Current session'})[1]['id']
        target = self.server.game.create_account()
        AccountService(self.server.game).register(target, {'login': 'capacity-target', 'password': 'secret-password'})
        others = [self.server.game.create_account() for _ in range(99)]
        with self.server.game.transaction() as db:
            for account in others:
                db.execute('INSERT INTO active_accounts VALUES (?,?)', (account, 1000))
            session_count = db.execute('SELECT COUNT(*) FROM sessions').fetchone()[0]
        before = (self.cookie, self.csrf)
        status, result = self.request('/api/account/login', {'login': 'capacity-target', 'password': 'secret-password'})
        self.assertEqual((status, result['error']['code']), (409, 'active_full'))
        self.assertEqual((self.cookie, self.csrf), before)
        status, result = self.request('/api/bootstrap')
        self.assertEqual(status, 200)
        self.assertEqual(result['profile']['id'], uid)
        with self.server.game.transaction() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM sessions').fetchone()[0], session_count)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM active_accounts').fetchone()[0], 100)

    def test_invalid_furniture_type_is_a_client_error_and_does_not_change_base(self):
        uid = self.request('/api/profile', {'name': 'Furniture leader'})[1]['id']
        cid = self.request('/api/clans', {'name': 'Furniture clan', 'color': '#112233', 'flag': 'F'})[1]['id']
        legacy_home(self.server.game, cid)
        before = self.request('/api/clans/' + cid)[1]['base']
        for kind in ([], {}):
            with self.subTest(kind=kind):
                status, result = self.request('/api/clans/' + cid + '/base',
                    {'items': [{'id': 'bad', 'type': kind, 'x': 1, 'y': 1, 'rotation': 0}]})
                self.assertEqual(status, 400)
                self.assertEqual(result['error']['code'], 'invalid_action')
                self.assertEqual(self.request('/api/clans/' + cid)[1]['base'], before)

    def test_oversized_numeric_content_length_is_rejected_without_server_error(self):
        status, result = self.request('/api/profile', {'name': 'Large header'},
                                      {'Content-Length': '9' * 5000})
        self.assertEqual(status, 413)
        self.assertEqual(result['error']['code'], 'body_too_large')


if __name__ == '__main__':
    unittest.main()
