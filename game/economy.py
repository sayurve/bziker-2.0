"""Virtual Бзинге, inventory, side quests and explicitly accepted social actions."""
import json
import math
from datetime import datetime, timezone, timedelta
from game import require, token
from actions import action_snapshot, start_action

CURRENCY = 'Бзинге'
BAG_CAPACITY=10
BAG_KINDS=frozenset(('food','consumable','deck','tool','pet','catch','litter'))
INITIAL_GRANT = 0
CATALOG = [
    {'id': 'coffee', 'name': 'Кофе', 'kind': 'food', 'shop': 'shop-food', 'price': 15, 'description': 'Один игровой кофе.'},
    {'id': 'snack', 'name': 'Перекус', 'kind': 'food', 'shop': 'shop-food', 'price': 20, 'description': 'Одна порция игрового перекуса.'},
    {'id': 'cigarette', 'name': 'Сигарета', 'kind': 'consumable', 'shop': 'shop-food', 'price': 10, 'description': 'Игровой предмет для выделенной курилки.'},
    {'id': 'cards', 'name': 'Колода карт', 'kind': 'deck', 'shop': 'shop-food', 'price': 60, 'description': 'Создание приватных карточных комнат.'},
] + [
    {'id': f'outfit-{i}', 'name': name, 'kind': 'outfit', 'shop': 'shop-clothes', 'price': price,
     'description': 'Костюм можно надеть и снять в профиле.', 'avatar': {'outfit': i}}
    for i, name, price in ((1, 'Хромовая куртка', 100), (2, 'Неон-худи', 140), (3, 'Креативное пальто', 180),
                           (4,'Спортивный костюм',120),(5,'Костюм зверя',200),(6,'Дождевик',160))
] + [
    {'id': f'furniture-{kind}', 'name': name, 'kind': 'furniture', 'shop': 'shop-furniture', 'price': price,
     'description': 'Премиальный вариант для своей клановой базы.', 'furniture_type': kind}
    for kind, name, price in (('sofa', 'Премиальный диван', 80), ('desk', 'Премиальный стол', 80),
                              ('plant', 'Премиальное растение', 50), ('board', 'Премиальная доска', 60),
                              ('chair', 'Премиальное кресло', 50))
]
CATALOG += [
    {'id':'rod','name':'Удочка','kind':'tool','shop':'shop-food','price':40,'description':'Рыбалка у озера.'},
    {'id':'pet-dog','name':'Собака','kind':'pet','shop':'shop-food','price':180,'description':'Питомец следует за хозяином.','pet_kind':'dog'},
    {'id':'pet-cat','name':'Кот','kind':'pet','shop':'shop-food','price':180,'description':'Питомец следует за хозяином.','pet_kind':'cat'},
]
from world import FURNITURE_TYPES
CATALOG += [{'id':'furniture-'+kind,'name':definition['label'],'kind':'furniture','shop':'shop-furniture','price':90,
             'description':'Премиальный вариант для своей клановой базы.','furniture_type':kind}
            for kind,definition in FURNITURE_TYPES.items() if kind not in ('sofa','desk','plant','board','chair')]
ITEMS = {item['id']: item for item in CATALOG}
ITEMS.update({'fish':{'id':'fish','name':'Рыба','kind':'catch','description':'Улов из городского озера.'},
              'trash':{'id':'trash','name':'Мусор','kind':'litter','description':'Отнесите к урне.'}})
