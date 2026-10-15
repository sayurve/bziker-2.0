"""Explicit positions for isolated SQLite test fixtures, never player movement."""


def fixture_position(world, uid, x, y, scene='city', scene_id=None):
    """Arrange a body-clear test start without teleporting via the movement API.

    Tests for movement, admission, and travel still exercise their real methods.
    This only replaces long jumps used to arrange unrelated action assertions.
    """
    from world import remember_position, valid_base_position, valid_position
    with world.game.transaction() as db:
        clear = (valid_base_position(db, scene_id, x, y) if scene == 'base'
                 else valid_position(scene, x, y, scene_id))
        assert clear, (scene, scene_id, x, y)
        db.execute('''INSERT OR REPLACE INTO presence
            (account_id,x,y,scene,scene_id,updated,pose,phone_open)
            VALUES (?,?,?,?,?,?,'idle',0)''',
            (uid, x, y, scene, scene_id, world.clock()))
        remember_position(db, uid, x, y, scene, scene_id)
