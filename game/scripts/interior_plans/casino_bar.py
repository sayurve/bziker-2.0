"""Source-backed casino and pub plans, composed of independent native sprites.

Consumed after Room has built its floor/walls and before fit_visual_shell().
No source scene overlay or new game mechanic is introduced here.
"""

FLOOR_HEIGHTS = {'casino': 560, 'messages': 500}


def _at(s, name, kind, asset, cx, y, height, foot=30, direction='front'):
    """Place a native-aspect prop by its support centre, including its solid."""
    p = s.prop(name, kind, asset, cx, y, height, foot, direction)
    delta = -p['width'] / 2
    p['x'] += delta
    p['visual']['x'] += delta
    for solid in s.r['solids']:
        if solid.get('prop_id') == name:
            solid['x'] += delta
    return p


def _side_seat(s, table, number, side, cx, y):
    left = side == 'left'
    p = _at(s, f'table-{number}:{side}', 'chair',
            'bar-pivkovy-tuz-interior-chair', cx, y, 64, 28,
            'right' if left else 'left')
    s.seat(p, p['id'], 'right' if left else 'left')
    seat = s.r['seats'][-1]
    seat['table_id'] = table['id']
    seat['approach'] = {'x': p['x'] - 36 if left else p['x'] + p['width'] + 36,
                        'y': p['y'] + p['height']}


def build(s):
    room_id = s.r['id']
    if room_id not in FLOOR_HEIGHTS:
        return False
    # Do not inherit stale furniture, service supports or old seat locations.
    for key in ('props', 'solids', 'seats', 'details'):
        s.r[key] = []
    for key in ('action', 'counter', 'staff'):
        s.r[key] = {}
    L, R, T, C = s.L, s.R, s.T, s.C
    D = s.play_bottom - T
    s.r['circulation'] = {'entry': {'x': C - 64, 'y': T + 180,
                                   'width': 128, 'height': D - 180}}
    if room_id == 'casino':
        service = s.service('casino-interior-cash-module', L + 45, T + 22, 140, 45)
        s.staff('casino-interior-cashier', service)
        for i, cx in enumerate((C - 62, C + 62), 1):
            _at(s, f'slot-{i}', 'slot', 'casino-interior-slot', cx, T + 24, 135, 38)
            chair = _at(s, f'slot-seat-{i}', 'chair', 'casino-interior-chair-front',
                        cx, T + 125, 60, 28, 'back')
            s.seat(chair, f'slots:seat-{i}', 'up')
        bar = _at(s, 'bar', 'bar', 'casino-interior-bar-counter', R - 180, T + 30, 95, 45)
        for i, cx in enumerate((R - 236, R - 124), 1):
            stool = _at(s, f'bar-seat-{i}', 'chair', 'casino-interior-bar-stool',
                        cx, T + 130, 55, 28)
            s.seat(stool, f'bar:seat-{i}', 'up')
        for name, kind, asset, cx in (
                ('roulette', 'roulette-table', 'casino-interior-roulette', L + 240),
                ('poker-one', 'poker-table', 'casino-interior-card-table', R - 240)):
            table = _at(s, name, kind, asset, cx, T + 282, 90, 55)
            for i, dx in enumerate((-80, 0, 80), 1):
                north = _at(s, f'{name}:north-{i}', 'chair', 'casino-interior-chair-front',
                            cx + dx, T + 215, 60, 25)
                south = _at(s, f'{name}:south-{i}', 'chair', 'casino-interior-chair-front',
                            cx + dx, T + 375, 60, 30, 'back')
                s.seat(north, f'{name}:north-{i}', 'down', approach_from='back')
                s.r['seats'][-1]['table_id'] = name
                s.seat(south, f'{name}:south-{i}', 'up')
                s.r['seats'][-1]['table_id'] = name
        _at(s, 'plant', 'plant', 'casino-interior-plant', R - 40, T + 105, 75, 28)
        for name, fraction, width in [('cash-sign', .12, 145), ('entry-door', .025, 65),
                                      ('emblem', .5, 150)]:
            s.wall_detail(name, 'casino-interior-' + name, fraction, width)
        s.detail('shelf', 'casino-interior-shelf', R - 180, T - 8, height=108)
        for i, f in enumerate((.30, .70), 1):
            s.wall_detail(f'chandelier-{i}', 'casino-interior-chandelier', f, 130)
        s.lights('casino-interior-wall-lamp', 4, defer_layout=True)
        s.detail('cup', 'casino-interior-cup', bar['x'] + bar['width'] * .75,
                 bar['depth'] - 48, width=15, layer='object', support_id='bar')
    else:
        service = s.service('bar-pivkovy-tuz-interior-counter', L + 38, T + 28, 96, 50, 'bar')
        # The shared service default (+40) falls inside the middle stool's
        # 14-unit body clearance. Use the real aisle between counter and seats.
        s.r['action']['y'] = T + 103
        s.staff('mascot-location-bar', service)
        for i, cx in enumerate((L + 88, L + 178, L + 268), 1):
            stool = _at(s, f'bar-stool-{i}', 'chair', 'bar-pivkovy-tuz-interior-bar-stool',
                        cx, T + 128, 60, 28)
            s.seat(stool, f'bar-stool-{i}', 'up')
        # Rear-right conversation table and two foreground groups flank a
        # continuous central aisle. External side approaches match real views.
        for i, (cx, y) in enumerate(((R - 185, T + 130),
                                      (L + 205, T + 292), (R - 205, T + 292)), 1):
            table = _at(s, f'table-{i}', 'table', 'bar-pivkovy-tuz-interior-pub-table',
                        cx, y, 72, 42)
            for side, dx in (('left', -96), ('right', 96)):
                _side_seat(s, table, i, side, cx + dx, y + 10)
        s.detail('bottle-shelf', 'bar-pivkovy-tuz-interior-bottle-shelf',
                 service['x'] + service['width'] * .5, T - 8, height=100)
        for name, f, width in [('window', .80, 150), ('door', .03, 65), ('sign', .51, 190)]:
            s.wall_detail(name, 'bar-pivkovy-tuz-interior-' + name, f, width)
        for i, f in enumerate((.35, .70), 1):
            s.wall_detail(f'pendant-{i}', 'bar-pivkovy-tuz-interior-pendant', f, 45)
        s.lights('bar-pivkovy-tuz-interior-wall-lamp', 2, defer_layout=True)
        # A pair on opposite clear wall sections, rather than both being
        # displaced into the same gap beside the window by automatic fitting.
        # Shrink width and height together to retain the supplied native view.
        lamps = [d for d in s.r['details'] if d['id'].startswith('wall-light-')]
        for lamp, x in zip(lamps, (L + 76, R - 60)):
            v = lamp['visual']
            v['width'] *= 60 / v['height']
            v['height'] = 60
            v['x'] = x
            lamp['preferred_x'] = x
    s.r['plan_version'] = 26
    return True
