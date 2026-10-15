"""Server-owned virtual card games; only a player's own hidden hand is exposed."""
from collections import Counter
import json
import hashlib
import secrets
import time

from game import bounded, nickname_key, require, token

RANKS = ('2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A')
SUITS = ('S', 'H', 'D', 'C')
RANK_VALUE = {rank: number for number, rank in enumerate(RANKS, 2)}
POKER_NAMES = ('Старшая карта', 'Пара', 'Две пары', 'Тройка', 'Стрит', 'Флеш',
               'Фулл-хаус', 'Каре', 'Стрит-флеш')
SLOT_SYMBOLS = ('cherry', 'lemon', 'bell', 'diamond', 'seven')
MIN_STAKE, MAX_STAKE = 1, 100
DURAK_RANKS = RANKS[4:]


def blackjack_value(cards):
    total = sum(11 if card[:-1] == 'A' else min(RANK_VALUE[card[:-1]], 10) for card in cards)
    aces = sum(card[:-1] == 'A' for card in cards)
    while total > 21 and aces:
        total -= 10
        aces -= 1
    return total


def poker_rank(cards):
    """Comparable category/kicker tuple; ace-low straights have a high card of 5."""
    values = sorted((RANK_VALUE[card[:-1]] for card in cards), reverse=True)
    counts = Counter(values)
    groups = sorted(((count, value) for value, count in counts.items()), reverse=True)
    flush = len({card[-1] for card in cards}) == 1
    unique = sorted(counts)
    straight = (5 if unique == [2, 3, 4, 5, 14] else unique[-1]) if (
        len(unique) == 5 and (unique == [2, 3, 4, 5, 14] or unique[-1] - unique[0] == 4)) else None
    if straight and flush:
        return (8, straight)
    if groups[0][0] == 4:
        return (7, groups[0][1], groups[1][1])
    if [group[0] for group in groups] == [3, 2]:
        return (6, groups[0][1], groups[1][1])
    if flush:
        return (5, *values)
    if straight:
        return (4, straight)
    if groups[0][0] == 3:
        return (3, groups[0][1], *sorted((v for v, n in counts.items() if n == 1), reverse=True))
    pairs = sorted((v for v, n in counts.items() if n == 2), reverse=True)
    singles = sorted((v for v, n in counts.items() if n == 1), reverse=True)
    if len(pairs) == 2:
        return (2, *pairs, *singles)
    if pairs:
        return (1, *pairs, *singles)
    return (0, *values)


def initialize_schema(db):
    db.execute('CREATE TABLE IF NOT EXISTS card_tables (id TEXT PRIMARY KEY, data TEXT NOT NULL)')
    db.execute('CREATE TABLE IF NOT EXISTS card_invitations '
               '(id TEXT PRIMARY KEY, table_id TEXT NOT NULL, from_id TEXT NOT NULL, '
               'to_id TEXT NOT NULL, state TEXT NOT NULL)')
    db.execute('CREATE INDEX IF NOT EXISTS card_invitation_recipient ON card_invitations(to_id,state)')
    db.execute('CREATE TABLE IF NOT EXISTS casino_spins '
               '(account_id TEXT NOT NULL, request_id TEXT NOT NULL, data TEXT NOT NULL, '
               'PRIMARY KEY(account_id,request_id))')


def active_card_table(db, account_id):
    # World/quiz guards may call this before the additive cards migration runs.
    if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='card_tables'").fetchone() is None:
        return None
    for row in db.execute('SELECT data FROM card_tables ORDER BY rowid DESC'):
        table = json.loads(row['data'])
        if table['state'] == 'playing' and any(player['id'] == account_id for player in table['players']):
            return {key: table[key] for key in ('id', 'title', 'game', 'state', 'host_id')}
    return None


def _stake(value):
    require(type(value) is int and MIN_STAKE <= value <= MAX_STAKE,
            f'Взнос: от {MIN_STAKE} до {MAX_STAKE} Бзинге', 'invalid_stake')
    return value


