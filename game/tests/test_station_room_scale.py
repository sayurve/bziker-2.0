"""Compact station geometry must retain server-valid seats and clear approaches."""
import collections
import math
import unittest
import world


class StationRoomScaleTests(unittest.TestCase):
    def test_station_solids_do_not_overlap_and_have_valid_ground_supports(self):
        room = world.INTERIORS['railway']
        bounds = room['bounds']
        for index, a in enumerate(room['solids']):
            self.assertGreaterEqual(a['x'], bounds['left'])
            self.assertLessEqual(a['x'] + a['width'], bounds['right'])
            self.assertGreaterEqual(a['y'], bounds['top'])
            self.assertLessEqual(a['y'] + a['height'], bounds['bottom'])
            for b in room['solids'][index + 1:]:
                overlap = (a['x'] < b['x'] + b['width'] and a['x'] + a['width'] > b['x']
                           and a['y'] < b['y'] + b['height'] and a['y'] + a['height'] > b['y'])
                self.assertFalse(overlap, (a['prop_id'], b['prop_id']))
        for seat in room['seats']:
            self.assertTrue(world.valid_position('interior', seat['seat']['x'], seat['seat']['y'], 'railway', seated=True))
            self.assertTrue(world.valid_position('interior', seat['approach']['x'], seat['approach']['y'], 'railway'))

    def test_station_service_exit_and_all_seat_approaches_are_reachable_from_entry(self):
        room = world.INTERIORS['railway']
        start = room['spawn']
        self.assertTrue(world.valid_position('interior', start['x'], start['y'], 'railway'))
        step = 8
        queue = collections.deque([(0, 0)])
        seen = {(0, 0)}
        while queue:
            ix, iy = queue.popleft()
            for key in [(ix - 1, iy), (ix + 1, iy), (ix, iy - 1), (ix, iy + 1)]:
                if key in seen:
                    continue
                x, y = start['x'] + key[0] * step, start['y'] + key[1] * step
                if not world.valid_position('interior', x, y, 'railway'):
                    continue
                seen.add(key)
                queue.append(key)
        points = [(start['x'] + ix * step, start['y'] + iy * step) for ix, iy in seen]
        for label, target in [('service', room['action']), ('exit', room['exit'])] + [
                (seat['id'], seat['approach']) for seat in room['seats']]:
            self.assertTrue(any(math.hypot(x - target['x'], y - target['y']) <= step * 1.5
                                for x, y in points), label)
