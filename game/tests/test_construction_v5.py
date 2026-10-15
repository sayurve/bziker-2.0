import json
import math
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from game import GameError, GameService
from world import DISTRICT_BUILDINGS, FURNITURE_PALETTE, WorldService, valid_position


class ClanConstructionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.g = GameService(Path(self.tmp.name) / 'construction.db')
        self.now = 1000
        self.w = WorldService(self.g, clock=lambda: self.now)
        self.sequence = 0

    def player(self):
        self.sequence += 1
        uid = self.g.create_account()
        self.g.profile(uid, {'name': f'Builder {self.sequence}'})
        return uid

    def clan(self, members=4):
        leader = self.player()
        cid = self.w.create_clan(leader, {'name': f'Builders {self.sequence}', 'color': '#FF8562', 'flag': 'B'})['id']
        roster = [leader]
        for _ in range(members - 1):
            uid = self.player()
            self.w.mutate_clan(uid, cid, 'apply', {})
            self.w.mutate_clan(leader, cid, 'accept', {'account_id': uid})
            roster.append(uid)
        return leader, cid, roster

    def approach(self, uid, plot=0):
        door = DISTRICT_BUILDINGS[plot]['door']
        arrival = {'x': door['x'], 'y': door['y'] + 24}
        self.assertTrue(valid_position('city', **arrival), DISTRICT_BUILDINGS[plot]['id'])
        self.w.move(uid, {'scene': 'city', 'teleport': True, **arrival})
        return self.w.move(uid, {'scene': 'city', 'x': door['x'], 'y': door['y'] + 25})

    def design(self, plot=0, style=5, color='#62cdb9'):
        return {'building_id': DISTRICT_BUILDINGS[plot]['id'], 'exterior_style': style, 'exterior_color': color}

    def denied(self, fn, *args, code):
        with self.assertRaises(GameError) as error:
            fn(*args)
        self.assertEqual(error.exception.code, code)
        return error.exception

    def test_new_clan_has_no_house_and_restart_does_not_assign_one(self):
        uid, cid, _ = self.clan(members=1)
        snapshot = self.w.snapshot(uid)
        self.assertIsNone(snapshot['my_clan']['base']['building_id'])
        self.assertFalse(snapshot['my_clan']['base']['exterior_locked'])
        self.assertTrue(all(plot['clan'] is None for plot in snapshot['buildings']))
        again = WorldService(GameService(self.g.db_path), clock=lambda: self.now)
        self.assertIsNone(again.clan_snapshot(uid, cid)['base']['building_id'])
        self.denied(again.mutate_clan, uid, cid, 'base', {'items': []}, code='base_unassigned')

    def test_four_actual_members_are_required_pending_requests_are_not_members(self):
        leader, cid, _ = self.clan(members=3)
        fourth = self.player()
        self.w.mutate_clan(fourth, cid, 'apply', {})
        self.approach(leader)
        self.denied(self.w.mutate_clan, leader, cid, 'building', self.design(), code='clan_members_required')
        self.w.mutate_clan(leader, cid, 'accept', {'account_id': fourth})
        built = self.w.mutate_clan(leader, cid, 'building', self.design())
        self.assertEqual(built['member_count'], 4)
        self.assertEqual(built['base']['building_id'], 'base-1')
        self.assertEqual(built['base']['exterior_style'], 5)
        self.assertEqual(built['base']['exterior_color'], '#62cdb9')
        self.assertTrue(built['base']['exterior_locked'])

    def test_any_six_digit_hex_exterior_is_normalized_and_locked(self):
        leader, cid, _ = self.clan()
        self.approach(leader)
        built = self.w.mutate_clan(leader, cid, 'building', self.design(color='#12ABCD'))
        self.assertEqual(built['base']['exterior_color'], '#12abcd')
        self.denied(self.w.mutate_clan, leader, cid, 'base',
                    {'items': built['base']['items'], 'exterior_color': '#abcdef'}, code='exterior_locked')

    def test_only_current_leader_can_build_even_when_member_is_at_plot(self):
        leader, cid, members = self.clan()
        self.approach(members[1])
        self.denied(self.w.mutate_clan, members[1], cid, 'building', self.design(), code='forbidden')
        self.w.mutate_clan(leader, cid, 'transfer', {'account_id': members[1]})
        built = self.w.mutate_clan(members[1], cid, 'building', self.design())
        self.assertEqual(built['leader_id'], members[1])

    def test_building_requires_city_door_proximity_and_preserves_phone_and_coordinates(self):
        leader, cid, _ = self.clan()
        self.denied(self.w.mutate_clan, leader, cid, 'building', self.design(), code='door_distance')
        self.approach(leader)
        before = self.w.activity(leader, {'action': 'phone', 'open': True})
        self.w.mutate_clan(leader, cid, 'building', self.design())
        after = self.w.snapshot(leader)
        self.assertEqual(after['position'], before['position'])
        self.assertEqual(after['scene'], 'city')
        self.assertEqual(after['pose'], before['pose'])
        self.assertTrue(after['phone_open'])

    def test_construction_reaches_plot_at_110_units_but_not_111(self):
        for index, distance in enumerate((110, 111)):
            with self.subTest(distance=distance):
                leader, cid, _ = self.clan()
                door = DISTRICT_BUILDINGS[index]['door']
                self.approach(leader, index)
                point = {'x': door['x'] - distance, 'y': door['y']}
                self.assertTrue(valid_position('city', **point))
                self.assertEqual(math.hypot(point['x'] - door['x'], point['y'] - door['y']), distance)
                self.w.move(leader, {'scene': 'city', **point})
                if distance == 110:
                    built = self.w.mutate_clan(leader, cid, 'building', self.design(index))
                    self.assertEqual(built['base']['building_id'], DISTRICT_BUILDINGS[index]['id'])
                else:
                    self.denied(self.w.mutate_clan, leader, cid, 'building', self.design(index), code='door_distance')
                    self.assertIsNone(self.w.clan_snapshot(leader, cid)['base']['building_id'])

    def test_active_quiz_cannot_build_a_house(self):
        leader, cid, _ = self.clan()
        self.approach(leader)
        lid = self.g.create_lobby(leader, {'title': 'Busy builder', 'mode': 'individual'})['id']
        self.g.join(self.player(), self.g.snapshot(leader, lid)['jury_code'])
        self.g.mutate(leader, lid, 'start', {})
        self.denied(self.w.mutate_clan, leader, cid, 'building', self.design(), code='active_match_scene')
        self.assertIsNone(self.w.clan_snapshot(leader, cid)['base']['building_id'])

    def test_active_card_table_cannot_build_a_house(self):
        from cards import CardService
        from economy import EconomyService, change_balance
        leader, cid, members = self.clan()
        self.approach(leader)
        economy = EconomyService(self.g, self.w)
        with self.g.transaction() as db:
            for uid in (leader, members[1]):
                change_balance(db, uid, 100, 'test:construction-cards')
        cards = CardService(self.g, economy, clock=lambda: self.now)
        table = cards.create(leader, {'game': 'poker', 'title': 'Busy builders', 'source': 'casino', 'stake': 10})
        cards.mutate(members[1], table['id'], 'join', {})
        cards.mutate(leader, table['id'], 'start', {})
        self.denied(self.w.mutate_clan, leader, cid, 'building', self.design(), code='active_match_scene')
        self.assertIsNone(self.w.clan_snapshot(leader, cid)['base']['building_id'])

    def test_public_interior_cannot_substitute_for_city_plot_position(self):
        from world import INTERIORS
        leader, cid, _ = self.clan()
        room = INTERIORS['clans']
        self.w.move(leader, {'scene': 'city', 'teleport': True,
                             'x': room['door']['x'], 'y': room['door']['y'] + 24})
        self.w.enter(leader, {'building_id': room['id']})
        before = self.w.snapshot(leader)
        self.denied(self.w.mutate_clan, leader, cid, 'building', self.design(), code='door_distance')
        after = self.w.snapshot(leader)
        self.assertEqual(after['scene_id'], before['scene_id'])
        self.assertEqual(after['position'], before['position'])

    def test_member_departure_is_rechecked_at_construction_commit(self):
        leader, cid, members = self.clan()
        self.approach(leader)
        self.w.mutate_clan(members[-1], cid, 'leave', {})
        self.denied(self.w.mutate_clan, leader, cid, 'building', self.design(), code='clan_members_required')
        self.assertIsNone(self.w.clan_snapshot(leader, cid)['base']['building_id'])

    def test_all_six_styles_are_buildable_and_design_input_is_validated_before_commit(self):
        leader, cid, _ = self.clan()
        self.approach(leader)
        for bad in ({'exterior_style': True}, {'exterior_style': -1}, {'exterior_style': 6},
                    {'exterior_style': '1'}, {'exterior_color': '#12345'}, {'exterior_color': 'red'},
                    {'exterior_color': None}, {'building_id': 'absent'}):
            self.denied(self.w.mutate_clan, leader, cid, 'building', self.design() | bad, code='invalid_action')
        self.assertIsNone(self.w.clan_snapshot(leader, cid)['base']['building_id'])
        for style in range(6):
            if style:
                leader, cid, _ = self.clan()
                self.approach(leader, style)
            built = self.w.mutate_clan(leader, cid, 'building', self.design(style, style, FURNITURE_PALETTE[style]))
            self.assertEqual(built['base']['exterior_style'], style)

    def test_plot_and_exterior_are_immutable_while_interior_stays_customizable(self):
        leader, cid, _ = self.clan()
        self.approach(leader)
        self.w.mutate_clan(leader, cid, 'building', self.design())
        for design in (self.design(), self.design(1), self.design(style=2), self.design(color='#ffffff')):
            self.denied(self.w.mutate_clan, leader, cid, 'building', design, code='base_already_built')
        for altered in ({'exterior_style': 3}, {'exterior_color': '#ffffff'}):
            self.denied(self.w.mutate_clan, leader, cid, 'base', {'items': []} | altered, code='exterior_locked')
        body = {'items': [{'id': 'sofa', 'type': 'sofa', 'x': 2, 'y': 3, 'rotation': 0}],
                'wall_color': '#b697d7', 'floor_color': '#141414'}
        saved = self.w.mutate_clan(leader, cid, 'base', body)['base']
        self.assertEqual(saved['exterior_style'], 5)
        self.assertEqual(saved['exterior_color'], '#62cdb9')
        self.assertEqual(saved['wall_color'], '#b697d7')
        self.assertEqual(len(saved['items']), 1)
        again = WorldService(GameService(self.g.db_path), clock=lambda: self.now)
        self.assertEqual(again.clan_snapshot(leader, cid)['base'], saved)

    def test_two_clans_racing_for_same_plot_have_one_winner_and_no_partial_design(self):
        clans = [self.clan(), self.clan()]
        for leader, _, _ in clans:
            self.approach(leader)
        def build(entry):
            leader, cid, _ = entry
            try:
                self.w.mutate_clan(leader, cid, 'building', self.design())
                return True
            except GameError as error:
                self.assertEqual(error.code, 'building_occupied')
                return False
        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(sum(pool.map(build, clans)), 1)
        bases = [self.w.clan_snapshot(leader, cid)['base'] for leader, cid, _ in clans]
        self.assertEqual(sum(base['building_id'] is not None for base in bases), 1)
        self.assertEqual(sum(base['exterior_locked'] for base in bases), 1)

    def test_same_clan_concurrent_designs_only_commit_once(self):
        leader, cid, _ = self.clan()
        self.approach(leader)
        designs = (self.design(style=4, color='#ffffff'), self.design(style=5, color='#62cdb9'))
        def build(design):
            try:
                return self.w.mutate_clan(leader, cid, 'building', design)['base']
            except GameError as error:
                self.assertEqual(error.code, 'base_already_built')
                return None
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(build, designs))
        winner = next(result for result in results if result)
        self.assertEqual(sum(result is not None for result in results), 1)
        stored = self.w.clan_snapshot(leader, cid)['base']
        self.assertEqual(stored, winner)

    def test_legacy_assigned_house_is_grandfathered_and_retains_unlisted_exterior_color(self):
        leader, cid, _ = self.clan(members=1)
        old_base = {'items': [{'id': 'old-sofa', 'type': 'sofa', 'x': 11, 'y': 7}], 'exterior_style': 3}
        with self.g.transaction() as db:
            db.execute('UPDATE clans SET building_id=?,base=? WHERE id=?', ('base-4', json.dumps(old_base), cid))
        again = WorldService(GameService(self.g.db_path), clock=lambda: self.now)
        base = again.clan_snapshot(leader, cid)['base']
        self.assertEqual(base['building_id'], 'base-4')
        self.assertEqual(base['exterior_style'], 3)
        self.assertEqual(base['exterior_color'], '#FF8562')
        self.assertTrue(base['exterior_locked'])
        saved = again.mutate_clan(leader, cid, 'base', {'items': old_base['items']})['base']
        self.assertEqual(saved['exterior_color'], '#FF8562')
        self.assertEqual(saved['items'][0]['id'], 'old-sofa')
        self.denied(again.mutate_clan, leader, cid, 'base', {'items': [], 'exterior_color': '#ffffff'}, code='exterior_locked')

    def test_public_building_and_active_base_show_fixed_design_and_distinct_clan_color(self):
        leader, cid, _ = self.clan()
        self.approach(leader)
        self.w.mutate_clan(leader, cid, 'building', self.design())
        other = self.player()
        visible = next(plot['clan'] for plot in self.w.snapshot(other)['buildings'] if plot['clan'])
        self.assertEqual(visible['exterior_style'], 5)
        self.assertEqual(visible['exterior_color'], '#62cdb9')
        self.assertEqual(visible['color'], '#FF8562')
        interior = self.w.move(leader, {'scene': 'base', 'x': 600, 'y': 670})
        self.assertEqual(interior['active_base']['base']['exterior_color'], '#62cdb9')

    def test_base_guests_cannot_be_invited_until_house_is_built(self):
        leader, cid, _ = self.clan()
        guest = self.player()
        self.denied(self.w.invite_base, leader, cid, {'to_id': guest}, code='base_unassigned')


if __name__ == '__main__':
    unittest.main()
