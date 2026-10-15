import json
import random
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from cards import CardService, RANK_VALUE, SUITS, active_card_table
from economy import EconomyService, change_balance
from game import GameError, GameService
from world import CITY_SPAWN, WorldService


class DurakTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.g = GameService(Path(self.tmp.name) / 'durak.db')
        self.now = 1000
        self.w = WorldService(self.g, clock=lambda: self.now)
        self.e = EconomyService(self.g, self.w)
        self.users = [self.g.create_account() for _ in range(5)]
        for index, uid in enumerate(self.users):
            self.g.profile(uid, {'name': f'Durak {index}', 'avatar': {'skin': index}})
        self.a, self.b, self.c, self.d, self.other = self.users
        with self.g.transaction() as db:
            for uid in self.users:
                change_balance(db, uid, 500, 'test:fund')
        self.service = CardService(self.g, self.e, clock=lambda: self.now)
        self.service.shuffle = random.Random(17).shuffle

    def denied(self, fn, *args, code=None, **kwargs):
        with self.assertRaises(GameError) as error:
            fn(*args, **kwargs)
        if code:
            self.assertEqual(error.exception.code, code)

    def room(self, players=2, stake=10, source='casino'):
        if source == 'deck':
            self.e.buy(self.a, {'item_id': 'cards'})
        table = self.service.create(self.a, {'game': 'durak', 'title': 'Дурак', 'stake': stake, 'source': source})['id']
        for uid in self.users[1:players]:
            if source == 'deck':
                self.service.mutate(self.a, table, 'invite', {'to_id': uid})
                self.service.respond_invitation(uid, self.service.all(uid)['invitations'][0]['id'], 'accept')
            else:
                self.service.mutate(uid, table, 'join', {})
        return table

    def raw(self, table):
        with self.g.transaction() as db:
            return json.loads(db.execute('SELECT data FROM card_tables WHERE id=?', (table,)).fetchone()['data'])

    def rig(self, hands, trump='AC'):
        first = [card for hand in hands for card in hand]
        def shuffle(deck):
            deck[:] = first + [card for card in deck if card not in first and card != trump] + [trump]
        self.service.shuffle = shuffle

    def endgame(self, table, hands, deck=None, attacker=None, defender=None, trump='C'):
        # Targeted late-round fixtures use the same persisted shape as a real deal.
        with self.g.transaction() as db:
            t = json.loads(db.execute('SELECT data FROM card_tables WHERE id=?', (table,)).fetchone()['data'])
            for p, hand in zip(t['players'], hands):
                p.update(cards=hand[:], done=False)
            t['deck'] = list(deck or [])
            t['durak'].update(trump_suit=trump, trump_card='A'+trump, board=[], discard=[],
                              attacker_id=attacker or self.a, defender_id=defender or self.b,
                              phase='attack', passed_ids=[], finished_ids=[],
                              max_attacks=min(6, len(hands[1])))
            t['turn_id'] = attacker or self.a
            self.service._save(db, t)

    def act(self, table, uid, move, **kwargs):
        return self.service.mutate(uid, table, 'act', {'move': move, **kwargs})

    def test_start_36_private_cards_lowest_trump_capacity_and_once(self):
        table = self.room(players=1)
        self.assertFalse(self.service.snapshot(self.a, table)['can_start'])
        self.denied(self.service.mutate, self.a, table, 'start', {}, code='card_capacity')
        for uid in (self.b, self.c, self.d):
            self.service.mutate(uid, table, 'join', {})
        self.denied(self.service.mutate, self.other, table, 'join', {}, code='card_capacity')
        hands = [['6S','7S','8S','9S','10S','JS'], ['6C','7H','8H','9H','10H','JH'],
                 ['KC','6D','7D','8D','9D','10D'], ['7C','8C','9C','10C','JC','QC']]
        self.rig(hands)
        with ThreadPoolExecutor(max_workers=2) as pool:
            snapshots = list(pool.map(lambda _: self.service.mutate(self.a, table, 'start', {}), range(2)))
        self.assertEqual(snapshots[0], snapshots[1])
        s = snapshots[0]
        self.assertEqual((s['turn_id'], s['durak']['attacker_id'], s['durak']['defender_id']), (self.b, self.b, self.c))
        self.assertEqual(s['durak']['trump_card'], 'AC')
        self.assertEqual(s['durak']['deck_count'], 12)
        self.assertEqual(s['own_hand'], hands[0])
        for p in s['players'][1:]:
            self.assertNotIn('cards', p)
            self.assertEqual(p['card_count'], 6)
        self.assertNotIn('deck', s)
        self.assertNotIn('discard', s['durak'])
        raw = self.raw(table)
        cards = raw['deck'] + [card for p in raw['players'] for card in p['cards']]
        self.assertEqual(len(cards), 36)
        self.assertEqual(len(set(cards)), 36)
        self.assertTrue(all(RANK_VALUE[card[:-1]] >= 6 for card in cards))
        self.assertEqual(raw['deck'][-1], 'AC')
        with self.g.transaction() as db:
            for uid in self.users[:4]:
                self.assertEqual(db.execute('SELECT balance FROM wallets WHERE account_id=?', (uid,)).fetchone()[0], 490)
                self.assertEqual(active_card_table(db, uid)['id'], table)
        self.denied(self.service.snapshot, self.other, table, code='forbidden')

    def test_defense_rules_indices_and_roles_are_validated_before_mutation(self):
        table = self.room()
        self.service.mutate(self.a, table, 'start', {})
        self.endgame(table, [['7H','9S'], ['6H','8H','AC','9D']])
        self.denied(self.act, table, self.b, 'attack', card_index=0, code='card_turn')
        for value in (True, -1, 2, '0'):
            self.denied(self.act, table, self.a, 'attack', card_index=value)
        self.denied(self.act, table, self.a, 'attack', card_index=0, cards=['AS'])
        self.act(table, self.a, 'attack', card_index=0)
        before = self.raw(table)
        for index in (0, 3):
            self.denied(self.act, table, self.b, 'defend', card_index=index, attack_index=0, code='invalid_defense')
            self.assertEqual(self.raw(table), before)
        for index in (True, -1, 1, '0'):
            self.denied(self.act, table, self.b, 'defend', card_index=1, attack_index=index)
        self.denied(self.act, table, self.b, 'pass', code='invalid_move')
        s = self.act(table, self.b, 'defend', card_index=1, attack_index=0)
        self.assertEqual(s['durak']['board'], [{'attack': '7H', 'defense': '8H'}])
        self.denied(self.act, table, self.a, 'attack', card_index=0, code='invalid_attack')
        self.assertEqual(self.raw(table)['players'][0]['cards'], ['9S'])
        self.assertEqual(s['turn_id'], self.a)

    def test_trump_beats_other_suit_but_lower_trump_cannot_beat_trump(self):
        table = self.room()
        self.service.mutate(self.a, table, 'start', {})
        self.endgame(table, [['KH','9C'], ['6C','8C','10C','AD']])
        self.act(table, self.a, 'attack', card_index=0)
        self.act(table, self.b, 'defend', card_index=0, attack_index=0)
        self.act(table, self.a, 'pass')
        self.assertEqual(self.raw(table)['durak']['discard'], ['KH','6C'])
        self.endgame(table, [['9C','7H'], ['8C','10C','AH']])
        self.act(table, self.a, 'attack', card_index=0)
        self.denied(self.act, table, self.b, 'defend', card_index=0, attack_index=0, code='invalid_defense')
        self.act(table, self.b, 'defend', card_index=1, attack_index=0)

    def test_pickup_allows_matching_throwins_and_skips_defender_after_attacker_first_draw(self):
        table = self.room(players=3)
        self.service.mutate(self.a, table, 'start', {})
        self.endgame(table, [['6H','6D'], ['7S','8S'], ['6S','9H']], deck=['KS','QS','JS','10S','9S','8D','7D','AC'])
        self.act(table, self.a, 'attack', card_index=0)
        s = self.act(table, self.b, 'pickup')
        self.assertEqual((s['durak']['phase'], s['turn_id']), ('pickup', self.a))
        self.act(table, self.a, 'pass')
        self.denied(self.act, table, self.c, 'attack', card_index=1, code='invalid_attack')
        self.act(table, self.c, 'attack', card_index=0)
        self.assertEqual(self.raw(table)['durak']['phase'], 'pickup')
        self.denied(self.act, table, self.a, 'attack', card_index=0, code='attack_limit')
        self.act(table, self.a, 'pass')
        s = self.act(table, self.c, 'pass')
        self.assertEqual((s['durak']['attacker_id'], s['durak']['defender_id']), (self.c,self.a))
        raw = self.raw(table)
        self.assertEqual(raw['players'][0]['cards'], ['6D','KS','QS','JS','10S','9S'])
        self.assertEqual(raw['players'][2]['cards'], ['9H','8D','7D','AC'])
        self.assertEqual(raw['players'][1]['cards'], ['7S','8S','6H','6S'])
        self.assertEqual(raw['durak']['discard'], [])
        self.assertEqual(s['durak']['board'], [])
        self.assertEqual(s['durak']['deck_count'], 0)

    def test_multiplayer_all_pass_successful_defense_and_out_players_do_not_take_turns(self):
        table = self.room(players=3)
        self.service.mutate(self.a, table, 'start', {})
        self.endgame(table, [['6H'], ['7H','9S'], ['6S','10H']])
        self.act(table, self.a, 'attack', card_index=0)
        self.act(table, self.b, 'defend', card_index=0, attack_index=0)
        self.act(table, self.a, 'pass')
        self.assertEqual(self.service.snapshot(self.c, table)['turn_id'], self.c)
        s = self.act(table, self.c, 'pass')
        self.assertEqual(s['durak']['finished_ids'], [self.a])
        self.assertEqual((s['durak']['attacker_id'],s['durak']['defender_id']), (self.b,self.c))
        self.assertEqual(s['durak']['discard_count'], 2)
        self.assertTrue(s['players'][0]['done'])
        self.denied(self.act, table, self.a, 'pass', code='card_turn')

    def test_finish_pot_split_once_restart_quest_events_and_station_return(self):
        table = self.room(players=3, stake=10)
        self.service.mutate(self.a, table, 'start', {})
        self.endgame(table, [['6H'], ['7H'], ['AS']])
        self.act(table, self.a, 'attack', card_index=0)
        self.act(table, self.b, 'defend', card_index=0, attack_index=0)
        self.act(table, self.a, 'pass')
        finished = self.act(table, self.c, 'pass')
        self.assertEqual(finished['state'], 'finished')
        self.assertEqual([r['outcome'] for r in finished['results']], ['win','win','lose'])
        self.assertEqual([r['payout'] for r in finished['results']], [15,15,0])
        self.assertTrue(all('cards' in p for p in finished['players']))
        self.denied(self.act, table, self.c, 'pass', code='card_finished')
        again = self.service.mutate(self.a, table, 'start', {})
        self.assertEqual(again['results'], finished['results'])
        reloaded = CardService(GameService(self.g.db_path), clock=lambda:self.now)
        self.assertEqual(reloaded.snapshot(self.b, table)['results'], finished['results'])
        self.assertNotIn('deck', self.raw(table))
        with self.g.transaction() as db:
            for uid, balance in zip(self.users[:3], [505,505,490]):
                self.assertEqual(db.execute('SELECT balance FROM wallets WHERE account_id=?', (uid,)).fetchone()[0], balance)
                self.assertIsNone(active_card_table(db, uid))
                row = db.execute('SELECT x,y,scene,scene_id FROM presence WHERE account_id=?', (uid,)).fetchone()
                self.assertEqual((row['x'],row['y'],row['scene'],row['scene_id']), (*CITY_SPAWN,'city',None))
        for uid in self.users[:3]:
            quests = {q['id']:q for q in self.e.snapshot(uid)['quests']}
            self.assertTrue(quests['firstdurak']['eligible'])
            self.assertEqual(quests['cardwin']['eligible'], uid!=self.c)

    def test_last_cards_draw_refunds_each_player(self):
        table = self.room(stake=7)
        self.service.mutate(self.a, table, 'start', {})
        self.endgame(table, [['6H'], ['7H']])
        self.act(table, self.a, 'attack', card_index=0)
        self.act(table, self.b, 'defend', card_index=0, attack_index=0)
        s = self.act(table, self.a, 'pass')
        self.assertEqual(s['state'], 'finished')
        self.assertEqual([r['payout'] for r in s['results']], [7,7])
        self.assertEqual([r['outcome'] for r in s['results']], ['push','push'])

    def test_six_attack_ceiling(self):
        table = self.room()
        self.service.mutate(self.a,table,'start',{})
        self.endgame(table,[['6H','6D','6S','6C','7S','7D','7C'],
                            ['7H','8D','8S','8C','9S','9D','9C']])
        for _ in range(6):
            self.act(table,self.a,'attack',card_index=0)
            self.act(table,self.b,'defend',card_index=0,attack_index=_)
        s = self.service.snapshot(self.a,table)
        self.assertEqual(s['durak']['max_attacks'],6)
        self.assertEqual(s['durak']['allowed_moves'],['pass'])
        self.denied(self.act,table,self.a,'attack',card_index=0,code='attack_limit')
        s = self.act(table,self.a,'pass')
        self.assertEqual(s['durak']['discard_count'],12)

    def test_finished_defender_is_skipped(self):
        # A defender who discards their last card cannot attack in the next round.
        table = self.room(players=4)
        self.service.mutate(self.a,table,'start',{})
        self.endgame(table,[['6H','9D'],['7H'],['8S'],['10S']])
        self.act(table,self.a,'attack',card_index=0)
        self.act(table,self.b,'defend',card_index=0,attack_index=0)
        for uid in (self.a,self.c,self.d):s=self.act(table,uid,'pass')
        self.assertEqual(s['durak']['finished_ids'],[self.b])
        self.assertEqual((s['turn_id'],s['durak']['defender_id']),(self.c,self.d))

    def test_deck_invitation_funds_and_jury_blackout_apply_to_durak(self):
        self.denied(self.service.create,self.a,{'game':'durak','stake':10,'source':'deck','title':'Private'},code='deck_required')
        table = self.room(source='deck')
        self.denied(self.service.snapshot,self.other,table,code='forbidden')
        with self.g.transaction() as db:
            change_balance(db,self.b,-500,'test:poor')
        self.denied(self.service.mutate,self.a,table,'start',{},code='insufficient_funds')
        self.assertEqual(self.service.snapshot(self.a,table)['state'],'waiting')
        with self.g.transaction() as db:
            self.assertEqual(db.execute('SELECT balance FROM wallets WHERE account_id=?',(self.a,)).fetchone()[0],440)
        duty=self.g.create_lobby(self.c,{'title':'Duty','mode':'individual'})['id']
        self.g.join(self.b,self.g.snapshot(self.c,duty)['jury_code'])
        self.assertEqual(self.service.all(self.a)['tables'],[])
        self.denied(self.service.snapshot,self.a,table,code='card_unavailable')
        self.denied(self.service.mutate,self.b,table,'start',{},code='jury_restricted')

    def test_poker_winning_hand_records_quest_even_when_small_pot_remainder_has_zero_net(self):
        table=self.service.create(self.a,{'game':'poker','stake':1,'title':'Quest pot','source':'casino'})['id']
        for uid in (self.b,self.c,self.d):self.service.mutate(uid,table,'join',{})
        # Three winning straights divide a four-chip pot: two receive only their stake.
        first=['AS','KD','QH','JC','10D','AH','KC','QS','JD','10S',
               'AD','KH','QC','JS','10H','2S','4D','6H','8C','9D']
        self.service.shuffle=lambda deck:deck.__setitem__(slice(None),first+[c for c in deck if c not in first])
        self.service.mutate(self.a,table,'start',{})
        for uid in (self.a,self.b,self.c,self.d):s=self.act(table,uid,'keep')
        self.assertEqual(sorted(r['payout'] for r in s['results']),[0,1,1,2])
        for uid in self.users[:4]:
            quest=next(q for q in self.e.snapshot(uid)['quests'] if q['id']=='cardwin')
            self.assertEqual(quest['eligible'],uid!=self.d)

    def test_entire_four_player_game_uses_legal_visible_actions_conserves_cards_and_finishes(self):
        table=self.room(players=4,stake=3)
        s=self.service.mutate(self.a,table,'start',{})
        for _ in range(1200):
            if s['state']=='finished':break
            uid=s['turn_id'];s=self.service.snapshot(uid,table);d=s['durak'];hand=s['own_hand']
            moves=d['allowed_moves']
            if 'defend' in moves:
                i=next(i for i,pair in enumerate(d['board']) if pair['defense'] is None)
                attack=d['board'][i]['attack'];trump=d['trump_suit']
                choices=[j for j,card in enumerate(hand) if card[-1]==attack[-1] and RANK_VALUE[card[:-1]]>RANK_VALUE[attack[:-1]] or card[-1]==trump and attack[-1]!=trump]
                s=self.act(table,uid,'defend',card_index=choices[0],attack_index=i) if choices else self.act(table,uid,'pickup')
            else:
                ranks={card[:-1] for pair in d['board'] for card in pair.values() if card}
                choices=[j for j,card in enumerate(hand) if not ranks or card[:-1] in ranks]
                s=self.act(table,uid,'attack',card_index=choices[0]) if 'attack' in moves and choices else self.act(table,uid,'pass')
            raw=self.raw(table)
            cards=raw.get('deck',[])+raw['durak']['discard']+[card for p in raw['players'] for card in p['cards']]+[card for pair in raw['durak']['board'] for card in pair.values() if card]
            self.assertEqual((len(cards),len(set(cards))),(36,36))
        self.assertEqual(s['state'],'finished','A real legal game should reach settlement')
        self.assertEqual(sum(r['payout'] for r in s['results']),12)


if __name__ == '__main__':
    unittest.main()
