import hashlib
import hmac
import json
import unittest
from urllib.parse import urlencode

try:
    from auth import validate_init_data
except ImportError:
    validate_init_data = None
from game import GameError


def signed(fields, bot='123:test'):
    # Independent fixture implementation using Telegram's published HMAC construction.
    check='\n'.join(f'{key}={value}' for key,value in sorted(fields.items()))
    secret=hmac.digest(b'WebAppData',bot.encode(),'sha256')
    return urlencode(fields | {'hash':hmac.new(secret,check.encode(),hashlib.sha256).hexdigest()})


class AuthTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(validate_init_data,'Telegram verifier must be implemented')
        self.fields={'auth_date':'100000', 'user':json.dumps({'id':42,'first_name':'Человек'}),'query_id':'abc'}

    def test_valid_fixture_and_non_ascii(self):
        self.assertEqual(validate_init_data(signed(self.fields),'123:test',now=100010)['id'],42)

    def test_tampered_wrong_bot_duplicate_stale_future_and_malformed(self):
        good=signed(self.fields)
        invalid=[good.replace('abc','evil'),signed(self.fields,'other'),good+'&auth_date=100000',
                 signed(self.fields | {'auth_date':'1'}),signed(self.fields | {'auth_date':'100071'}),
                 signed(self.fields | {'user':'[]'}), signed(self.fields | {'user':'{"id":true}'}),
                 signed(self.fields | {'auth_date':'nan'}), 'hash=wrong',good+'&x=%ZZ',
                 signed(self.fields | {'user':'{"id":42,"id":43}'})]
        for value in invalid:
            with self.subTest(value=value[:15]), self.assertRaises(GameError):
                validate_init_data(value,'123:test',now=100010)

if __name__=='__main__': unittest.main()
