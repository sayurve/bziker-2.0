import tempfile
import unittest
from pathlib import Path

from game import GameError, GameService
from world import FURNITURE_MAP, FURNITURE_TYPES, WorldService, furniture_footprint, furniture_seats
from clan_fixtures import legacy_home, approach_base_seat


class FurnitureRotationV16Tests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.game = GameService(Path(self.tmp.name) / 'rotation.db')
        self.world = WorldService(self.game, clock=lambda: 1000)
        self.leader, self.guest = [self.game.create_account() for _ in range(2)]
        self.game.profile(self.leader, {'name': 'RotationLeader'})
        self.game.profile(self.guest, {'name': 'RotationGuest'})
        self.cid = self.world.create_clan(self.leader, {
            'name': 'Rotation Clan', 'flag': '!', 'color': '#111111'})['id']
        legacy_home(self.game, self.cid)
        self.sofa = {'id': 'sofa', 'type': 'sofa', 'x': 2, 'y': 2, 'rotation': 0}

    def save(self, items):
        self.world.mutate_clan(self.leader, self.cid, 'base', {'items': items})
        return self.world.move(self.leader, {'scene': 'base', 'x': 600, 'y': 670})['active_base']['base']

    def test_270_degree_footprint_uses_the_second_row_instead_of_second_column(self):
        self.assertEqual(furniture_footprint(dict(self.sofa, rotation=270)), (1, 2))
        self.assertEqual(furniture_footprint(dict(self.sofa, rotation=180)), (2, 1))

    def test_all_four_orientations_have_rotated_authoritative_seats_and_facing(self):
        expected = {
            0: ([(355, 423), (425, 423)], 'down'),
            90: ([(331, 411), (331, 481)], 'left'),
            180: ([(425, 387), (355, 387)], 'up'),
            270: ([(367, 481), (367, 411)], 'right'),
        }
        for rotation, (positions, facing) in expected.items():
            with self.subTest(rotation=rotation):
                seats = furniture_seats(self.cid, [dict(self.sofa, rotation=rotation)])
                self.assertEqual([(s['seat']['x'], s['seat']['y']) for s in seats], positions)
                self.assertEqual([s['facing'] for s in seats], [facing, facing])
                self.assertEqual([s['id'] for s in seats], [
                    f'base:{self.cid}:sofa:seat-1', f'base:{self.cid}:sofa:seat-2'])

    def test_all_four_orientations_save_and_survive_service_restart(self):
        for rotation in (0, 90, 180, 270):
            with self.subTest(rotation=rotation):
                base = self.save([dict(self.sofa, rotation=rotation)])
                self.assertEqual(base['items'][0]['rotation'], rotation)
                restarted = WorldService(GameService(self.game.db_path), clock=lambda: 1000)
                retained = restarted.snapshot(self.leader)['active_base']['base']
                self.assertEqual(retained['items'], base['items'])
                self.assertEqual(retained['seats'], base['seats'])

    def test_270_degree_placement_checks_all_cells_and_keeps_previous_save_on_rejection(self):
        valid = dict(self.sofa, x=11, y=6, rotation=270)
        previous = self.save([valid])
        for items in ([dict(valid, y=7)], [valid, {
                'id': 'blocked', 'type': 'chair', 'x': 11, 'y': 7, 'rotation': 0}]):
            with self.subTest(items=items):
                with self.assertRaises(GameError) as error:
                    self.save(items)
                self.assertEqual(error.exception.code, 'invalid_action')
                self.assertEqual(self.world.clan_snapshot(self.leader, self.cid)['base']['items'],
                                 previous['items'])

    def test_rotated_solid_blocks_walking_but_its_rotated_seat_is_usable(self):
        base = self.save([dict(self.sofa, rotation=270)])
        self.world.move(self.leader, {'scene': 'base', 'x': 600, 'y': 670})
        grid = FURNITURE_MAP['grid']
        inside = {'x': grid['x'] + 2 * grid['cell_width'] + 5,
                  'y': grid['y'] + 3 * grid['cell_height'] + 30}
        with self.assertRaises(GameError) as error:
            self.world.move(self.leader, {'scene': 'base', **inside})
        self.assertEqual(error.exception.code, 'invalid_action')
        seat = base['seats'][0]
        approach_base_seat(self.world, self.leader, self.cid, seat['seat'])
        seated = self.world.activity(self.leader, {'action': 'sit', 'bench_id': seat['id']})
        self.assertEqual(seated['bench_id'], seat['id'])
        self.assertEqual(seated['position'], seat['seat'])

    def test_malformed_rotation_types_and_non_quarter_turns_are_rejected(self):
        for rotation in (None, True, False, '90', 90.0, -90, 45, 360, [], {}):
            with self.subTest(rotation=rotation):
                previous = self.save([self.sofa])['items']
                with self.assertRaises(GameError) as error:
                    self.save([dict(self.sofa, rotation=rotation)])
                self.assertEqual(error.exception.code, 'invalid_action')
                self.assertEqual(self.world.clan_snapshot(self.leader, self.cid)['base']['items'], previous)

    def test_guest_cannot_rotate_furniture(self):
        previous = self.save([self.sofa])['items']
        invitation = self.world.invite_base(self.leader, self.cid, {'to_id': self.guest})['invitation']
        self.world.respond_base_invitation(self.guest, invitation['id'], 'accept')
        with self.assertRaises(GameError) as error:
            self.world.mutate_clan(self.guest, self.cid, 'base', {
                'items': [dict(self.sofa, rotation=180)]})
        self.assertEqual(error.exception.code, 'forbidden')
        self.assertEqual(self.world.clan_snapshot(self.leader, self.cid)['base']['items'], previous)

    def test_legacy_items_keep_their_original_one_cell_shape_and_single_seat(self):
        old = {'id': 'old-sofa', 'type': 'sofa', 'x': 11, 'y': 7}
        base = self.save([old])
        self.assertNotIn('rotation', base['items'][0])
        self.assertEqual(furniture_footprint(base['items'][0]), (1, 1))
        self.assertEqual(len(base['seats']), 1)
        self.assertEqual(base['seats'][0]['seat'], {'x': 985, 'y': 713})

    def test_rotating_an_occupied_object_releases_the_seat_and_preserves_phone(self):
        self.save([self.sofa])
        seat = self.world.snapshot(self.leader)['active_base']['base']['seats'][0]
        approach_base_seat(self.world, self.leader, self.cid, seat['seat'])
        self.world.activity(self.leader, {'action': 'sit', 'bench_id': seat['id']})
        self.world.activity(self.leader, {'action': 'phone', 'open': True})
        self.world.mutate_clan(self.leader, self.cid, 'base', {
            'items': [dict(self.sofa, rotation=180)]})
        after = self.world.snapshot(self.leader)
        self.assertIsNone(after['bench_id'])
        self.assertEqual(after['pose'], 'idle')
        self.assertTrue(after['phone_open'])
        self.assertEqual(after['scene_id'], self.cid)

    def test_every_catalog_seat_is_inside_its_rotated_solid_footprint(self):
        grid = FURNITURE_MAP['grid']
        for kind in FURNITURE_TYPES.values():
            for rotation in (0, 90, 180, 270):
                with self.subTest(kind=kind['id'], rotation=rotation):
                    item = {'id': 'probe', 'type': kind['id'], 'x': 0, 'y': 0, 'rotation': rotation}
                    width, height = furniture_footprint(item)
                    for seat in furniture_seats(self.cid, [item]):
                        self.assertGreaterEqual(seat['seat']['x'], grid['x'])
                        self.assertLessEqual(seat['seat']['x'], grid['x'] + width * grid['cell_width'])
                        self.assertGreaterEqual(seat['seat']['y'], grid['y'])
                        self.assertLessEqual(seat['seat']['y'], grid['y'] + height * grid['cell_height'])


if __name__ == '__main__':
    unittest.main()
