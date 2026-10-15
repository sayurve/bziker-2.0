"""A modular rebuild must read coordinates from the version being replaced."""
import unittest
from unittest.mock import patch
import world


class ModularMigrationTests(unittest.TestCase):
    def test_twenty_uses_the_modular_anchors_when_roads_are_replanned(self):
        scene = {
            'previous_landmarks_v19': {'station': {'x': 50, 'y': 60}},
            'previous_landmarks_v20': {'station': {'x': 500, 'y': 600}},
            'landmarks': {'station': {'x': 900, 'y': 1000}},
        }
        with patch.object(world, 'WORLD_MAP', scene), patch.object(
                world, 'nearest_city_position', side_effect=lambda x, y: (x, y)):
            point = world.migrated_city_position(512, 617, source_version=20)
        self.assertEqual(point, (912, 1017))

    def test_nineteen_uses_its_own_anchors_instead_of_eighteen(self):
        scene = {
            'previous_landmarks_v18': {'station': {'x': 50, 'y': 60}},
            'previous_landmarks_v19': {'station': {'x': 500, 'y': 600}},
            'landmarks': {'station': {'x': 900, 'y': 1000}},
        }
        with patch.object(world, 'WORLD_MAP', scene), patch.object(
                world, 'nearest_city_position', side_effect=lambda x, y: (x, y)):
            point = world.migrated_city_position(512, 617, source_version=19)
        self.assertEqual(point, (912, 1017))

    def test_eighteen_keeps_its_existing_transform(self):
        scene = {
            'previous_landmarks_v18': {'station': {'x': 50, 'y': 60}},
            'previous_landmarks_v19': {'station': {'x': 500, 'y': 600}},
            'landmarks': {'station': {'x': 900, 'y': 1000}},
        }
        with patch.object(world, 'WORLD_MAP', scene), patch.object(
                world, 'nearest_city_position', side_effect=lambda x, y: (x, y)):
            point = world.migrated_city_position(62, 77, source_version=18)
        self.assertEqual(point, (912, 1017))
