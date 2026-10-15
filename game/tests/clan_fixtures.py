"""Explicit pre-construction-era homes for retained-data regression tests."""
import json


def legacy_home(game, cid, building_id='base-1', exterior_style=0):
    # This fixture models an already assigned v4/v5 home. New construction is
    # exercised independently through the four-member, nearby-leader API.
    with game.transaction() as db:
        row = db.execute('SELECT base,color FROM clans WHERE id=?', (cid,)).fetchone()
        base = json.loads(row['base']) | {'exterior_style': exterior_style,
                                         'exterior_color': row['color'], 'exterior_locked': True}
        db.execute('UPDATE clans SET building_id=?,base=? WHERE id=?',
                   (building_id, json.dumps(base), cid))


def approach_base_seat(world, uid, cid, seat):
    """Arrange a body-clear approach; only the seat action claims contact."""
    from world import nearest_base_position
    from world_fixtures import fixture_position
    with world.game.transaction() as db:
        point = nearest_base_position(db, cid, seat['x'], seat['y'])
    fixture_position(world, uid, *point, scene='base', scene_id=cid)
    return world.snapshot(uid)
