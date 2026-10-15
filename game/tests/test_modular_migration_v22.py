"""A city22 rebuild must migrate feet from the immediately replaced city21."""
import unittest
from unittest.mock import patch

import world


class CityTwentyTwoMigrationTests(unittest.TestCase):
    def test_twenty_one_uses_its_own_landmark_and_retains_nearby_offset(self):
        scene = {
            'previous_landmarks_v20': {'station': {'x': 50, 'y': 60}},
            'previous_landmarks_v21': {'station': {'x': 500, 'y': 600}},
            'landmarks': {'station': {'x': 900, 'y': 1000}},
        }
        with patch.object(world, 'WORLD_MAP', scene), patch.object(
                world, 'nearest_city_position', side_effect=lambda x, y: (x, y)):
            point = world.migrated_city_position(512, 617, source_version=21)
        self.assertEqual(point, (912, 1017))

    def test_twenty_still_reads_twenty_when_twenty_one_is_also_present(self):
        scene = {
            'previous_landmarks_v20': {'station': {'x': 500, 'y': 600}},
            'previous_landmarks_v21': {'station': {'x': 50, 'y': 60}},
            'landmarks': {'station': {'x': 900, 'y': 1000}},
        }
        with patch.object(world, 'WORLD_MAP', scene), patch.object(
                world, 'nearest_city_position', side_effect=lambda x, y: (x, y)):
            point = world.migrated_city_position(512, 617, source_version=20)
        self.assertEqual(point, (912, 1017))

    def test_twenty_one_district_retains_its_district_offset(self):
        scene = {
            'previous_landmarks_v20': {'district': {'x': 50, 'y': 60}},
            'previous_landmarks_v21': {
                'district': {'x': 500, 'y': 600},
                'station': {'x': 511, 'y': 616},
            },
            'landmarks': {
                'district': {'x': 900, 'y': 1000},
                'station': {'x': 1500, 'y': 1600},
            },
        }
        with patch.object(world, 'WORLD_MAP', scene), patch.object(
                world, 'nearest_city_position', side_effect=lambda x, y: (x, y)):
            point = world.migrated_city_position(
                512, 617, scene='district', source_version=21)
        self.assertEqual(point, (912, 1017))
