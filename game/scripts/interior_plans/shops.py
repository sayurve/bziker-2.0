"""Human-scale, source-component plans for four different shop functions."""

FLOOR_HEIGHTS = {'profile': 360, 'shop-clothes': 440, 'shop-food': 440, 'shop-furniture': 480}


def _native(kind, theme='modern'):
    return f'clan-furniture-{kind}-{theme}'


def _approach(s, prop, offset=36):
    s.r['plan_approaches'].append(dict(prop_id=prop['id'], x=prop['x'] + prop['width'] / 2,
                                      y=prop['y'] + prop['height'] + offset))


def _lighting(s, signs=()):
    for name, asset, fraction, width in signs:
        s.wall_detail(name, asset, fraction, width)
    for i, fraction in enumerate([.25, .75], 1):
        s.wall_detail(f'overhead-light-{i}', 'clothing-interior-strip-light', fraction, 150)
    s.lights('clothing-interior-sconce', defer_layout=True)
    # Short sconces stay below ceiling strips at the final wall-centre datum.
    # Both dimensions change together, preserving the native aspect.
    for d in s.r['details']:
        if d['id'].startswith('wall-light-'):
            v = d['visual']
            factor = 50 / v['height']
            v['height'] = 50
            v['width'] *= factor


def _clothes(s):
    L, R, T, C = s.L, s.R, s.T, s.C
    service = s.service('clothing-interior-counter', L + 45, T + 20, 100, 40)
    s.staff('clothing-interior-mascot', service)
    for i, x in enumerate([R - 260, R - 135], 1):
        booth = s.prop(f'fitting-{i}', 'fitting', 'clothing-interior-fitting-booth', x, T + 20, 125, 55)
        _approach(s, booth)
    for i, x in enumerate([L + 35, L + 220], 1):
        rail = s.prop(f'rail-{i}', 'rack', 'clothing-interior-rail', x, T + 205, 120, 38)
        _approach(s, rail)
    for i, x in enumerate([C + 65, C + 200], 1):
        shelf = s.prop(f'shoe-shelf-{i}', 'shelf', 'clothing-interior-shoe-shelf', x, T + 220, 120, 32)
        _approach(s, shelf)
    mirror = s.prop('mirror', 'mirror', 'clothing-interior-mirror', R - 80, T + 140, 110, 22)
    _approach(s, mirror)
    s.prop('plant', 'plant', 'clothing-interior-plant', L + 15, T + 112, 70, 28)
    _lighting(s, [('sign-clothes', 'clothing-interior-sign-clothes', .21, 200),
                  ('sign-fitting', 'clothing-interior-sign-fitting', .77, 190)])
    s.detail('entry-mat', 'clothing-interior-entry-mat', C, s.play_bottom - 6, width=110)
    s.r['plan_purpose'] = 'Clothing retail: two private fitting booths, two garment rails, two genuine shoe racks.'


def _profile(s):
    L, R, T, C = s.L, s.R, s.T, s.C
    service = s.service(_native('computer-desk'), L + 40, T + 20, 70, 40, 'table')
    s.staff('clothing-interior-mascot', service)
    booth = s.prop('fitting-1', 'fitting', 'clothing-interior-fitting-booth', R - 160, T + 25, 125, 55)
    _approach(s, booth)
    mirror = s.prop('mirror', 'mirror', 'clothing-interior-mirror', R - 90, T + 145, 110, 22)
    _approach(s, mirror)
    sofa = s.prop('waiting-sofa', 'sofa', _native('sofa', 'loft'), L + 90, T + 155, 70, 40)
    s.seat(sofa, 'waiting-sofa', count=3)
    bookcase = s.prop('consultation-archive', 'bookcase', _native('bookcase'), C - 45, T + 25, 130, 30)
    _approach(s, bookcase)
    s.prop('plant', 'plant', 'clothing-interior-plant', L + 20, T + 95, 70, 28)
    _lighting(s)
    s.r['plan_purpose'] = 'Character consultation and wardrobe studio: one private booth, mirror, archive and waiting sofa; no retail rows.'


def _food_panel(s, prop):
    # This rectangle is the existing kiosk's actual glass/food section in its
    # registered 768px bitmap. No facade, roof, clothes stack or invented fridge.
    s.r['details'].append(dict(id=prop['id'] + '-glass', asset_id='food-kiosk',
        source_rect=[209, 291, 373, 357], x=prop['x'] + prop['width'] / 2,
        y=prop['depth'] - 38, width=prop['width'] - 20, layer='object',
        depth=prop['depth'] + 1, interactive=False, collision=False, supportId=prop['id']))
    for i, kind in enumerate(['sandwich', 'food-packet', 'mug'], 1):
        s.r['details'].append(dict(id=f"{prop['id']}-goods-{i}", source_prop=kind,
            x=prop['x'] + prop['width'] * i / 4, y=prop['depth'] - 43,
            width=22 if kind != 'food-packet' else 18, layer='object', depth=prop['depth'] + 2,
            interactive=False, collision=False, supportId=prop['id']))


