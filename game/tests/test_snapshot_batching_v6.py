"""Snapshot parity and bounded SQL work at the advertised 100-account limit."""
import itertools
import json
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch

from cards import CardService
from economy import change_inventory
from game import GameService
from world import BOATS, CITY_SPAWN, INTERIORS, WorldService
from clan_fixtures import legacy_home


def semantic_snapshots(directory):
    """Fixed identities/time; actual persisted scenes, roles, clans and ownership."""
    counter = itertools.count()
    identity = lambda: 'parity-id-' + str(next(counter))
    with patch('game.token', identity), patch('world.token', identity), patch('cards.token', identity):
        game = GameService(Path(directory) / 'semantic.db')
        world = WorldService(game, clock=lambda: 1000)
        cards = CardService(game, clock=lambda: 1000)
        users = [game.create_account() for _ in range(13)]
        for index, uid in enumerate(users):
            game.profile(uid, {'name': 'Parity ' + str(index), 'avatar': {'hairStyle': index % 12}})
        leader, member, guest, outsider, offline, juror, former, arena, card_player, second, request, hidden_request, archived = users
        clan = world.create_clan(leader, {'name': 'Zulu', 'color': '#112233', 'flag': 'Z'})['id']
        second_clan = world.create_clan(second, {'name': 'Alpha', 'color': '#abcdef', 'flag': 'A'})['id']
        archived_clan = world.create_clan(archived, {'name': 'Archive', 'color': '#ff8562', 'flag': 'X'})['id']
        legacy_home(game, clan, 'base-1')
        legacy_home(game, second_clan, 'base-2', exterior_style=2)
        world.mutate_clan(archived, archived_clan, 'leave', {})
        duty = game.create_lobby(outsider, {'title': 'Jury duty', 'mode': 'individual'})['id']
        active = game.create_lobby(arena, {'title': 'Active arena', 'mode': 'individual'})['id']
        table = cards.create(card_player, {'game': 'poker', 'source': 'casino', 'stake': 1})['id']
        boat = next(iter(BOATS.values()))
        room = INTERIORS['railway']
        with game.transaction() as db:
            for uid in (member, offline, juror):
                db.execute('INSERT INTO clan_members VALUES (?,?)', (uid, clan))
            for uid in (request, hidden_request):
                db.execute('INSERT INTO clan_requests VALUES (?,?)', (uid, clan))
            db.execute('INSERT INTO base_guests VALUES (?,?)', (clan, guest))
            base = {'items': [{'id': 'legacy-sofa', 'type': 'sofa', 'x': 1, 'y': 1}],
                    'exterior_locked': True, 'exterior_color': '#112233', 'exterior_style': 0}
            db.execute('UPDATE clans SET base=? WHERE id=?', (json.dumps(base), clan))
            for cid, value, win in ((clan, '0.1', 1), (clan, '0.2', 0), (second_clan, '0.3', 1), (archived_clan, '12.5', 1)):
                db.execute('INSERT INTO clan_results VALUES (?,?,?,?)', ('result-' + value, cid, value, win))
            lobby = game._load(db, duty, outsider)
            lobby['members'][juror] = {'role': 'curator', 'team': None}
            lobby['members'][hidden_request] = {'role': 'curator', 'team': None}
            game._save(db, lobby)
            match = game._load(db, active, arena)
            match['state'] = 'choosing'
            game._save(db, match)
            data = cards._load(db, table)
            data['state'] = 'playing'
            cards._save(db, data)
            for uid, item, quantity in ((leader, 'pet-dog', 1), (member, 'pet-cat', 1), (guest, 'pet-cat', 0)):
                change_inventory(db, uid, item, quantity)
                db.execute('INSERT INTO account_pets VALUES (?,?)', (uid, item))
            for uid, start in ((leader, 999), (member, 998), (outsider, 1001)):
                db.execute('INSERT INTO world_pet_effects VALUES (?,?,?,?,?,?)',
                           (uid, 'effect-' + uid, 'pet-dog', 'dog', start, 2))
            db.execute('UPDATE world_boats SET occupant_id=?,updated=? WHERE id=?', (guest, 1000, boat['id']))
            scene_rows = [(leader, *CITY_SPAWN, 'city', None), (member, *CITY_SPAWN, 'city', None),
                          (guest, boat['dock']['x'], boat['dock']['y'], 'city', None),
                          (outsider, *CITY_SPAWN, 'city', None), (juror, *CITY_SPAWN, 'city', None),
                          (former, room['spawn']['x'], room['spawn']['y'], 'interior', room['id']),
                          (arena, 600, 510, 'arena', active), (card_player, 600, 510, 'cards', table),
                          (second, 600, 670, 'base', second_clan)]
            for uid, x, y, scene, sid in scene_rows:
                db.execute('INSERT INTO presence(account_id,x,y,scene,scene_id,updated,phone_open) VALUES (?,?,?,?,?,?,?)',
                           (uid, x, y, scene, sid, 1000, int(uid == member)))
                db.execute('INSERT INTO active_accounts VALUES (?,?) ON CONFLICT(account_id) DO UPDATE SET updated=excluded.updated',
                           (uid, 1000))
        results = {'city': world.snapshot(leader), 'own_boat': world.snapshot(guest),
                   'interior': world.snapshot(former), 'second_base': world.snapshot(second),
                   'arena': world.snapshot(arena), 'cards': world.snapshot(card_player),
                   'restricted': world.snapshot(juror)}
        world.boat_action(guest, {'action': 'boat-exit', 'target_id': boat['id']})
        results['guest_base'] = world.move(guest, {'scene': 'base', 'clan_id': clan, 'x': 600, 'y': 670})
        results['member_base'] = world.move(member, {'scene': 'base', 'clan_id': clan, 'x': 600, 'y': 670})
        game.profile(leader, {'avatar': {'hairStyle': 4}})
        with game.transaction() as db:
            change_inventory(db, leader, 'pet-cat', 1)
            db.execute('UPDATE account_pets SET item_id=? WHERE account_id=?', ('pet-cat', leader))
            db.execute('INSERT INTO clan_results VALUES (?,?,?,?)', ('fresh-result', clan, '1.7', 1))
        results['after_mutation'] = world.snapshot(leader)
        return results