QUESTS = [
    {'id': 'firstprofile', 'name': 'Обустроиться в городе', 'description': 'Создать профиль.', 'reward': 30},
    {'id': 'joinclan', 'name': 'Найти свой клан', 'description': 'Создать клан или вступить в него.', 'reward': 40},
    {'id': 'firstfriend', 'name': 'Первый друг', 'description': 'Добавить друга по взаимному согласию.', 'reward': 20},
    {'id': 'fivefriends', 'name': 'Своя компания', 'description': 'Добавить пять друзей по взаимному согласию.', 'reward': 100},
    {'id': 'firstpurchase', 'name': 'Первая покупка', 'description': 'Купить предмет в городском магазине.', 'reward': 20},
    {'id': 'firstfinishedquiz', 'name': 'Завершить БЗИК', 'description': 'Завершить викторину в качестве участника.', 'reward': 50},
]
QUESTS += [{'id':qid,'name':name,'description':description,'reward':reward} for qid,name,description,reward in (
    ('parkvisit','Прогулка в парке','Посетить городской парк.',10),
    ('sit10s','Отдых на лавке','Посидеть на лавке в парке 10 секунд.',10),
    ('casinovisit','Огни казино','Войти в казино.',10),('terracevisit','Творческая гостиная','Войти на террасу.',10),
    ('firstfish','Первый улов','Поймать рыбу купленной удочкой.',20),('petdog','Хороший пёс','Погладить собаку в парке.',10),
    ('bintrash','Чистый город','Поднять мусор и выбросить в урну.',10),
    ('firstdurak','Первая партия','Завершить партию в дурака.',20),('cardwin','Победа за столом','Выиграть карточную игру.',30))]
DAILY_EVENTS={'dailypark':'parkvisit','dailysit':'sit10s','dailytrash':'bintrash'}
QUESTS += [{'id':qid,'name':name,'description':description,'reward':10,'daily':True} for qid,name,description in (
    ('dailypark','Ежедневная прогулка','Посетить парк сегодня.'),('dailysit','Ежедневный отдых','Посидеть в парке 10 секунд сегодня.'),
    ('dailytrash','Ежедневная уборка','Выбросить поднятый мусор сегодня.'))]


def moscow_day(now):
    return datetime.fromtimestamp(now,timezone(timedelta(hours=3))).date().isoformat()


def record_event(db,uid,event,now):
    """Only authoritative server actions call this, in their own transaction."""
    for day in ('',moscow_day(now)):
        db.execute('INSERT OR IGNORE INTO activity_events VALUES (?,?,?,?)',(uid,event,day,now))


def selected_pet(db,uid):
    row=db.execute('SELECT item_id FROM account_pets WHERE account_id=?',(uid,)).fetchone()
    return {'id':row['item_id'],'kind':ITEMS[row['item_id']]['pet_kind']} if row and inventory_quantity(db,uid,row['item_id']) else None


def initialize_schema(db, initial_grant=INITIAL_GRANT):
    require(type(initial_grant) is int and initial_grant >= 0, 'Неверное начальное начисление')
    db.execute('CREATE TABLE IF NOT EXISTS wallets (account_id TEXT PRIMARY KEY, balance INTEGER NOT NULL CHECK(balance>=0))')
    db.execute('CREATE TABLE IF NOT EXISTS economy_ledger (account_id TEXT NOT NULL, reference TEXT NOT NULL, amount INTEGER NOT NULL, PRIMARY KEY(account_id,reference))')
    db.execute('CREATE TABLE IF NOT EXISTS inventory (account_id TEXT NOT NULL, item_id TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity>=0), PRIMARY KEY(account_id,item_id))')
    db.execute('CREATE TABLE IF NOT EXISTS quest_claims (account_id TEXT NOT NULL, quest_id TEXT NOT NULL, PRIMARY KEY(account_id,quest_id))')
    db.execute('CREATE TABLE IF NOT EXISTS activity_events (account_id TEXT NOT NULL,event TEXT NOT NULL,day TEXT NOT NULL,created REAL NOT NULL,PRIMARY KEY(account_id,event,day))')
    db.execute('CREATE TABLE IF NOT EXISTS daily_quest_claims (account_id TEXT NOT NULL,quest_id TEXT NOT NULL,day TEXT NOT NULL,reward INTEGER NOT NULL,PRIMARY KEY(account_id,quest_id,day))')
    db.execute('CREATE TABLE IF NOT EXISTS account_pets (account_id TEXT PRIMARY KEY,item_id TEXT NOT NULL)')
    db.execute('CREATE TABLE IF NOT EXISTS litter_picks (account_id TEXT NOT NULL,target_id TEXT NOT NULL,day TEXT NOT NULL,PRIMARY KEY(account_id,target_id,day))')
    db.execute('CREATE TABLE IF NOT EXISTS fishing_sessions (id TEXT PRIMARY KEY,account_id TEXT NOT NULL,spot_id TEXT NOT NULL,ready_at REAL NOT NULL,state TEXT NOT NULL)')
    db.execute("CREATE UNIQUE INDEX IF NOT EXISTS pending_fishing ON fishing_sessions(account_id) WHERE state='waiting'")
    db.execute('CREATE TABLE IF NOT EXISTS smoking_requests (id TEXT PRIMARY KEY, from_id TEXT NOT NULL, to_id TEXT NOT NULL, state TEXT NOT NULL, created REAL NOT NULL)')
    db.execute("CREATE UNIQUE INDEX IF NOT EXISTS pending_smoking_request ON smoking_requests(from_id,to_id) WHERE state='pending'")
    db.execute('CREATE TABLE IF NOT EXISTS friend_requests (id TEXT PRIMARY KEY, from_id TEXT NOT NULL, to_id TEXT NOT NULL, state TEXT NOT NULL, created REAL NOT NULL)')
    db.execute("CREATE UNIQUE INDEX IF NOT EXISTS pending_friend_request ON friend_requests(min(from_id,to_id),max(from_id,to_id)) WHERE state='pending'")
    db.execute('CREATE TABLE IF NOT EXISTS friendships (first_id TEXT NOT NULL, second_id TEXT NOT NULL, PRIMARY KEY(first_id,second_id), CHECK(first_id<second_id))')
    for row in db.execute('SELECT id FROM accounts').fetchall():
        ensure_wallet(db, row['id'], initial_grant)


