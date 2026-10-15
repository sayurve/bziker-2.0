"""Place only our disposable local QA account at an actual city door.

Run while the browser is on character-lab, then enter the room through the UI.
This is fixture setup, not a gameplay teleport or a production endpoint.
"""
import argparse
import json
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'game'))
from game import GameService
from auth import AccountService
from world import WorldService, INTERIORS, nearest_city_position, valid_position

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--room', choices=sorted(INTERIORS), required=True)
args = parser.parse_args()
database = Path('/tmp/bziker-locations-v26-qa.sqlite3')
game = GameService(database)
world = WorldService(game)
accounts = AccountService(game)
with game.transaction() as db:
    account = db.execute('SELECT account_id FROM account_credentials WHERE login=?',
                         ('locations_v26_qa',)).fetchone()
if account:
    uid = account['account_id']
else:
    uid = game.create_account()
    game.profile(uid, {'name': 'LocationQA', 'avatar': dict(gender=0, skin=0, hairStyle=0,
        hairColor=0, shirtStyle=2, shirtColor=6, pantsStyle=0, pantsColor=1,
        accessory=0, shoesColor=0, headwear=0, outfit=0)})
    accounts.register(uid, {'login': 'locations_v26_qa', 'password': 'LocationQA_2026!'})
door = INTERIORS[args.room]['door']
x, y = nearest_city_position(door['x'], door['y'])
assert valid_position('city', x, y)
assert (x-door['x'])**2 + (y-door['y'])**2 <= 100**2
with game.transaction() as db:
    db.execute("INSERT OR REPLACE INTO presence (account_id,x,y,scene,scene_id,updated,pose,phone_open) VALUES (?,?,?,'city',NULL,?,'idle',0)", (uid,x,y,time.time()))
    db.execute("INSERT OR REPLACE INTO world_positions VALUES (?,?,?,'city',NULL)", (uid,x,y))
print(json.dumps({'fixture_only': True, 'database': str(database), 'room': args.room,
                  'position': {'x': x, 'y': y}}, ensure_ascii=False))