def _food(s):
    L, R, T, C = s.L, s.R, s.T, s.C
    service = s.service(_native('table'), L + 30, T + 20, 65, 40, 'table')
    s.staff('mascot-location-food', service)
    _food_panel(s, service)
    for row, y in enumerate([T + 145, T + 255], 1):
        for side, x in [('left', C - 225), ('right', C + 65)]:
            display = s.prop(f'food-row-{row}-{side}', 'food-display', _native('table'), x, y, 65, 40)
            _food_panel(s, display)
            _approach(s, display, 28)
    s.prop('plant', 'plant', _native('plant'), R - 75, T + 25, 70, 28)
    _lighting(s)
    s.r['source_gaps'] = [
        'No dedicated grocery interior, refrigerator or supermarket gondola PNG exists in the supplied pack. This is an adapted food shop: genuine empty modular tables, kiosk glass/food pixels and native food props, not an exact source-scene copy.'
    ]
    s.r['plan_purpose'] = 'Food retail: checkout and two paired low product rows, broad central aisle; no bar seating or clothing counter.'


def _furniture(s):
    L, R, T, C = s.L, s.R, s.T, s.C
    service = s.service(_native('table'), L + 30, T + 20, 65, 40, 'table')
    s.staff('mascot-location-furniture', service)
    desk = s.prop('showroom-desk', 'display-desk', _native('computer-desk', 'tech'), R - 220, T + 25, 75, 45)
    _approach(s, desk)
    bookcase = s.prop('showroom-bookcase', 'bookcase', _native('bookcase', 'wood'), C + 20, T + 20, 130, 35)
    _approach(s, bookcase)
    sofa = s.prop('showroom-sofa', 'sofa', _native('sofa', 'loft'), C - 251, T + 190, 70, 40)
    s.seat(sofa, 'showroom-sofa', count=3)
    coffee = s.prop('showroom-coffee-table', 'coffee-table', _native('table', 'loft'), C - 181, T + 302, 45, 30)
    _approach(s, coffee, 24)
    dining = s.prop('showroom-dining-table', 'table', _native('table', 'wood'), C + 95, T + 200, 65, 45)
    # Inspect the table from its side, without placing an approach in a chair.
    s.r['plan_approaches'].append(dict(prop_id=dining['id'], x=dining['x'] - 28, y=dining['y'] + 22))
    for name, y, direction, facing, approach in [('north', T + 130, 'front', 'down', 'back'),
                                                ('south', T + 282, 'back', 'up', 'front')]:
        chair = s.prop('dining-chair-' + name, 'chair', _native('chair', 'wood'), C + 115, y, 60, 25 if name == 'north' else 30, direction)
        s.seat(chair, 'dining-chair-' + name, facing=facing, approach_from=approach)
    s.prop('plant', 'plant', _native('plant', 'wood'), L + 20, T + 110, 70, 28)
    _lighting(s)
    s.r['source_gaps'] = ['No dedicated furniture-store interior exists. Three walkable showroom groups reuse real four-view furniture; no unavailable wardrobe or floor-lamp layer is claimed.']
    s.r['plan_purpose'] = 'Furniture showroom: lounge, dining set and office group, all with clear inspection and seat approaches.'


def build(s):
    room_id = s.r['id']
    if room_id not in FLOOR_HEIGHTS:
        return False
    for key in ['props', 'solids', 'seats', 'details', 'zones', 'plan_approaches']:
        s.r[key] = []
    s.r['action'], s.r['counter'] = {}, {}
    s.r.pop('staff', None)
    s.r.pop('source_gaps', None)
    {'profile': _profile, 'shop-clothes': _clothes, 'shop-food': _food, 'shop-furniture': _furniture}[room_id](s)
    # The supplied service API retains old action ids/labels. Validate rather
    # than invent a replacement feature or attach an action to decoration.
    assert s.r['action']['id'] == s.old['action']['id']
    s.r['circulation'] = dict(entry=dict(x=s.C - 60, y=s.T + 120, width=120,
                                       height=s.play_bottom - s.T - 120))
    s.r['layout_version'] = 26
    return True
