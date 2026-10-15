import importlib.util
import hashlib
import json
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from game import GameError, GameService
from world import WorldService

try:
    from cards import blackjack_value, poker_rank
except ImportError:
    blackjack_value = poker_rank = None


class CardServiceTests(unittest.TestCase):
    def setUp(self):
        import cards
        self.assertTrue(callable(getattr(cards, 'CardService', None)), 'Persistent card service is required')
        self.assertIsNotNone(importlib.util.find_spec('economy'), 'Shared wallet is required')
        from economy import EconomyService, change_balance
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.g = GameService(Path(self.tmp.name) / 'cards.db')
        self.now = 1000
        self.w = WorldService(self.g, clock=lambda: self.now)
        self.e = EconomyService(self.g, self.w)
        self.users = [self.g.create_account() for _ in range(5)]
        for index, uid in enumerate(self.users):
            self.g.profile(uid, {'name': f'Player {index}', 'avatar': {'skin': index}})
        self.a, self.b, self.c, self.d, self.other = self.users
        with self.g.transaction() as db:
            for uid in self.users:
                change_balance(db, uid, 500, 'test:fund')
        self.service = cards.CardService(self.g, self.e, clock=lambda: self.now)

    def balance(self, uid):
        return self.e.snapshot(uid)['balance']

    def denied(self, fn, *args, code=None):
        with self.assertRaises(GameError) as error:
            fn(*args)
        if code:
            self.assertEqual(error.exception.code, code)

    def room(self, game='poker', players=2, stake=10, source='casino'):
        if source == 'deck':
            self.e.buy(self.a, {'item_id': 'cards'})
        room = self.service.create(self.a, {'game': game, 'title': 'Cards', 'stake': stake, 'source': source})
        for uid in self.users[1:players]:
            if source == 'deck':
                self.service.mutate(self.a, room['id'], 'invite', {'to_id': uid})
                invitation = self.service.all(uid)['invitations'][-1]
                self.service.respond_invitation(uid, invitation['id'], 'accept')
            else:
                self.service.mutate(uid, room['id'], 'join', {})
        return room['id']

    def rig_deck(self, beginning):
        def shuffle(deck):
            deck[:] = beginning + [card for card in deck if card not in beginning]
        self.service.shuffle = shuffle

    def test_deck_room_requires_purchase_and_private_addressed_acceptance(self):
        self.denied(self.service.create, self.a,
                    {'game': 'poker', 'title': 'Private', 'stake': 10, 'source': 'deck'}, code='deck_required')
        table = self.room(players=1, source='deck')
        self.assertNotIn(table, [row['id'] for row in self.service.all(self.b)['tables']])
        self.denied(self.service.snapshot, self.b, table, code='forbidden')
        self.denied(self.service.mutate, self.b, table, 'join', {}, code='invitation_required')
        self.service.mutate(self.a, table, 'invite', {'to_name': 'Player 1'})
        invite = self.service.all(self.b)['invitations'][0]
        self.assertEqual(invite['from']['id'], self.a)
        self.denied(self.service.respond_invitation, self.c, invite['id'], 'accept', code='forbidden')
        self.service.respond_invitation(self.b, invite['id'], 'accept')
        accepted = self.service.respond_invitation(self.b, invite['id'], 'accept')
        self.assertEqual(len(accepted['players']), 2)
        self.assertEqual(accepted['players'][1]['name'], 'Player 1')
        self.assertEqual(accepted['players'][1]['avatar']['skin'], 1)
        self.service.mutate(self.a, table, 'invite', {'to_id': self.c})
        invite2 = self.service.all(self.c)['invitations'][0]
        self.service.respond_invitation(self.c, invite2['id'], 'dismiss')
        self.assertEqual(self.service.all(self.c)['invitations'], [])
        self.denied(self.service.respond_invitation, self.c, invite2['id'], 'accept', code='invitation_closed')

    def test_host_capacity_waiting_leave_and_start_guards(self):
        table = self.room(players=1)
        self.assertFalse(self.service.snapshot(self.a, table)['can_start'])
        self.denied(self.service.mutate, self.a, table, 'start', {}, code='card_capacity')
        self.denied(self.service.mutate, self.b, table, 'invite', {'to_id': self.c}, code='forbidden')
        self.service.mutate(self.b, table, 'join', {})
        self.denied(self.service.mutate, self.b, table, 'start', {}, code='forbidden')
        self.service.mutate(self.b, table, 'leave', {})
        self.assertEqual(len(self.service.snapshot(self.a, table)['players']), 1)
        for uid in (self.b, self.c, self.d):
            self.service.mutate(uid, table, 'join', {})
        self.denied(self.service.mutate, self.other, table, 'join', {}, code='card_capacity')
        self.service.mutate(self.a, table, 'leave', {})
        self.assertEqual(self.service.snapshot(self.a, table)['state'], 'cancelled')

    def test_start_bets_presence_once_and_rollback_if_any_member_lacks_funds(self):
        table = self.room(stake=100)
        from economy import change_balance
        with self.g.transaction() as db:
            change_balance(db, self.b, -450, 'test:poor')
        self.denied(self.service.mutate, self.a, table, 'start', {}, code='insufficient_funds')
        self.assertEqual(self.balance(self.a), 500)
        self.assertEqual(self.service.snapshot(self.a, table)['state'], 'waiting')
        with self.g.transaction() as db:
            change_balance(db, self.b, 100, 'test:enough')
        self.service.mutate(self.a, table, 'start', {})
        again = self.service.mutate(self.a, table, 'start', {})
        self.assertEqual(again['state'], 'playing')
        self.assertEqual(self.balance(self.a), 400)
        self.assertEqual(self.balance(self.b), 50)
        from cards import active_card_table
        with self.g.transaction() as db:
            self.assertEqual(active_card_table(db, self.a)['id'], table)
            for uid in (self.a, self.b):
                row = db.execute('SELECT scene,scene_id FROM presence WHERE account_id=?', (uid,)).fetchone()
                self.assertEqual(dict(row), {'scene': 'cards', 'scene_id': table})
        self.denied(self.service.mutate, self.a, table, 'leave', {}, code='active_card_game')
        self.denied(self.service.slots, self.a, {'stake': 1, 'request_id': 'while-cards'}, code='active_card_game')

    def test_poker_turn_private_hands_one_exchange_and_reveal_only_after_finish(self):
        table = self.room()
        self.rig_deck(['AS', 'AD', '9H', '5C', '3D', 'KS', 'KD', '8H', '4C', '2D', 'AH'])
        started = self.service.mutate(self.a, table, 'start', {})
        self.assertEqual(started['turn_id'], self.a)
        self.assertEqual(started['players'][0]['cards'], ['AS', 'AD', '9H', '5C', '3D'])
        self.assertNotIn('cards', started['players'][1])
        self.assertNotIn('deck', started)
        self.denied(self.service.snapshot, self.other, table, code='forbidden')
        self.denied(self.service.mutate, self.b, table, 'act', {'move': 'keep'}, code='card_turn')
        for indices in ([0, 0], [True], [5], '0'):
            self.denied(self.service.mutate, self.a, table, 'act', {'move': 'exchange', 'indices': indices})
        exchanged = self.service.mutate(self.a, table, 'act', {'move': 'exchange', 'indices': [4]})
        self.assertEqual(exchanged['players'][0]['cards'][-1], 'AH')
        self.assertEqual(exchanged['turn_id'], self.b)
        self.denied(self.service.mutate, self.a, table, 'act', {'move': 'keep'}, code='card_turn')
        finished = self.service.mutate(self.b, table, 'act', {'move': 'keep'})
        self.assertEqual(finished['state'], 'finished')
        self.assertIn('cards', finished['players'][1])
        self.assertEqual(self.balance(self.a), 510)
        self.assertEqual(self.balance(self.b), 490)
        self.assertEqual(finished['players'][0]['result']['combination'], 'Тройка')
        self.denied(self.service.mutate, self.b, table, 'act', {'move': 'keep'}, code='card_finished')
        self.assertEqual(self.balance(self.a), 510)
        from world import CITY_SPAWN
        with self.g.transaction() as db:
            for uid in (self.a, self.b):
                row = db.execute('SELECT x,y,scene,scene_id FROM presence WHERE account_id=?', (uid,)).fetchone()
                self.assertEqual((row['x'], row['y']), CITY_SPAWN)
                self.assertEqual((row['scene'], row['scene_id']), ('city', None))

    def test_poker_tied_pot_split_conserves_total_with_deterministic_remainder(self):
        table = self.room(players=3, stake=1)
        # Choose a persisted test-room id whose fair odd-chip order favours the
        # second winner. This catches a permanent host/join-order advantage.
        fair_id = table
        while hashlib.sha256(f'{fair_id}:{self.a}'.encode()).digest() < hashlib.sha256(f'{fair_id}:{self.b}'.encode()).digest():
            fair_id += 'x'
        with self.g.transaction() as db:
            room = json.loads(db.execute('SELECT data FROM card_tables WHERE id=?', (table,)).fetchone()['data'])
            room['id'] = fair_id
            db.execute('UPDATE card_tables SET id=?,data=? WHERE id=?', (fair_id, json.dumps(room), table))
        table = fair_id
        self.rig_deck(['AS', 'KD', 'QH', 'JC', '10D',
                       'AH', 'KC', 'QS', 'JD', '10S',
                       '2S', '4D', '6H', '8C', '9D'])
        self.service.mutate(self.a, table, 'start', {})
        for uid in (self.a, self.b, self.c):
            result = self.service.mutate(uid, table, 'act', {'move': 'keep'})
        self.assertEqual([row['payout'] for row in result['results']], [1, 2, 0])
        self.assertEqual(sum(self.balance(uid) for uid in (self.a, self.b, self.c)), 1500)
        reloaded = type(self.service)(GameService(self.g.db_path), self.e)
        self.assertEqual(reloaded.snapshot(self.b, table)['results'], result['results'])

    def test_blackjack_server_dealer_private_card_payouts_and_soft17(self):
        table = self.room(game='blackjack', players=2)
        self.rig_deck(['AS', 'KH', '10S', '9H', 'AD', '6C'])
        started = self.service.mutate(self.a, table, 'start', {})
        self.assertEqual(started['turn_id'], self.b)
        self.assertEqual(started['dealer']['cards'], ['AD'])
        self.assertNotIn('score', started['dealer'])
        self.assertNotIn('cards', started['players'][1])
        self.assertEqual(started['players'][0]['score'], 21)
        finished = self.service.mutate(self.b, table, 'act', {'move': 'stand'})
        self.assertEqual(finished['dealer']['score'], 17)
        self.assertEqual(len(finished['dealer']['cards']), 2)
        self.assertEqual([row['payout'] for row in finished['results']], [20, 20])
        self.assertEqual(self.balance(self.a), 510)

    def test_blackjack_hit_bust_dealer_draw_and_push(self):
        table = self.room(game='blackjack', players=2)
        self.rig_deck(['10S', '7H', '10D', '8C', '9S', '6H', 'KS', '3C'])
        self.service.mutate(self.a, table, 'start', {})
        busted = self.service.mutate(self.a, table, 'act', {'move': 'hit'})
        self.assertEqual(busted['turn_id'], self.b)
        self.assertEqual(busted['players'][0]['score'], 27)
        finished = self.service.mutate(self.b, table, 'act', {'move': 'stand'})
        self.assertEqual(finished['dealer']['score'], 18)
        self.assertEqual([row['payout'] for row in finished['results']], [0, 10])
        self.assertEqual(self.balance(self.a), 490)
        self.assertEqual(self.balance(self.b), 500)

    def test_blackjack_natural_dealer_finishes_and_pushes_natural_player(self):
        table = self.room(game='blackjack', players=2)
        self.rig_deck(['AS', 'KH', '10D', '8C', 'AH', 'KS'])
        finished = self.service.mutate(self.a, table, 'start', {})
        self.assertEqual(finished['state'], 'finished')
        self.assertEqual([row['payout'] for row in finished['results']], [10, 0])
        self.assertEqual(self.balance(self.a), 500)
        self.assertEqual(self.balance(self.b), 490)
        repeated = self.service.mutate(self.a, table, 'start', {})
        self.assertEqual(repeated['results'], finished['results'])
        self.assertEqual(self.balance(self.b), 490)

    def test_quiz_and_unfinished_jury_blackout_cards_start_and_slots(self):
        table = self.room(players=2)
        lid = self.g.create_lobby(self.c, {'title': 'Quiz', 'mode': 'individual'})['id']
        codes = self.g.snapshot(self.c, lid)
        self.g.join(self.b, codes['player_code'])
        self.g.join(self.d, codes['jury_code'])
        self.g.mutate(self.c, lid, 'start', {})
        self.denied(self.service.mutate, self.a, table, 'start', {}, code='active_match_scene')
        self.assertEqual(self.balance(self.a), 500)
        self.denied(self.service.slots, self.b, {'stake': 1, 'request_id': 'quiz'}, code='active_match_scene')
        for method, args in ((self.service.all, (self.d,)),
                             (self.service.create, (self.d, {'game': 'blackjack', 'title': 'Denied', 'stake': 1, 'source': 'casino'})),
                             (self.service.slots, (self.d, {'stake': 1, 'request_id': 'jury'}))):
            self.denied(method, *args, code='jury_restricted')

    def test_other_active_table_prevents_roster_start_atomically(self):
        waiting = self.room()
        solo = self.service.create(self.b, {'game': 'blackjack', 'title': 'Solo', 'stake': 5, 'source': 'casino'})['id']
        self.rig_deck(['9S', '7H', '10D', '8C'])
        self.service.mutate(self.b, solo, 'start', {})
        self.denied(self.service.mutate, self.a, waiting, 'start', {}, code='active_card_game')
        self.assertEqual(self.balance(self.a), 500)
        self.assertEqual(self.service.snapshot(self.a, waiting)['state'], 'waiting')

    def test_slots_same_nonce_concurrent_replay_and_rejection_of_changed_stake(self):
        self.service.slot_choice = lambda symbols: 'seven'
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: self.service.slots(self.a, {'stake': 10, 'request_id': 'nonce-1'}), range(2)))
        self.assertEqual(results[0], results[1])
        self.assertEqual(results[0]['reels'], ['seven'] * 3)
        self.assertEqual(results[0]['payout'], 50)
        self.assertEqual(self.balance(self.a), 540)
        self.denied(self.service.slots, self.a, {'stake': 11, 'request_id': 'nonce-1'}, code='reference_conflict')
        self.assertEqual(self.balance(self.a), 540)
        self.service.slots(self.b, {'stake': 10, 'request_id': 'nonce-1'})
        self.assertEqual(self.balance(self.b), 540)

    def test_slots_pair_loses_nothing_and_no_match_loses_stake(self):
        sequence = iter(['cherry', 'cherry', 'bell', 'cherry', 'lemon', 'bell'])
        self.service.slot_choice = lambda symbols: next(sequence)
        pair = self.service.slots(self.a, {'stake': 7, 'request_id': 'pair'})
        self.assertEqual((pair['payout'], pair['net'], pair['balance']), (7, 0, 500))
        loss = self.service.slots(self.a, {'stake': 7, 'request_id': 'loss'})
        self.assertEqual((loss['payout'], loss['net'], loss['balance']), (0, -7, 493))
        for value in (0, 101, True, 1.1, '10'):
            self.denied(self.service.slots, self.a, {'stake': value, 'request_id': 'bad-stake'})
        self.denied(self.service.slots, self.a, {'stake': 1, 'request_id': ''})
        self.denied(self.service.slots, self.a, {'stake': 1, 'request_id': 'cheat', 'payout': 500})

    def test_new_jury_assignment_hides_existing_waiting_room_and_sender(self):
        table = self.room(players=1)
        self.service.mutate(self.a, table, 'invite', {'to_id': self.b})
        self.assertEqual(len(self.service.all(self.b)['invitations']), 1)
        duty = self.g.create_lobby(self.c, {'title': 'Jury', 'mode': 'individual'})['id']
        self.g.join(self.a, self.g.snapshot(self.c, duty)['jury_code'])
        self.assertNotIn(table, [row['id'] for row in self.service.all(self.b)['tables']])
        self.assertEqual(self.service.all(self.b)['invitations'], [])
        self.denied(self.service.snapshot, self.b, table, code='card_unavailable')

    def test_member_new_jury_assignment_hides_roster_from_other_players(self):
        table = self.room(players=2)
        duty = self.g.create_lobby(self.c, {'title': 'Jury', 'mode': 'individual'})['id']
        self.g.join(self.b, self.g.snapshot(self.c, duty)['jury_code'])
        self.assertEqual(self.service.all(self.a)['tables'], [])
        self.denied(self.service.snapshot, self.a, table, code='card_unavailable')

    def test_waiting_host_cannot_invite_after_becoming_active_quiz_participant(self):
        table = self.room(players=1)
        quiz = self.g.create_lobby(self.c, {'title': 'Quiz', 'mode': 'individual'})['id']
        codes = self.g.snapshot(self.c, quiz)
        self.g.join(self.a, codes['player_code'])
        self.g.join(self.d, codes['jury_code'])
        self.g.mutate(self.c, quiz, 'start', {})
        self.denied(self.service.mutate, self.a, table, 'invite', {'to_id': self.b}, code='active_match_scene')

    def test_slots_insufficient_balance_and_restart_preserve_atomic_response(self):
        from economy import change_balance
        with self.g.transaction() as db:
            change_balance(db, self.a, -500, 'test:empty')
        self.denied(self.service.slots, self.a, {'stake': 1, 'request_id': 'poor'}, code='insufficient_funds')
        with self.g.transaction() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM casino_spins').fetchone()[0], 0)
            change_balance(db, self.a, 1, 'test:new-fund')
        self.service.slot_choice = lambda symbols: 'bell'
        result = self.service.slots(self.a, {'stake': 1, 'request_id': 'poor'})
        reloaded = type(self.service)(GameService(self.g.db_path), self.e)
        self.assertEqual(reloaded.slots(self.a, {'stake': 1, 'request_id': 'poor'}), result)
        self.assertEqual(self.balance(self.a), 3)

    def test_presence_extra_columns_pose_clear_without_profile_reset_and_concurrent_start(self):
        table = self.room()
        with self.g.transaction() as db:
            columns = {row['name'] for row in db.execute('PRAGMA table_info(presence)')}
            for column, definition in (('pose', "TEXT NOT NULL DEFAULT 'idle'"),
                                       ('bench_id', 'TEXT'), ('pose_until', 'REAL NOT NULL DEFAULT 0')):
                if column not in columns:
                    db.execute(f'ALTER TABLE presence ADD COLUMN {column} {definition}')
            db.execute('INSERT OR REPLACE INTO presence(account_id,x,y,scene,scene_id,updated,pose,bench_id,pose_until) '
                       'VALUES (?,?,?,?,?,?,?,?,?)', (self.a, 100, 100, 'city', None, self.now, 'sit', 'bench', 2000))
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: self.service.mutate(self.a, table, 'start', {}), range(2)))
        self.assertEqual(results[0], results[1])
        with self.g.transaction() as db:
            row = db.execute('SELECT pose,bench_id,pose_until FROM presence WHERE account_id=?', (self.a,)).fetchone()
            self.assertEqual(dict(row), {'pose': 'idle', 'bench_id': None, 'pose_until': None})
        self.assertEqual(self.balance(self.a), 490)
        self.assertEqual(self.g.bootstrap(self.a)['profile']['avatar']['skin'], 0)


