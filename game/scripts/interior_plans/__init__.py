"""Room-specific plans built from independent native objects and shared physics."""
from importlib import import_module

PLAN_MODULES = ('casino_bar', 'shops', 'community')


def modules():
    return [import_module(f'{__name__}.{name}') for name in PLAN_MODULES]


def floor_height(room_id, fallback):
    values = [module.FLOOR_HEIGHTS[room_id] for module in modules()
              if room_id in module.FLOOR_HEIGHTS]
    if len(values) > 1:
        raise ValueError('More than one plan owns room ' + room_id)
    return values[0] if values else fallback


def build(room):
    owners = [module for module in modules() if room.r['id'] in module.FLOOR_HEIGHTS]
    if len(owners) > 1:
        raise ValueError('More than one plan owns room ' + room.r['id'])
    if not owners:
        return False
    if owners[0].build(room) is not True:
        raise ValueError('Room plan did not build ' + room.r['id'])
    room.r['layout_version'] = 26
    room.r['visual_version'] = 26
    return True
