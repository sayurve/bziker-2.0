"""Each animal's paw phase follows its own travelled distance in both runtimes."""
import json
import subprocess
import unittest
from pathlib import Path
from animals import animal_position


class AnimalGaitTests(unittest.TestCase):
    def test_paws_advance_every_ten_world_pixels_and_reset_during_a_pause(self):
        animal = {'id': 'test-cat', 'kind': 'cat', 'action': 'pet-cat', 'label': 'Cat',
                  'radius': 65, 'speed': 20, 'phase': 0,
                  'route': [{'x': 0, 'y': 0, 'dwell': 1}, {'x': 100, 'y': 0, 'dwell': 1}]}
        times = [0, .99, 1, 1.49, 1.5, 1.99, 2, 2.5, 3, 6, 6.9, 7]
        expected = [0, 0, 0, 0, 1, 1, 2, 3, 0, 0, 0, 0]
        self.assertEqual([animal_position(animal, t)['walk_frame'] for t in times], expected)
        script = "import {animalPosition} from './web/ambient-animals.js'; console.log(JSON.stringify(" + json.dumps(times) + ".map(t=>animalPosition(" + json.dumps(animal) + ",t).walk_frame)));"
        actual = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', script], cwd=Path(__file__).resolve().parent.parent))
        self.assertEqual(actual, expected)
        paused = animal_position(animal, 2.8, {'started_at': 2, 'duration': 2})
        self.assertFalse(paused['walking']);self.assertEqual(paused['walk_frame'], 0)


if __name__ == '__main__':
    unittest.main()