def _body(data, keys):
    require(isinstance(data, dict) and not set(data) - set(keys), 'Неверные параметры')


class CardService:
    def __init__(self, game, economy=None, clock=None, shuffle=None, slot_choice=None):
        self.game, self.economy = game, economy
        self.clock = clock or time.time
        self.shuffle = shuffle or secrets.SystemRandom().shuffle
        self.slot_choice = slot_choice or secrets.choice
        with game.transaction() as db:
            initialize_schema(db)

    def _guard(self, db, uid):
        from economy import guard
        return guard(db, uid)

    def _available(self, db, uid):
        from world import active_participant_lobby
        self._guard(db, uid)
        require(active_participant_lobby(db, uid) is None,
                'До завершения викторины участник находится на арене', 'active_match_scene', 409)
        require(active_card_table(db, uid) is None,
                'Сначала завершите карточную игру', 'active_card_game', 409)

    def _profile(self, db, uid):
        profile = self.game._profile(db, uid)
        require(profile is not None, 'Сначала создайте профиль')
        return {key: profile[key] for key in ('id', 'name', 'avatar')}

    def _load(self, db, table_id):
        require(isinstance(table_id, str) and 1 <= len(table_id) <= 100, 'Неверная комната')
        row = db.execute('SELECT data FROM card_tables WHERE id=?', (table_id,)).fetchone()
        require(row is not None, 'Комната не найдена', 'not_found', 404)
        return json.loads(row['data'])

    def _save(self, db, table):
        db.execute('INSERT OR REPLACE INTO card_tables(id,data) VALUES (?,?)',
                   (table['id'], json.dumps(table, ensure_ascii=False)))

    def _member(self, table, uid):
        return next((player for player in table['players'] if player['id'] == uid), None)

    def _summary(self, table):
        return {key: table[key] for key in ('id', 'title', 'game', 'state', 'host_id', 'stake', 'source')} | {
            'player_count': len(table['players']), 'max_players': 4}

    def _roster_visible(self, db, table):
        from world import jury_restricted
        return not any(jury_restricted(db, player['id']) for player in table['players'])

    def _roster_available(self, db, table):
        from game import GameError
        for player in table['players']:
            try:
                self._available(db, player['id'])
            except GameError:
                return False
        return True

    def _snapshot(self, db, table, uid, public_waiting=False):
        require(self._roster_visible(db, table), 'Комната временно недоступна', 'card_unavailable', 403)
        require(self._member(table, uid) is not None or
                (public_waiting and table['source'] == 'casino' and table['state'] == 'waiting'),
                'Нет доступа к комнате', 'forbidden', 403)
        revealed = table['state'] == 'finished'
        players = []
        for player in table['players']:
            visible = player['id'] == uid or revealed
            result = self._profile(db, player['id']) | {
                'card_count': len(player['cards']), 'done': player['done']}
            if visible:
                result['cards'] = player['cards'][:]
                if table['game'] == 'blackjack' and player['cards']:
                    result['score'] = blackjack_value(player['cards'])
            if 'result' in player:
                result['result'] = dict(player['result'])
            players.append(result)
        minimum = 1 if table['game'] == 'blackjack' else 2
        snapshot = self._summary(table) | {
            'players': players, 'my_id': uid, 'turn_id': table.get('turn_id'),
            'can_act': table['state'] == 'playing' and table.get('turn_id') == uid,
            'can_start': uid == table['host_id'] and table['state'] == 'waiting'
                         and minimum <= len(players) <= 4 and self._roster_available(db, table),
            'results': table.get('results', []), 'dealer': None,
            'own_hand': list((self._member(table, uid) or {}).get('cards', [])),
            'rules': ('Пять карт, один обмен, фиксированный взнос; победители делят банк.'
                      if table['game'] == 'poker' else
                      '36 карт, козырь, до шести атак за ход. Подкидывать можно ранги со стола. '
                      'Добор до шести: атакующий первым, защитник последним. Последний с картами проигрывает; '
                      'остальные делят банк. Если все вышли одновременно — ничья.'
                      if table['game'] == 'durak' else
                      'Крупье останавливается на 17. Победа — 2× взнос, ничья — возврат взноса.'),
        }
        if table['game'] == 'durak':
            d = table.get('durak', {})
            snapshot['durak'] = {key: d.get(key) for key in
                                 ('trump_card', 'trump_suit', 'attacker_id', 'defender_id', 'phase')}
            snapshot['durak'].update(
                board=[dict(pair) for pair in d.get('board', [])],
                deck_count=len(table.get('deck', [])), discard_count=len(d.get('discard', [])),
                max_attacks=d.get('max_attacks', 0), passed_ids=list(d.get('passed_ids', [])),
                finished_ids=list(d.get('finished_ids', [])),
                allowed_moves=self._durak_moves(table, uid))
        if table['game'] == 'blackjack':
            cards = table['dealer']
            snapshot['dealer'] = {'name': 'Крупье', 'card_count': len(cards),
                                  'cards': cards[:] if revealed else cards[:1]}
            if revealed:
                snapshot['dealer']['score'] = blackjack_value(cards)
        return snapshot

    def snapshot(self, uid, table_id):
        with self.game.transaction() as db:
            self._guard(db, uid)
            return self._snapshot(db, self._load(db, table_id), uid, public_waiting=True)

    def all(self, uid):
        with self.game.transaction() as db:
            self._guard(db, uid)
            tables = []
            for row in db.execute('SELECT data FROM card_tables ORDER BY rowid DESC'):
                table = json.loads(row['data'])
                if self._roster_visible(db, table) and (self._member(table, uid) is not None or (
                        table['source'] == 'casino' and table['state'] == 'waiting')):
                    tables.append(self._summary(table))
            invitations = []
            for row in db.execute("SELECT * FROM card_invitations WHERE to_id=? AND state='pending' ORDER BY rowid", (uid,)):
                table = self._load(db, row['table_id'])
                if table['state'] == 'waiting' and self._roster_visible(db, table):
                    invitations.append({'id': row['id'], 'table_id': row['table_id'],
                                        'from': self._profile(db, row['from_id']), 'state': row['state'],
                                        'title': table['title'], 'game': table['game'], 'stake': table['stake']})
            return {'tables': tables, 'invitations': invitations, 'currency': 'Бзинге',
                    'active_table_id': (active_card_table(db, uid) or {}).get('id'),
                    'stake_min': MIN_STAKE, 'stake_max': MAX_STAKE}

    def create(self, uid, data):
        _body(data, ('game', 'title', 'stake', 'source'))
        game, source = data.get('game'), data.get('source', 'casino')
        require(game in ('poker', 'blackjack', 'durak'), 'Неверная игра')
        require(source in ('deck', 'casino'), 'Неверный источник комнаты')
        stake = _stake(data.get('stake'))
        title = bounded(data.get('title', {'poker': 'Покер', 'blackjack': '21 с крупье', 'durak': 'Дурак'}[game]),
                        80, 'Название', 1)
        with self.game.transaction() as db:
            self._available(db, uid)
            if source == 'deck':
                from economy import inventory_quantity
                require(inventory_quantity(db, uid, 'cards') > 0,
                        'Для приватной комнаты нужна купленная колода', 'deck_required', 403)
            table = {'id': token(), 'title': title, 'game': game, 'source': source, 'stake': stake,
                     'host_id': uid, 'state': 'waiting', 'players': [{'id': uid, 'cards': [], 'done': False}],
                     'dealer': [], 'turn_id': None, 'results': []}
            self._save(db, table)
            return self._snapshot(db, table, uid)

    def _join(self, db, table, uid):
        self._available(db, uid)
        require(table['state'] == 'waiting', 'Состав комнаты уже зафиксирован', 'card_finished', 409)
        if self._member(table, uid) is not None:
            return
        require(len(table['players']) < 4, 'В комнате не больше четырёх игроков', 'card_capacity', 409)
        if table['source'] == 'deck':
            require(db.execute("SELECT 1 FROM card_invitations WHERE table_id=? AND to_id=? AND state='pending'",
                               (table['id'], uid)).fetchone() is not None,
                    'Нужно адресованное приглашение', 'invitation_required', 403)
        table['players'].append({'id': uid, 'cards': [], 'done': False})
        db.execute("UPDATE card_invitations SET state='accepted' WHERE table_id=? AND to_id=? AND state='pending'",
                   (table['id'], uid))

    def _invite(self, db, table, uid, data):
        _body(data, ('to_id', 'to_name'))
        require(uid == table['host_id'], 'Приглашает только создатель комнаты', 'forbidden', 403)
        self._available(db, uid)
        require(table['state'] == 'waiting', 'Игра уже началась', 'card_finished', 409)
        target = data.get('to_id')
        if target is None:
            name = bounded(data.get('to_name'), 32, 'Ник', 1)
            found = [row['id'] for row in db.execute('SELECT id,profile FROM accounts WHERE profile IS NOT NULL')
                     if nickname_key(json.loads(row['profile'])['name']) == nickname_key(name)]
            require(len(found) == 1, 'По этому нику игрок не найден однозначно', 'not_found', 404)
            target = found[0]
        require(isinstance(target, str), 'Неверный игрок')
        self._available(db, target)
        require(self._member(table, target) is None, 'Игрок уже в комнате')
        existing = db.execute("SELECT id FROM card_invitations WHERE table_id=? AND to_id=? AND state='pending'",
                              (table['id'], target)).fetchone()
        if existing is None:
            db.execute('INSERT INTO card_invitations(id,table_id,from_id,to_id,state) VALUES (?,?,?,?,?)',
                       (token(), table['id'], uid, target, 'pending'))

    def respond_invitation(self, uid, invitation_id, action):
        require(action in ('accept', 'dismiss'), 'Неверное действие')
        require(isinstance(invitation_id, str), 'Неверное приглашение')
        with self.game.transaction() as db:
            self._guard(db, uid)
            invitation = db.execute('SELECT * FROM card_invitations WHERE id=?', (invitation_id,)).fetchone()
            require(invitation is not None, 'Приглашение не найдено', 'not_found', 404)
            require(invitation['to_id'] == uid, 'Приглашение адресовано другому игроку', 'forbidden', 403)
            table = self._load(db, invitation['table_id'])
            desired = 'accepted' if action == 'accept' else 'dismissed'
            require(invitation['state'] in ('pending', desired), 'Приглашение уже закрыто', 'invitation_closed', 409)
            if action == 'accept':
                if invitation['state'] == 'pending':
                    self._join(db, table, uid)
                    self._save(db, table)
                return self._snapshot(db, table, uid)
            db.execute("UPDATE card_invitations SET state='dismissed' WHERE id=?", (invitation_id,))
            return {'id': invitation_id, 'table_id': table['id'], 'state': 'dismissed'}

    def _presence(self, db, uid, table_id, scene):
        from world import CITY_SPAWN
        row = db.execute('SELECT scene,scene_id FROM presence WHERE account_id=?', (uid,)).fetchone()
        if scene == 'city' and row and (row['scene'] != 'cards' or row['scene_id'] != table_id):
            return
        x, y = CITY_SPAWN if scene == 'city' else (600, 510)
        db.execute('INSERT INTO presence(account_id,x,y,scene,scene_id,updated) VALUES (?,?,?,?,?,?) '
                   'ON CONFLICT(account_id) DO UPDATE SET '
                   'x=excluded.x,y=excluded.y,scene=excluded.scene,scene_id=excluded.scene_id,updated=excluded.updated',
                   (uid, x, y, scene, table_id if scene == 'cards' else None, self.clock()))
        if 'pose' in {column['name'] for column in db.execute('PRAGMA table_info(presence)')}:
            db.execute("UPDATE presence SET pose='idle',bench_id=NULL,pose_until=NULL WHERE account_id=?", (uid,))
        if 'phone_open' in {column['name'] for column in db.execute('PRAGMA table_info(presence)')}:
            db.execute('UPDATE presence SET phone_open=0 WHERE account_id=?',(uid,))

    def _draw(self, table):
        require(bool(table['deck']), 'Колода исчерпана', 'deck_exhausted', 409)
        return table['deck'].pop(0)

    def _start(self, db, table, uid):
        require(uid == table['host_id'], 'Начинает только создатель комнаты', 'forbidden', 403)
        if table['state'] in ('playing', 'finished'):
            return
        require(table['state'] == 'waiting', 'Комната закрыта', 'card_finished', 409)
        minimum = 1 if table['game'] == 'blackjack' else 2
        require(minimum <= len(table['players']) <= 4,
                f'Для игры нужно от {minimum} до 4 игроков', 'card_capacity', 409)
        for player in table['players']:
            self._available(db, player['id'])
        from economy import change_balance, inventory_quantity
        if table['source'] == 'deck':
            require(inventory_quantity(db, uid, 'cards') > 0, 'Нужна купленная колода', 'deck_required', 403)
        for player in table['players']:
            change_balance(db, player['id'], -table['stake'], f"cards:{table['id']}:stake")
        table['state'] = 'playing'
        ranks = DURAK_RANKS if table['game'] == 'durak' else RANKS
        table['deck'] = [rank + suit for suit in SUITS for rank in ranks]
        self.shuffle(table['deck'])
        trump = table['deck'][-1] if table['game'] == 'durak' else None
        count = {'poker': 5, 'blackjack': 2, 'durak': 6}[table['game']]
        for player in table['players']:
            player['cards'] = [self._draw(table) for _ in range(count)]
            player['done'] = table['game'] == 'blackjack' and blackjack_value(player['cards']) == 21
            self._presence(db, player['id'], table['id'], 'cards')
        if table['game'] == 'blackjack':
            table['dealer'] = [self._draw(table) for _ in range(2)]
            if blackjack_value(table['dealer']) == 21:
                self._settle(db, table)
                return
        if table['game'] == 'durak':
            candidates = [(RANK_VALUE[card[:-1]], index, player['id'])
                          for index, player in enumerate(table['players'])
                          for card in player['cards'] if card[-1] == trump[-1]]
            attacker = min(candidates)[2] if candidates else table['host_id']
            table['durak'] = {'trump_card': trump, 'trump_suit': trump[-1], 'board': [], 'discard': [],
                              'finished_ids': [], 'passed_ids': [], 'phase': 'attack'}
            self._durak_round(table, attacker)
        else:
            self._next_turn(db, table)
        db.execute("UPDATE card_invitations SET state='expired' WHERE table_id=? AND state='pending'", (table['id'],))

    def _next_turn(self, db, table):
        next_player = next((player for player in table['players'] if not player['done']), None)
        table['turn_id'] = next_player['id'] if next_player else None
        if next_player is None:
            if table['game'] == 'blackjack':
                while blackjack_value(table['dealer']) < 17:
                    table['dealer'].append(self._draw(table))
            self._settle(db, table)

    def _durak_order(self, table, start):
        """Clockwise roster order, including players who just emptied a hand."""
        ids = [player['id'] for player in table['players']]
        index = ids.index(start)
        return ids[index:] + ids[:index]

    def _durak_next(self, table, uid):
        return next(other for other in self._durak_order(table, uid)[1:]
                    if not self._member(table, other)['done'])

    def _durak_round(self, table, attacker):
        defender = self._durak_next(table, attacker)
        table['durak'].update(attacker_id=attacker, defender_id=defender, phase='attack',
                              board=[], passed_ids=[],
                              max_attacks=min(6, len(self._member(table, defender)['cards'])))
        table['turn_id'] = attacker

    def _durak_attackers(self, table):
        d = table['durak']
        return [uid for uid in self._durak_order(table, d['attacker_id'])
                if uid != d['defender_id'] and not self._member(table, uid)['done']]

    def _durak_moves(self, table, uid):
        if table['state'] != 'playing' or table.get('turn_id') != uid:
            return []
        d = table['durak']
        if d['phase'] == 'defend':
            return ['defend', 'pickup']
        moves = []
        if len(d['board']) < d['max_attacks'] and self._member(table, uid)['cards']:
            moves.append('attack')
        if d['board']:
            moves.append('pass')
        return moves

    def _durak_finish_round(self, db, table):
        d = table['durak']
        attacker, defender, pickup = d['attacker_id'], d['defender_id'], d['phase'] == 'pickup'
        played = [card for pair in d['board'] for card in pair.values() if card]
        if pickup:
            self._member(table, defender)['cards'].extend(played)
        else:
            d['discard'].extend(played)
        d['board'] = []
        # The lead attacker draws first, followed clockwise by the other
        # attackers. The defender always draws last, including after pickup.
        order = self._durak_attackers(table) + [defender]
        for uid in order:
            hand = self._member(table, uid)['cards']
            while len(hand) < 6 and table['deck']:
                hand.append(self._draw(table))
        if not table['deck']:
            for uid in order:
                player = self._member(table, uid)
                if not player['cards'] and not player['done']:
                    player['done'] = True
                    d['finished_ids'].append(uid)
        active = [player['id'] for player in table['players'] if not player['done']]
        if len(active) <= 1:
            self._settle(db, table)
            return
        next_attacker = (defender if not pickup and defender in active else self._durak_next(table, defender))
        self._durak_round(table, next_attacker)

    def _durak_pass_turn(self, db, table):
        d = table['durak']
        available = [uid for uid in self._durak_attackers(table) if uid not in d['passed_ids']]
        if available:
            table['turn_id'] = available[0]
        else:
            self._durak_finish_round(db, table)

    def _durak_act(self, db, table, uid, data):
        _body(data, ('move', 'card_index', 'attack_index'))
        require(table['state'] == 'playing', 'Карточная игра завершена или не начата', 'card_finished', 409)
        player = self._member(table, uid)
        require(player is not None, 'Нет доступа к комнате', 'forbidden', 403)
        require(table['turn_id'] == uid, 'Сейчас ход другого игрока', 'card_turn', 409)
        d, move = table['durak'], data.get('move')
        require(move in ('attack', 'defend', 'pickup', 'pass'), 'Неверное действие', 'invalid_move')
        if move == 'attack':
            require(d['phase'] in ('attack', 'pickup') and uid != d['defender_id'],
                    'Сейчас требуется защита', 'invalid_move', 409)
            require('attack_index' not in data, 'Для атаки не нужно выбирать карту стола')
            require(len(d['board']) < d['max_attacks'], 'Достигнут предел атак за ход', 'attack_limit', 409)
        elif move == 'defend':
            require(d['phase'] == 'defend' and uid == d['defender_id'], 'Сейчас ход атакующего', 'invalid_move', 409)
        else:
            require('card_index' not in data and 'attack_index' not in data, 'Для этого действия карта не нужна')
            require(move in self._durak_moves(table, uid), 'Сейчас это действие недоступно', 'invalid_move', 409)
        if move in ('attack', 'defend'):
            index = data.get('card_index')
            require(type(index) is int and 0 <= index < len(player['cards']), 'Выберите свою карту', 'invalid_card')
            card = player['cards'][index]
            if move == 'attack':
                ranks = {c[:-1] for pair in d['board'] for c in pair.values() if c}
                require(not ranks or card[:-1] in ranks, 'Подкинуть можно только ранг со стола', 'invalid_attack', 409)
                player['cards'].pop(index)
                d['board'].append({'attack': card, 'defense': None})
                d['passed_ids'] = []
                if d['phase'] == 'pickup':
                    self._durak_pass_turn(db, table)
                else:
                    d['phase'], table['turn_id'] = 'defend', d['defender_id']
            else:
                target = data.get('attack_index')
                require(type(target) is int and 0 <= target < len(d['board']) and
                        d['board'][target]['defense'] is None, 'Выберите непокрытую атаку', 'invalid_attack_index')
                attack = d['board'][target]['attack']
                beats = (card[-1] == attack[-1] and RANK_VALUE[card[:-1]] > RANK_VALUE[attack[:-1]]) or (
                    card[-1] == d['trump_suit'] and attack[-1] != d['trump_suit'])
                require(beats, 'Нужна старшая карта той же масти или козырь', 'invalid_defense', 409)
                d['board'][target]['defense'] = player['cards'].pop(index)
                if all(pair['defense'] for pair in d['board']):
                    d['phase'] = 'attack'
                    self._durak_pass_turn(db, table)
        elif move == 'pickup':
            d['phase'], d['passed_ids'] = 'pickup', []
            self._durak_pass_turn(db, table)
        else:
            d['passed_ids'].append(uid)
            self._durak_pass_turn(db, table)

    def _settle(self, db, table):
        if table['state'] == 'finished':
            return
        from economy import change_balance, record_event
        payouts = {}
        winners, draw = [], False
        if table['game'] in ('poker', 'durak'):
            if table['game'] == 'poker':
                ranks = {player['id']: poker_rank(player['cards']) for player in table['players']}
                best = max(ranks.values())
                winners = [player['id'] for player in table['players'] if ranks[player['id']] == best]
            else:
                winners = [player['id'] for player in table['players'] if not player['cards']]
                draw = len(winners) == len(table['players'])
            share, remainder = divmod(table['stake'] * len(table['players']), len(winners))
            # A stable lottery based on the server-generated room id avoids
            # permanently favouring the host or the first player to join.
            odd_chip_order = sorted(winners, key=lambda uid: hashlib.sha256(f"{table['id']}:{uid}".encode()).digest())
            payouts = {uid: share + (index < remainder) for index, uid in enumerate(odd_chip_order)}
        else:
            dealer_score = blackjack_value(table['dealer'])
            dealer_natural = len(table['dealer']) == 2 and dealer_score == 21
            for player in table['players']:
                score = blackjack_value(player['cards'])
                natural = len(player['cards']) == 2 and score == 21
                if score > 21 or (dealer_natural and not natural):
                    payout = 0
                elif natural and not dealer_natural:
                    payout = table['stake'] * 2
                elif dealer_score > 21 or score > dealer_score:
                    payout = table['stake'] * 2
                elif score == dealer_score:
                    payout = table['stake']
                else:
                    payout = 0
                payouts[player['id']] = payout
        results = []
        for player in table['players']:
            uid, payout = player['id'], int(payouts.get(player['id'], 0))
            result = {'id': uid, 'payout': payout, 'net': payout - table['stake'],
                      'outcome': ('win' if payout > table['stake'] else 'push' if payout == table['stake'] else 'lose')}
            if table['game'] == 'durak':
                result['outcome'] = 'push' if draw else 'win' if uid in winners else 'lose'
            if table['game'] == 'poker':
                rank = poker_rank(player['cards'])
                result.update(combination=POKER_NAMES[rank[0]], rank=list(rank))
            elif table['game'] == 'blackjack':
                result['score'] = blackjack_value(player['cards'])
            if payout:
                change_balance(db, uid, payout, f"cards:{table['id']}:payout")
            if table['game'] == 'durak':
                record_event(db, uid, 'firstdurak', self.clock())
            hand_winner = table['game'] == 'poker' and uid in winners and len(winners) < len(table['players'])
            if result['outcome'] == 'win' or hand_winner:
                record_event(db, uid, 'cardwin', self.clock())
            player['result'] = result
            player['done'] = True
            results.append(result)
            self._presence(db, uid, table['id'], 'city')
        table.update(state='finished', turn_id=None, results=results)
        # Discard the unopened deck after settlement; only revealed hands survive.
        table.pop('deck', None)
        db.execute("UPDATE card_invitations SET state='expired' WHERE table_id=? AND state='pending'", (table['id'],))

    def _act(self, db, table, uid, data):
        if table['game'] == 'durak':
            self._durak_act(db, table, uid, data)
            return
        _body(data, ('move', 'indices'))
        require(table['state'] == 'playing', 'Карточная игра завершена или не начата', 'card_finished', 409)
        player = self._member(table, uid)
        require(player is not None, 'Нет доступа к комнате', 'forbidden', 403)
        require(table['turn_id'] == uid, 'Сейчас ход другого игрока', 'card_turn', 409)
        move = data.get('move')
        if table['game'] == 'poker':
            require(move in ('exchange', 'keep'), 'Доступен один обмен или сохранение карт')
            if move == 'exchange':
                indices = data.get('indices')
                require(isinstance(indices, list) and 1 <= len(indices) <= 5
                        and all(type(index) is int and 0 <= index <= 4 for index in indices)
                        and len(set(indices)) == len(indices), 'Выберите от одной до пяти разных карт')
                for index in sorted(indices):
                    player['cards'][index] = self._draw(table)
            else:
                require(not data.get('indices'), 'Для сохранения карт обмен не нужен')
            player['done'] = True
        else:
            require(move in ('hit', 'stand') and 'indices' not in data, 'Можно взять карту или остановиться')
            if move == 'hit':
                player['cards'].append(self._draw(table))
                player['done'] = blackjack_value(player['cards']) >= 21
            else:
                player['done'] = True
        self._next_turn(db, table)

    def mutate(self, uid, table_id, action, data=None):
        data = {} if data is None else data
        require(isinstance(data, dict), 'Требуется объект')
        with self.game.transaction() as db:
            self._guard(db, uid)
            table = self._load(db, table_id)
            if action == 'join':
                _body(data, ())
                self._join(db, table, uid)
            elif action == 'invite':
                self._invite(db, table, uid, data)
            elif action == 'start':
                _body(data, ())
                self._start(db, table, uid)
            elif action == 'act':
                self._act(db, table, uid, data)
            elif action == 'leave':
                _body(data, ())
                require(self._member(table, uid) is not None, 'Нет доступа к комнате', 'forbidden', 403)
                require(table['state'] != 'playing', 'Сначала завершите игру', 'active_card_game', 409)
                if table['state'] == 'waiting':
                    if uid == table['host_id']:
                        table['state'] = 'cancelled'
                        db.execute("UPDATE card_invitations SET state='expired' WHERE table_id=? AND state='pending'", (table_id,))
                    else:
                        table['players'] = [player for player in table['players'] if player['id'] != uid]
                        self._save(db, table)
                        return {'id': table_id, 'state': 'left'}
            else:
                require(False, 'Неизвестное действие', 'not_found', 404)
            self._save(db, table)
            return self._snapshot(db, table, uid)

    def slots(self, uid, data):
        _body(data, ('stake', 'request_id'))
        stake = _stake(data.get('stake'))
        request_id = data.get('request_id')
        require(isinstance(request_id, str) and request_id.isascii() and 1 <= len(request_id) <= 80
                and all(character.isalnum() or character in '-_:' for character in request_id), 'Неверный номер запроса')
        with self.game.transaction() as db:
            self._available(db, uid)
            existing = db.execute('SELECT data FROM casino_spins WHERE account_id=? AND request_id=?',
                                  (uid, request_id)).fetchone()
            if existing:
                result = json.loads(existing['data'])
                require(result['stake'] == stake, 'Этот номер запроса использован с другим взносом', 'reference_conflict', 409)
                return result
            from economy import change_balance
            balance = change_balance(db, uid, -stake, f'slots:{request_id}:stake')
            reels = [self.slot_choice(SLOT_SYMBOLS) for _ in range(3)]
            counts = Counter(reels)
            multiplier = (5 if reels == ['seven'] * 3 else 3) if len(counts) == 1 else 1 if len(counts) == 2 else 0
            payout = stake * multiplier
            if payout:
                balance = change_balance(db, uid, payout, f'slots:{request_id}:payout')
            result = {'request_id': request_id, 'stake': stake, 'reels': reels, 'payout': payout,
                      'net': payout - stake, 'balance': balance, 'currency': 'Бзинге'}
            db.execute('INSERT INTO casino_spins(account_id,request_id,data) VALUES (?,?,?)',
                       (uid, request_id, json.dumps(result, ensure_ascii=False)))
            return result
