import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path
import auth
from game import GameError, GameService
from economy import change_balance
from server import make_server


class AccountV5Tests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.game = GameService(Path(self.tmp.name)/'account.db')
        self.uid = self.game.create_account()
        self.game.profile(self.uid, {'name':'PersistentPerson'})
        self.assertTrue(callable(getattr(auth, 'AccountService', None)), 'Persistent credentials are required')
        self.now = 1000
        self.account = auth.AccountService(self.game, clock=lambda:self.now)

    def test_registration_claims_existing_progress_and_hashes_unique_salts(self):
        with self.game.transaction() as db:
            change_balance(db, self.uid, 77, 'test:progress')
        result = self.account.register(self.uid, {'login':'Person_1','password':'secret-password'})
        self.assertEqual(result['login'], 'person_1')
        self.assertTrue(result['has_credentials'])
        self.assertEqual(self.account.login({'login':'PERSON_1','password':'secret-password'}), self.uid)
        restarted = auth.AccountService(GameService(self.game.db_path))
        self.assertEqual(restarted.login({'login':'person_1','password':'secret-password'}), self.uid)
        with self.game.transaction() as db:
            stored = dict(db.execute('SELECT * FROM account_credentials WHERE account_id=?',(self.uid,)).fetchone())
            self.assertEqual(db.execute('SELECT balance FROM wallets WHERE account_id=?',(self.uid,)).fetchone()['balance'],77)
        self.assertNotIn('secret-password', json.dumps(stored))
        self.assertNotIn('salt', result)
        self.assertNotIn('password_hash', result)
        second = self.game.create_account()
        self.account.register(second, {'login':'Person_2','password':'secret-password'})
        with self.game.transaction() as db:
            self.assertNotEqual(stored['salt'], db.execute('SELECT salt FROM account_credentials WHERE account_id=?',(second,)).fetchone()['salt'])

    def test_bad_login_errors_are_generic_and_throttle_persists(self):
        self.account.register(self.uid, {'login':'Person_1','password':'secret-password'})
        errors=[]
        for login in ('person_1','does-not-exist'):
            with self.assertRaises(GameError) as error:
                self.account.login({'login':login,'password':'wrong-password'},remote_key='test-ip')
            errors.append((error.exception.code,error.exception.message,error.exception.status))
        self.assertEqual(errors[0],errors[1])
        for _ in range(8):
            with self.assertRaises(GameError):
                self.account.login({'login':'person_1','password':'wrong-password'},remote_key='test-ip')
        restarted=auth.AccountService(GameService(self.game.db_path),clock=lambda:self.now)
        with self.assertRaises(GameError) as error:
            restarted.login({'login':'person_1','password':'secret-password'},remote_key='test-ip')
        self.assertEqual(error.exception.status,429)
        self.now+=301
        self.assertEqual(restarted.login({'login':'person_1','password':'secret-password'},remote_key='test-ip'),self.uid)

    def test_invalid_unicode_password_has_generic_validation_error(self):
        for password in ('abcdefgh\ud800','🔒'*129):
            with self.assertRaises(GameError) as error:
                self.account.register(self.uid,{'login':'unicode-user','password':password},remote_key='unicode')
            self.assertEqual(error.exception.code,'invalid_credentials')


class AccountV5HttpTests(unittest.TestCase):
    def test_two_devices_rotation_logout_and_existing_demo_progress(self):
        with tempfile.TemporaryDirectory() as tmp:
            server=make_server('127.0.0.1',0,Path(tmp)/'http.db')
            thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            devices=[{'cookie':None,'csrf':None} for _ in range(2)]
            def request(device,path,body=None):
                headers={'Content-Type':'application/json'}
                if device['cookie']:headers['Cookie']=device['cookie']
                if device['csrf']:headers['X-CSRF-Token']=device['csrf']
                connection=http.client.HTTPConnection(*server.server_address)
                connection.request('GET' if body is None else 'POST',path,None if body is None else json.dumps(body),headers)
                response=connection.getresponse();result=json.loads(response.read());status=response.status
                cookie=response.getheader('Set-Cookie')
                if cookie:device['cookie']=cookie.split(';')[0]
                if 'csrf_token' in result:device['csrf']=result['csrf_token']
                connection.close();return status,result
            try:
                a,b=devices
                request(a,'/api/bootstrap')
                uid=request(a,'/api/profile',{'name':'DevicePerson'})[1]['id']
                request(a,'/api/quests/firstprofile/claim',{})
                old=dict(a)
                status,claimed=request(a,'/api/account/register',{'login':'device-person','password':'my-password-123'})
                self.assertEqual(status,200)
                self.assertEqual(claimed['account']['id'],uid)
                self.assertNotEqual(a['cookie'],old['cookie']);self.assertNotEqual(a['csrf'],old['csrf'])
                self.assertEqual(request(old,'/api/world')[0],401)
                request(b,'/api/bootstrap')
                status,logged=request(b,'/api/account/login',{'login':'device-person','password':'my-password-123'})
                self.assertEqual(status,200);self.assertEqual(logged['profile']['id'],uid)
                self.assertEqual(request(b,'/api/economy')[1]['balance'],30)
                self.assertEqual(request(b,'/api/account/logout',{})[1]['authenticated'],False)
                status,guest=request(b,'/api/account/status')
                self.assertEqual(status,200);self.assertFalse(guest['has_credentials'])
                self.assertEqual(request(b,'/api/world')[0],401)
                self.assertEqual(request(a,'/api/world')[0],200)
                self.assertNotIn('my-password-123',json.dumps(logged))
            finally:
                server.shutdown();server.server_close();thread.join()