def ensure_wallet(db, uid, initial_grant=INITIAL_GRANT):
    require(db.execute('SELECT 1 FROM accounts WHERE id=?', (uid,)).fetchone() is not None, 'Нужна авторизация', 'unauthorized', 401)
    db.execute('INSERT OR IGNORE INTO wallets VALUES (?,0)', (uid,))
    change_balance(db, uid, initial_grant, 'initial:v3')


def change_balance(db, uid, amount, reference):
    """Apply once inside the caller's transaction; never commit independently."""
    require(type(amount) is int and abs(amount) <= 10**9, 'Неверная сумма')
    require(isinstance(reference, str) and 1 <= len(reference) <= 200, 'Неверное основание начисления')
    wallet = db.execute('SELECT balance FROM wallets WHERE account_id=?', (uid,)).fetchone()
    require(wallet is not None, 'Кошелёк не найден', 'not_found', 404)
    previous = db.execute('SELECT amount FROM economy_ledger WHERE account_id=? AND reference=?', (uid, reference)).fetchone()
    if previous:
        require(previous['amount'] == amount, 'Основание уже использовано с другой суммой', 'reference_conflict', 409)
        return wallet['balance']
    balance = wallet['balance'] + amount
    require(balance >= 0, 'Недостаточно Бзинге', 'insufficient_funds')
    db.execute('UPDATE wallets SET balance=? WHERE account_id=?', (balance, uid))
    db.execute('INSERT INTO economy_ledger VALUES (?,?,?)', (uid, reference, amount))
    return balance


def inventory_quantity(db, uid, item):
    row = db.execute('SELECT quantity FROM inventory WHERE account_id=? AND item_id=?', (uid, item)).fetchone()
    return row['quantity'] if row else 0


def change_inventory(db, uid, item, amount):
    before=inventory_quantity(db,uid,item)
    quantity = before + amount
    require(quantity >= 0, 'Предмет отсутствует в инвентаре', 'item_missing')
    if amount>0 and before==0 and ITEMS.get(item,{}).get('kind') in BAG_KINDS:
        require(inventory_slots_used(db,uid)<BAG_CAPACITY,'Инвентарь заполнен: 10 ячеек','inventory_full',409)
    db.execute('INSERT INTO inventory VALUES (?,?,?) ON CONFLICT(account_id,item_id) DO UPDATE SET quantity=excluded.quantity', (uid, item, quantity))
    return quantity


def inventory_slots_used(db,uid):
    return sum(ITEMS.get(row['item_id'],{}).get('kind') in BAG_KINDS for row in
               db.execute('SELECT item_id FROM inventory WHERE account_id=? AND quantity>0',(uid,)))