class CardRulesTests(unittest.TestCase):
    def test_poker_categories_kickers_and_ace_low_straight(self):
        self.assertTrue(callable(poker_rank), 'Server poker evaluator is required')
        hands = [
            ['AS', 'KD', '9H', '5C', '3D'],
            ['AS', 'AD', '9H', '5C', '3D'],
            ['AS', 'AD', '9H', '9C', '3D'],
            ['AS', 'AD', 'AH', '5C', '3D'],
            ['AS', '2D', '3H', '4C', '5D'],
            ['AS', 'JS', '9S', '5S', '3S'],
            ['AS', 'AD', 'AH', '5C', '5D'],
            ['AS', 'AD', 'AH', 'AC', '3D'],
            ['9S', '10S', 'JS', 'QS', 'KS'],
        ]
        ranks = [poker_rank(hand) for hand in hands]
        self.assertEqual([rank[0] for rank in ranks], list(range(9)))
        self.assertEqual(sorted(ranks), ranks)
        self.assertEqual(poker_rank(hands[4]), (4, 5))
        self.assertGreater(poker_rank(['2S', '3D', '4H', '5C', '6D']), ranks[4])
        self.assertGreater(poker_rank(['AS', 'AD', 'KH', '5C', '3D']), ranks[1])
        self.assertEqual(poker_rank(['AS', 'AD', '9H', '5C', '3D']),
                         poker_rank(['AH', 'AC', '9D', '5S', '3H']))

    def test_blackjack_aces_and_face_cards(self):
        self.assertTrue(callable(blackjack_value), 'Server blackjack evaluator is required')
        self.assertEqual(blackjack_value(['AS', 'AH']), 12)
        self.assertEqual(blackjack_value(['AS', 'AH', '9S']), 21)
        self.assertEqual(blackjack_value(['AS', '9H', '5S']), 15)
        self.assertEqual(blackjack_value(['KS', 'QH', '2S']), 22)


if __name__ == '__main__':
    unittest.main()
