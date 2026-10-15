"""Validate signed Telegram WebApp data; never accept client-provided identity."""
import hashlib
import hmac
import json
import re
import secrets
import time
from urllib.parse import parse_qsl
from game import GameError, require


def unique_object(pairs):
    result={}
    for key,value in pairs:
        if key in result: raise ValueError('Duplicate JSON key')
        result[key]=value
    return result


def validate_init_data(init_data,bot_token,now=None):
    try:
        if not isinstance(init_data,str) or not 1<=len(init_data)<=32768 or not bot_token:
            raise ValueError()
        if re.search(r'%(?![0-9a-fA-F]{2})',init_data): raise ValueError()
        pairs=parse_qsl(init_data,keep_blank_values=True,strict_parsing=True,encoding='utf-8',errors='strict',max_num_fields=32)
        data=unique_object(pairs)
        digest=data.pop('hash')
        if not re.fullmatch('[0-9a-fA-F]{64}',digest): raise ValueError()
        check='\n'.join(f'{key}={value}' for key,value in sorted(data.items()))
        secret=hmac.new(b'WebAppData',bot_token.encode(),hashlib.sha256).digest()
        expected=hmac.new(secret,check.encode(),hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected,digest.lower()): raise ValueError()
        date=data['auth_date']
        if not date.isascii() or not date.isdigit(): raise ValueError()
        delta=(time.time() if now is None else now)-int(date)
        if not -60<=delta<=86400: raise ValueError()
        user=json.loads(data['user'],object_pairs_hook=unique_object)
        if not isinstance(user,dict) or type(user.get('id')) is not int or user['id']<=0: raise ValueError()
        return user
    except (ValueError,KeyError,TypeError,UnicodeError,OverflowError):
        raise GameError('invalid_telegram_auth','Данные Telegram недействительны или устарели',401) from None


class AccountService:
    """Bind credentials to an account without moving or replacing its game data."""
    def __init__(self,game,clock=None):
        self.game,self.clock=game,clock or time.time
        with game.transaction() as db:
            db.execute('CREATE TABLE IF NOT EXISTS account_credentials (account_id TEXT PRIMARY KEY,login TEXT NOT NULL UNIQUE,salt TEXT NOT NULL,password_hash TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS account_attempts (remote_key TEXT PRIMARY KEY,started REAL NOT NULL,attempts INTEGER NOT NULL)')

    def _values(self,data):
        require(isinstance(data,dict) and not set(data)-{'login','password'},'Неверные данные входа','invalid_credentials',401)
        login,password=data.get('login'),data.get('password')
        require(isinstance(login,str) and isinstance(password,str),'Неверные данные входа','invalid_credentials',401)
        login=login.strip().lower()
        require(re.fullmatch(r'[a-z0-9][a-z0-9_.-]{2,31}',login) is not None and 8<=len(password)<=128,
                'Неверные данные входа','invalid_credentials',401)
        try:encoded=password.encode('utf-8')
        except UnicodeError:require(False,'Неверные данные входа','invalid_credentials',401)
        require(len(encoded)<=512,'Неверные данные входа','invalid_credentials',401)
        return login,password

    def _hash(self,password,salt):
        return hashlib.scrypt(password.encode('utf-8'),salt=bytes.fromhex(salt),n=16384,r=8,p=1,dklen=32).hex()

    def _attempt(self,remote_key):
        # Separate transaction commits attempts even when verification then raises.
        now=self.clock()
        with self.game.transaction() as db:
            db.execute('DELETE FROM account_attempts WHERE started<=?',(now-300,))
            row=db.execute('SELECT * FROM account_attempts WHERE remote_key=?',(remote_key,)).fetchone()
            require(row is None or row['attempts']<10,'Повторите вход позже','auth_throttled',429)
            db.execute('INSERT INTO account_attempts VALUES (?,?,1) ON CONFLICT(remote_key) DO UPDATE SET attempts=attempts+1',(remote_key,now))

    def status(self,uid):
        with self.game.transaction() as db:
            account=db.execute('SELECT telegram_id FROM accounts WHERE id=?',(uid,)).fetchone() if uid else None
            row=db.execute('SELECT login FROM account_credentials WHERE account_id=?',(uid,)).fetchone() if account else None
            return {'id':uid if account else None,'has_credentials':bool(row),'login':row['login'] if row else None,
                    'provider':'password' if row else 'telegram' if account and account['telegram_id'] else 'demo' if account else 'guest',
                    'registration_required':bool(account and not row and not account['telegram_id'])}

    def register(self,uid,data,remote_key='register'):
        self._attempt(remote_key)
        login,password=self._values(data)
        salt=secrets.token_bytes(16).hex();digest=self._hash(password,salt)
        with self.game.transaction() as db:
            require(db.execute('SELECT 1 FROM accounts WHERE id=?',(uid,)).fetchone() is not None,'Нужна авторизация','unauthorized',401)
            require(db.execute('SELECT 1 FROM account_credentials WHERE account_id=? OR login=?',(uid,login)).fetchone() is None,
                    'Не удалось привязать данные входа','account_unavailable',409)
            db.execute('INSERT INTO account_credentials VALUES (?,?,?,?)',(uid,login,salt,digest))
        return self.status(uid)

    def login(self,data,remote_key='login'):
        self._attempt(remote_key)
        login,password=self._values(data)
        with self.game.transaction() as db:
            row=db.execute('SELECT * FROM account_credentials WHERE login=?',(login,)).fetchone()
        # Unknown logins incur the same expensive hash as known credentials.
        salt=row['salt'] if row else '00'*16
        digest=self._hash(password,salt)
        require(row is not None and hmac.compare_digest(digest,row['password_hash']),
                'Неверные данные входа','invalid_credentials',401)
        with self.game.transaction() as db:
            db.execute('DELETE FROM account_attempts WHERE remote_key=?',(remote_key,))
        return row['account_id']
