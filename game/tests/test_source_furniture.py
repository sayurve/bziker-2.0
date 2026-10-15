"""Approved theme names and full-picker colors persist through the existing API."""
import tempfile
import unittest
from pathlib import Path

from clan_fixtures import legacy_home
from game import GameError, GameService
from world import WorldService, furniture_seats


class SourceFurnitureTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.game = GameService(Path(self.tmp.name) / 'furniture.db')
        self.world = WorldService(self.game, clock=lambda: 1000)
        self.uid = self.game.create_account()
        self.game.profile(self.uid, {'name': 'Source Furniture'})
        self.cid = self.world.create_clan(self.uid, {'name': 'Source Base', 'color': '#111111', 'flag': 'S'})['id']
        legacy_home(self.game, self.cid)
        self.item = {'id': 'source-chair', 'type': 'chair', 'x': 2, 'y': 2, 'rotation': 90}

    def save(self, body):
        return self.world.mutate_clan(self.uid, self.cid, 'base', body)['base']

    def test_all_approved_themes_preserve_type_rotation_and_seat_geometry(self):
        expected = furniture_seats(self.cid, [self.item])
        for theme in ('modern', 'loft', 'tech', 'wood', 'stone'):
            with self.subTest(theme=theme):
                base = self.save({'items': [self.item | {'source_theme': theme}]})
                self.assertEqual(base['items'][0]['source_theme'], theme)
                self.assertEqual(furniture_seats(self.cid, base['items']), expected)
        restarted = WorldService(GameService(self.game.db_path), clock=lambda: 1000)
        self.assertEqual(restarted.clan_snapshot(self.uid, self.cid)['base']['items'][0]['source_theme'], 'stone')

    def test_approved_surfaces_and_full_picker_colors_roundtrip_without_defaults(self):
        base = self.save({'items': [self.item]})
        self.assertNotIn('source_theme', base['items'][0])
        self.assertNotIn('surface_style', base)
        self.assertNotIn('wall_material', base)
        for surface, wall in zip(('board', 'parquet', 'concrete', 'tile', 'stone', 'metal'),
                                 ('plaster', 'brick', 'concrete', 'wood', 'stone', 'metal')):
            with self.subTest(surface=surface, wall=wall):
                base = self.save({'items': [self.item | {'color': '#Ab12Cd'}],
                    'surface_style': surface, 'wall_material': wall,
                    'wall_color': '#1020FF', 'floor_color': '#Ddee99'})
                self.assertEqual((base['surface_style'], base['wall_material']), (surface, wall))
                self.assertEqual((base['wall_color'], base['floor_color'], base['items'][0]['color']),
                                 ('#1020ff', '#ddee99', '#ab12cd'))
        retained = self.save({'items': base['items']})
        self.assertEqual((retained['surface_style'], retained['wall_material']), ('metal', 'metal'))

    def test_invalid_styles_colors_and_asset_paths_fail_without_mutating_base(self):
        valid = self.save({'items': [self.item], 'surface_style': 'parquet', 'wall_material': 'brick'})
        bad_bodies = [
            {'items': [self.item | {'source_theme': theme}]} for theme in ('unknown', 'Modern', None, [], '../secret')
        ] + [
            {'items': [self.item], key: bad} for key in ('surface_style', 'wall_material') for bad in ('unknown', None, [])
        ] + [
            {'items': [self.item], key: bad} for key in ('wall_color', 'floor_color')
            for bad in ('red', '#fff', '#12345678', '#gg0000', 'url(x)', 123, None)
        ] + [
            {'items': [self.item | {'color': bad}]} for bad in ('red', '#fff', '#12345678', '#gg0000', 'url(x)', 123, None)
        ] + [{'items': [self.item | {'source_asset': '/private.png'}]}]
        for body in bad_bodies:
            with self.subTest(body=body):
                with self.assertRaises(GameError):
                    self.save(body)
                self.assertEqual(self.world.clan_snapshot(self.uid, self.cid)['base'], valid)


if __name__ == '__main__':
    unittest.main()