class SnapshotBatchingV6Tests(unittest.TestCase):
    def test_full_snapshot_parity_for_scenes_privacy_ownership_and_fresh_changes(self):
        expected = json.loads((Path(__file__).parent / 'fixtures' / 'snapshot-v6-before-batching.json').read_text())
        # v8 changes only the authoritative room plan; all account/role/ownership
        # and privacy fields still compare with the original batching fixture.
        expected['interior']['interior'] = INTERIORS['railway']
        # The parity actor is seeded at the actual room entrance. Adapt only
        # that geometric expectation, retaining the original identity and every
        # privacy, role, inventory and ownership field in the independent oracle.
        entry = INTERIORS['railway']['spawn']
        expected['interior']['position'] = dict(entry)
        for player in expected['interior']['players']:
            player.update(x=entry['x'], y=entry['y'])
        # Keep the original identity/privacy/ownership oracle. The new city
        # changes only its map coordinates: arrival, docks and boarding slots.
        coordinates={(760,2610):CITY_SPAWN}
        for boat in expected['city']['boats']:
            current=BOATS[boat['id']]
            for key in ('dock','boarding'):
                old,new=boat[key],current[key]
                coordinates[(old['x'],old['y'])]=(new['x'],new['y'])
        def relocate_map_geometry(value):
            if isinstance(value, dict):
                point=coordinates.get((value.get('x'),value.get('y')))
                if point is not None:value.update(x=point[0],y=point[1])
                for nested in value.values():
                    relocate_map_geometry(nested)
            elif isinstance(value, list):
                for nested in value:
                    relocate_map_geometry(nested)
        relocate_map_geometry(expected)
        # v16 adds authoritative seat facing. The retained fixture contains
        # only legacy, unrotated furniture, whose independent expected facing
        # is down; every other snapshot field still uses the original oracle.
        for snapshot in expected.values():
            for seat in (snapshot.get('active_base') or {}).get('base', {}).get('seats', []):
                seat['facing'] = 'down'
        with tempfile.TemporaryDirectory() as directory:
            actual=semantic_snapshots(directory)
            # v7 adds only anonymous deterministic animals and a clock. Preserve
            # every original v6 field rather than regenerate the golden fixture.
            for label,snapshot in actual.items():
                self.assertEqual(snapshot['server_time'],1000,label)
                self.assertEqual(len(snapshot['animals']),12 if snapshot['scene']=='city' else 0,label)
                self.assertTrue(all('account_id' not in animal for animal in snapshot['animals']),label)
                self.assertIn('action_effect',snapshot,label);self.assertIn('holding',snapshot,label)
                self.assertIsNone(snapshot['action_effect'],label);self.assertIsNone(snapshot['holding'],label)
                for player in snapshot['players']:
                    self.assertIn('action_effect',player,label);self.assertIn('holding',player,label)
                    self.assertIsNone(player['action_effect'],label);self.assertIsNone(player['holding'],label)
            projected={label:{key:value for key,value in snapshot.items() if key not in ('server_time','animals','action_effect','holding')} for label,snapshot in actual.items()}
            for snapshot in projected.values():
                snapshot['players']=[{key:value for key,value in player.items() if key not in ('action_effect','holding')} for player in snapshot['players']]
            self.assertEqual(projected, expected)

    def test_100_player_snapshot_stays_within_a_constant_query_budget(self):
        with tempfile.TemporaryDirectory() as directory:
            game = GameService(Path(directory) / 'budget.db')
            world = WorldService(game, clock=lambda: 1000)
            CardService(game)
            users = [game.create_account() for _ in range(100)]
            for index, uid in enumerate(users):
                game.profile(uid, {'name': 'Budget ' + str(index)})
            cid = world.create_clan(users[0], {'name': 'Budget clan', 'color': '#123456', 'flag': 'B'})['id']
            with game.transaction() as db:
                for uid in users:
                    if uid != users[0]: db.execute('INSERT INTO clan_members VALUES (?,?)', (uid, cid))
                    db.execute('INSERT INTO presence(account_id,x,y,scene,scene_id,updated) VALUES (?,?,?,?,?,?)',
                               (uid, *CITY_SPAWN, 'city', None, 1000))
                    db.execute('INSERT INTO world_positions VALUES (?,?,?,?,?)', (uid, *CITY_SPAWN, 'city', None))
                    db.execute('INSERT INTO active_accounts VALUES (?,?) ON CONFLICT(account_id) DO UPDATE SET updated=excluded.updated',
                               (uid, 1000))
                    change_inventory(db, uid, 'pet-cat', 1)
                    db.execute('INSERT INTO account_pets VALUES (?,?)', (uid, 'pet-cat'))
                    change_inventory(db,uid,'trash',1)
                    from actions import start_action
                    start_action(db,uid,'eat',1000,item_id='snack')
            statements = []
            original = game.transaction
            @contextmanager
            def traced_transaction():
                with original() as db:
                    db.set_trace_callback(statements.append)
                    yield db
            game.transaction = traced_transaction
            snapshot = world.snapshot(users[0])
            self.assertEqual(snapshot['online_count'], 100)
            self.assertEqual([row['id'] for row in snapshot['players']], users)
            self.assertEqual(len(snapshot['my_clan']['members']), 100)
            self.assertTrue(all(row['pet'] == {'id': 'pet-cat', 'kind': 'cat'} for row in snapshot['players']))
            self.assertTrue(all(row['holding']=='litter' and row['action_effect']['type']=='eat' for row in snapshot['players']))
            self.assertLessEqual(len(statements), 80, f'100 profiles/clan/pets must not cause per-player reads: {len(statements)} SQL statements')


if __name__ == '__main__':
    unittest.main()