def guard(db, uid):
    from world import jury_restricted
    row = db.execute('SELECT profile FROM accounts WHERE id=?', (uid,)).fetchone()
    require(row is not None, 'Нужна авторизация', 'unauthorized', 401)
    require(row['profile'] is not None, 'Сначала создайте профиль')
    require(not jury_restricted(db, uid), 'Город недоступен до завершения всех игр жюри', 'jury_restricted', 403)
    return json.loads(row['profile'])


def _smoking_presence(db, uid, now):
    from world import PRESENCE_TTL, WORLD_MAP
    row = db.execute('SELECT * FROM presence WHERE account_id=? AND updated>?', (uid, now - PRESENCE_TTL)).fetchone()
    zone=WORLD_MAP['smoking']
    return row if row and row['scene'] == 'city' and zone['x'] <= row['x'] <= zone['x']+zone['width'] and zone['y'] <= row['y'] <= zone['y']+zone['height'] else None


class EconomyService:
    def __init__(self, game, world):
        self.game, self.world = game, world
        with game.transaction() as db:
            initialize_schema(db)

    def _guard(self, db, uid, play=False):
        self.world._guard(db, uid)
        if play:
            from world import active_participant_lobby, active_cards
            require(active_participant_lobby(db, uid) is None and active_cards(db, uid) is None,
                    'Сначала завершите текущую игру', 'match_conflict', 409)
        self.world._touch(db, uid)

    def _peer(self, db, uid, peer):
        require(isinstance(peer, str) and peer != uid, 'Выберите другого игрока')
        return guard(db, peer)

    def _friend_ids(self, db, uid):
        return [row['second_id'] if row['first_id'] == uid else row['first_id']
                for row in db.execute('SELECT * FROM friendships WHERE first_id=? OR second_id=? ORDER BY rowid', (uid, uid))]

    def _quests(self, db, uid):
        from world import account_clan
        friends = len(self._friend_ids(db, uid))
        finished = any((lobby := json.loads(row['data']))['state'] == 'finished' and
                       lobby['members'].get(uid, {}).get('role') == 'participant'
                       for row in db.execute('SELECT data FROM lobbies'))
        eligibility = {'firstprofile': True, 'joinclan': account_clan(db, uid) is not None,
                       'firstfriend': friends >= 1, 'fivefriends': friends >= 5,
                       'firstpurchase': db.execute("SELECT 1 FROM economy_ledger WHERE account_id=? AND reference LIKE 'shop:%'", (uid,)).fetchone() is not None,
                       'firstfinishedquiz': finished}
        claimed = {row['quest_id'] for row in db.execute('SELECT quest_id FROM quest_claims WHERE account_id=?', (uid,))}
        day=moscow_day(self.world.clock())
        events={(row['event'],row['day']) for row in db.execute('SELECT event,day FROM activity_events WHERE account_id=?',(uid,))}
        daily_claims={row['quest_id'] for row in db.execute('SELECT quest_id FROM daily_quest_claims WHERE account_id=? AND day=?',(uid,day))}
        return [quest | {'eligible': (DAILY_EVENTS[quest['id']],day) in events if quest.get('daily') else eligibility.get(quest['id'],(quest['id'],'') in events),
                         'claimed':quest['id'] in (daily_claims if quest.get('daily') else claimed)} for quest in QUESTS]

    def _request(self, db, row):
        return {key: row[key] for key in ('id', 'to_id', 'state')} | {'from': self.game._profile(db, row['from_id'])}

    def _snapshot(self, db, uid):
        from world import jury_restricted
        requests = [self._request(db, row) for row in db.execute('SELECT * FROM smoking_requests WHERE from_id=? OR to_id=? ORDER BY created,rowid', (uid, uid))
                    if not jury_restricted(db, row['from_id']) and not jury_restricted(db, row['to_id'])]
        nearby = [self.game._profile(db, row['account_id']) for row in db.execute('SELECT account_id FROM presence ORDER BY rowid')
                  if row['account_id'] != uid and not jury_restricted(db, row['account_id']) and _smoking_presence(db, row['account_id'], self.world.clock())]
        return action_snapshot(db,uid,self.world.clock())|{'server_time':self.world.clock(),'currency': CURRENCY, 'balance': db.execute('SELECT balance FROM wallets WHERE account_id=?', (uid,)).fetchone()['balance'],
                'inventory': [{'item_id': row['item_id'], 'quantity': row['quantity'], 'item': ITEMS[row['item_id']]}
                              for row in db.execute('SELECT * FROM inventory WHERE account_id=? AND quantity>0 ORDER BY rowid', (uid,)) if row['item_id'] in ITEMS],
                'inventory_capacity':BAG_CAPACITY,'inventory_used':inventory_slots_used(db,uid),
                'catalog': CATALOG, 'unlocked_outfits': [0] + [i for i in range(1, 7) if inventory_quantity(db, uid, f'outfit-{i}')],
                'selected_pet':(selected_pet(db,uid) or {}).get('id'),
                'daily':self._daily(db,uid),
                'quests': self._quests(db, uid), 'smoking': {'requests': requests, 'nearby': nearby},
                'restricted': False, 'virtual_only': True}

    def _daily(self,db,uid):
        day=moscow_day(self.world.clock())
        spent=db.execute('SELECT COALESCE(SUM(reward),0) FROM daily_quest_claims WHERE account_id=? AND day=?',(uid,day)).fetchone()[0]
        return {'day':day,'limit':30,'claimed':spent,'remaining':max(0,30-spent)}

    def snapshot(self, uid):
        with self.game.transaction() as db:
            self._guard(db, uid)
            return self._snapshot(db, uid)

    def claim(self, uid, qid):
        with self.game.transaction() as db:
            self._guard(db, uid)
            quest = next((q for q in self._quests(db, uid) if q['id'] == qid), None)
            require(quest is not None, 'Задание не найдено', 'not_found', 404)
            if not quest['claimed']:
                require(quest['eligible'], 'Сначала выполните задание', 'quest_unavailable', 409)
                if quest.get('daily'):
                    daily=self._daily(db,uid)
                    require(daily['remaining']>=quest['reward'],'Лимит ежедневных наград достигнут','daily_limit',409)
                    change_balance(db,uid,quest['reward'],f'quest:{qid}:{daily["day"]}')
                    db.execute('INSERT INTO daily_quest_claims VALUES (?,?,?,?)',(uid,qid,daily['day'],quest['reward']))
                else:
                    change_balance(db, uid, quest['reward'], f'quest:{qid}')
                    db.execute('INSERT INTO quest_claims VALUES (?,?)', (uid, qid))
            return self._snapshot(db, uid) | {'claimed_quest': qid}

    def buy(self, uid, data):
        require(isinstance(data, dict) and not set(data) - {'item_id', 'quantity'}, 'Неверные параметры покупки')
        item = ITEMS.get(data.get('item_id')) if isinstance(data.get('item_id'), str) else None
        require(item is not None and item in CATALOG, 'Товар не найден', 'not_found', 404)
        quantity = data.get('quantity', 1)
        require(type(quantity) is int and 1 <= quantity <= 99, 'Количество: целое число от 1 до 99')
        with self.game.transaction() as db:
            self._guard(db, uid, play=True)
            if item['kind'] in ('deck', 'outfit', 'furniture','tool','pet'):
                require(quantity == 1 and inventory_quantity(db, uid, item['id']) == 0, 'Этот предмет уже куплен или количество неверно', 'already_owned', 409)
            change_balance(db, uid, -item['price'] * quantity, 'shop:' + token())
            change_inventory(db, uid, item['id'], quantity)
            return self._snapshot(db, uid) | {'bought_item': item['id']}

    def use(self, uid, data):
        require(isinstance(data, dict), 'Требуется объект')
        item = ITEMS.get(data.get('item_id')) if isinstance(data.get('item_id'), str) else None
        require(item is not None and item['id'] in ('coffee', 'snack', 'cigarette','pet-dog','pet-cat'), 'Этот предмет нельзя расходовать')
        with self.game.transaction() as db:
            self._guard(db, uid, play=True)
            if item['kind']=='pet':
                require(inventory_quantity(db,uid,item['id'])>0,'Предмет отсутствует в инвентаре','item_missing')
                db.execute('INSERT OR REPLACE INTO account_pets VALUES (?,?)',(uid,item['id']))
                return self._snapshot(db,uid)|{'used_item':item['id']}
            if item['id'] == 'cigarette':
                require(_smoking_presence(db, uid, self.world.clock()) is not None, 'Предмет используют в выделенной курилке', 'smoking_zone', 409)
                db.execute("UPDATE presence SET pose=CASE WHEN bench_id IS NULL THEN 'smoke' ELSE pose END,pose_until=CASE WHEN bench_id IS NULL THEN ? ELSE pose_until END WHERE account_id=?", (self.world.clock() + 8, uid))
            change_inventory(db, uid, item['id'], -1)
            if item['id'] in ('coffee','snack'):
                start_action(db,uid,'drink' if item['id']=='coffee' else 'eat',self.world.clock(),item_id=item['id'])
            elif item['id']=='cigarette':
                start_action(db,uid,'smoke',self.world.clock(),item_id=item['id'])
            return self._snapshot(db, uid) | {'used_item': item['id']}

    def _near_activity(self,db,uid,target,action):
        from world import WORLD_MAP
        if action in ('pet-dog','pet-cat'):
            from animals import ANIMALS,animal_position,animal_pause
            animal=ANIMALS.get(target)
            require(animal is not None and animal['action']==action,'Действие не найдено','not_found',404)
            now=self.world.clock()
            point=animal_position(animal,now,animal_pause(db,target,now))
        else:
            point=next((p for p in WORLD_MAP['activities'] if p['id']==target and p['action']==action),None)
        require(point is not None,'Действие не найдено','not_found',404)
        row=db.execute('SELECT * FROM presence WHERE account_id=?',(uid,)).fetchone()
        require(row is not None and row['scene']=='city' and math.hypot(row['x']-point['x'],row['y']-point['y'])<=point['radius'],
                'Подойдите ближе','activity_distance',409)
        return point

    def action(self,uid,data):
        require(isinstance(data,dict),'Требуется объект')
        action,target=data.get('action'),data.get('target_id')
        if action in ('boat-board','boat-exit'):return self.world.boat_action(uid,data)
        require(action in ('pet-dog','pet-cat','pet','pet-own','pick-litter','trash-bin') and isinstance(target,str),'Действие не найдено','not_found',404)
        with self.game.transaction() as db:
            self._guard(db,uid,play=True)
            effect=None;point=None
            if action in ('pet','pet-own'):
                pet=selected_pet(db,uid)
                require(pet is not None and pet['id']==target,'Выберите своего приобретённого питомца','pet_not_owned',403)
                require(self.world._owned_boat(db,uid) is None,'Питомец ждёт на берегу','boat_exit_required',409)
                presence=db.execute('SELECT scene FROM presence WHERE account_id=?',(uid,)).fetchone()
                require(presence and presence['scene'] in ('city','interior','base'),'Питомец недоступен в этой локации','forbidden',403)
                kind=pet['kind']
            else:
                point=self._near_activity(db,uid,target,action)
                kind='dog' if action=='pet-dog' else 'cat'
            if action in ('pet-dog','pet-cat','pet','pet-own'):
                effect={'id':token(),'target_id':target,'kind':kind,'started_at':self.world.clock(),'duration':2}
                if action in ('pet-dog','pet-cat'):
                    from animals import pause_animal
                    pause_animal(db,target,effect['started_at'],effect['duration'])
                db.execute('INSERT OR REPLACE INTO world_pet_effects VALUES (?,?,?,?,?,?)',
                           (uid,effect['id'],target,kind,effect['started_at'],effect['duration']))
                if kind=='dog':record_event(db,uid,'petdog',self.world.clock())
            elif action=='pick-litter':
                picked=False
                day=moscow_day(self.world.clock())
                if not db.execute('SELECT 1 FROM litter_picks WHERE account_id=? AND target_id=? AND day=?',(uid,target,day)).fetchone():
                    db.execute('INSERT INTO litter_picks VALUES (?,?,?)',(uid,target,day));change_inventory(db,uid,'trash',1)
                    start_action(db,uid,'pick-litter',self.world.clock(),item_id='trash',target_id=target,point=point)
                    picked=True
            else:
                change_inventory(db,uid,'trash',-1);record_event(db,uid,'bintrash',self.world.clock())
                start_action(db,uid,'throw-litter',self.world.clock(),item_id='trash',target_id=target,point=point)
            return self._snapshot(db,uid)|{'action':action,'target_id':target,'pet_effect':effect}|({'picked':picked} if action=='pick-litter' else {})

    def _near_fishing(self,db,uid,spot):
        if spot.startswith('boat:'):
            boat=self.world._owned_boat(db,uid)
            require(boat is not None and boat['id']==spot[5:],'Рыбалка доступна из своей лодки','boat_not_owned',403)
        else:self._near_activity(db,uid,spot,'fishing')

    def _fish_snapshot(self,row):
        if row is None or row['state']=='cancelled':return {'active':None}
        state='ready' if row['state']=='waiting' and self.world.clock()>=row['ready_at'] else row['state']
        return {'active':{key:row[key] for key in ('id','spot_id','ready_at')}|{'state':state,'fish':{'item_id':'fish','quantity':1} if state=='caught' else None}}

    def fishing(self,uid):
        with self.game.transaction() as db:
            self._guard(db,uid)
            return self._fish_snapshot(db.execute('SELECT * FROM fishing_sessions WHERE account_id=? ORDER BY rowid DESC LIMIT 1',(uid,)).fetchone())

    def start_fishing(self,uid,data):
        require(isinstance(data,dict) and isinstance(data.get('spot_id'),str),'Неверное место рыбалки')
        with self.game.transaction() as db:
            self._guard(db,uid,play=True);self._near_fishing(db,uid,data['spot_id'])
            require(inventory_quantity(db,uid,'rod')>0,'Сначала купите удочку','rod_required',403)
            row=db.execute("SELECT * FROM fishing_sessions WHERE account_id=? AND state='waiting'",(uid,)).fetchone()
            if row and row['spot_id']!=data['spot_id']:
                db.execute("UPDATE fishing_sessions SET state='cancelled' WHERE id=?",(row['id'],));row=None
            if row is None:
                now=self.world.clock();rid=token();db.execute('INSERT INTO fishing_sessions VALUES (?,?,?,?,?)',(rid,uid,data['spot_id'],now+2,'waiting'))
                row=db.execute('SELECT * FROM fishing_sessions WHERE id=?',(rid,)).fetchone()
                start_action(db,uid,'fishing',now,item_id='rod')
            return self._fish_snapshot(row)

    def catch_fish(self,uid,rid):
        with self.game.transaction() as db:
            self._guard(db,uid,play=True)
            row=db.execute('SELECT * FROM fishing_sessions WHERE id=?',(rid,)).fetchone()
            require(row is not None,'Рыбалка не найдена','not_found',404)
            require(row['account_id']==uid,'Чужая рыбалка','forbidden',403)
            if row['state']=='caught':return self._fish_snapshot(row)
            require(row['state']=='waiting','Рыбалка отменена','fishing_cancelled',409)
            self._near_fishing(db,uid,row['spot_id'])
            now=self.world.clock();require(now>=row['ready_at'],'Дождитесь поклёвки','fish_not_ready',409)
            change_inventory(db,uid,'fish',1);record_event(db,uid,'firstfish',now)
            db.execute("UPDATE fishing_sessions SET state='caught' WHERE id=?",(rid,))
            start_action(db,uid,'fish-catch',now,item_id='fish')
            return self._fish_snapshot(db.execute('SELECT * FROM fishing_sessions WHERE id=?',(rid,)).fetchone())

    def request(self, uid, data):
        require(isinstance(data, dict), 'Требуется объект')
        with self.game.transaction() as db:
            self._guard(db, uid, play=True)
            peer = data.get('to_id')
            self._peer(db, uid, peer)
            require(_smoking_presence(db, uid, self.world.clock()) and _smoking_presence(db, peer, self.world.clock()),
                    'Оба игрока должны находиться в курилке', 'smoking_zone', 409)
            require(inventory_quantity(db, peer, 'cigarette') > 0, 'У игрока нет предмета', 'item_missing')
            row = db.execute("SELECT * FROM smoking_requests WHERE from_id=? AND to_id=? AND state='pending'", (uid, peer)).fetchone()
            if not row:
                rid = token()
                db.execute('INSERT INTO smoking_requests VALUES (?,?,?,?,?)', (rid, uid, peer, 'pending', self.world.clock()))
                row = db.execute('SELECT * FROM smoking_requests WHERE id=?', (rid,)).fetchone()
            return self._snapshot(db, uid) | {'request': self._request(db, row)}

    def respond(self, uid, rid, action):
        require(action in ('give', 'decline'), 'Действие не найдено', 'not_found', 404)
        with self.game.transaction() as db:
            self._guard(db, uid, play=True)
            row = db.execute('SELECT * FROM smoking_requests WHERE id=?', (rid,)).fetchone()
            require(row is not None, 'Запрос не найден', 'not_found', 404)
            require(row['to_id'] == uid, 'Согласие даёт владелец предмета', 'forbidden', 403)
            desired = 'given' if action == 'give' else 'declined'
            require(row['state'] in ('pending', desired), 'Запрос уже обработан', 'request_closed', 409)
            if row['state'] == 'pending':
                if action == 'give':
                    self._peer(db, uid, row['from_id'])
                    require(_smoking_presence(db, uid, self.world.clock()) and _smoking_presence(db, row['from_id'], self.world.clock()),
                            'Оба игрока должны находиться в курилке', 'smoking_zone', 409)
                    change_inventory(db, uid, 'cigarette', -1)
                    change_inventory(db, row['from_id'], 'cigarette', 1)
                db.execute('UPDATE smoking_requests SET state=? WHERE id=?', (desired, rid))
            return self._snapshot(db, uid) | {'request': self._request(db, db.execute('SELECT * FROM smoking_requests WHERE id=?', (rid,)).fetchone())}

    def _friends(self, db, uid):
        from world import jury_restricted
        requests, sent = [], []
        for row in db.execute("SELECT * FROM friend_requests WHERE (from_id=? OR to_id=?) AND state='pending' ORDER BY created,rowid", (uid, uid)):
            if jury_restricted(db, row['from_id']) or jury_restricted(db, row['to_id']):
                continue
            if row['to_id'] == uid:
                requests.append(self._request(db, row))
            else:
                sent.append({'id': row['id'], 'to': self.game._profile(db, row['to_id']), 'state': row['state']})
        ids = self._friend_ids(db, uid)
        return {'friends': [self.game._profile(db, peer) for peer in ids if not jury_restricted(db, peer)],
                'requests': requests, 'sent': sent, 'count': len(ids)}

    def friends(self, uid):
        with self.game.transaction() as db:
            self._guard(db, uid)
            return self._friends(db, uid)

    def request_friend(self, uid, data):
        require(isinstance(data, dict), 'Требуется объект')
        with self.game.transaction() as db:
            self._guard(db, uid)
            peer = data.get('to_id')
            self._peer(db, uid, peer)
            require(peer not in self._friend_ids(db, uid), 'Вы уже друзья', 'already_friends', 409)
            existing = db.execute("SELECT 1 FROM friend_requests WHERE min(from_id,to_id)=? AND max(from_id,to_id)=? AND state='pending'", tuple(sorted((uid, peer)))).fetchone()
            if not existing:
                db.execute('INSERT INTO friend_requests VALUES (?,?,?,?,?)', (token(), uid, peer, 'pending', self.world.clock()))
            return self._friends(db, uid)

    def respond_friend(self, uid, rid, action):
        require(action in ('accept', 'dismiss'), 'Действие не найдено', 'not_found', 404)
        with self.game.transaction() as db:
            self._guard(db, uid)
            row = db.execute('SELECT * FROM friend_requests WHERE id=?', (rid,)).fetchone()
            require(row is not None, 'Запрос не найден', 'not_found', 404)
            require(row['to_id'] == uid, 'Чужой запрос в друзья', 'forbidden', 403)
            desired = 'accepted' if action == 'accept' else 'dismissed'
            require(row['state'] in ('pending', desired), 'Запрос уже обработан', 'request_closed', 409)
            if row['state'] == 'pending':
                if action == 'accept':
                    self._peer(db, uid, row['from_id'])
                    db.execute('INSERT OR IGNORE INTO friendships VALUES (?,?)', tuple(sorted((uid, row['from_id']))))
                db.execute('UPDATE friend_requests SET state=? WHERE id=?', (desired, rid))
            return self._friends(db, uid)
