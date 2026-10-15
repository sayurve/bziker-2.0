"""Independent community-room contents, built on the existing Room shell/API.

Only existing native component PNGs are placed. Display scenes remain static
art; the single service in each room opens its existing feature. Physical
supports and seats share Room.prop/seat geometry, on the 80-unit actor scale.
"""
FLOOR_HEIGHTS = {'arena': 500, 'results': 440, 'clans': 540, 'terrace': 540}


def _sofa(s, name, style, x, y, facing='up'):
    p = s.prop(name, 'sofa', 'clan-furniture-sofa-'+style, x, y, 70, 38,
               'back' if facing == 'up' else 'front')
    s.seat(p, name, facing, count=2)
    return p


def _conversation(s, name, style, x, y):
    """A real table, two chairs on either side and independent approaches."""
    table = s.prop(name, 'table', 'clan-furniture-table-'+style, x, y, 70, 45)
    for i, xx in enumerate([x+12, x+table['width']-52], 1):
        north = s.prop(f'{name}:north-{i}', 'chair', 'clan-furniture-chair-'+style,
                       xx, y-65, 60, 25, 'front')
        south = s.prop(f'{name}:south-{i}', 'chair', 'clan-furniture-chair-'+style,
                       xx, y+90, 60, 28, 'back')
        s.seat(north, north['id'], 'down', approach_from='back')
        s.seat(south, south['id'], 'up')
    return table


def _hub_details(s, gallery=False):
    s.wall_detail('header', 'bzik-hub-interior-header', .50, 220)
    s.wall_detail('entry-door', 'bzik-hub-interior-entry-door', .045, 65)
    s.wall_detail('overhead-light', 'bzik-hub-interior-overhead-light', .76, 75)
    if not gallery:
        s.wall_detail('selector-sign', 'bzik-hub-interior-selector-sign', .26, 140)
    s.lights('bzik-hub-interior-sconce', 4, defer_layout=True)
    # These are native floor fixtures, not decorative meshes blocking a path.
    for i, fraction in enumerate([.18, .82], 1):
        s.detail(f'floor-light-{i}', 'bzik-hub-interior-floor-light',
                 s.L+(s.R-s.L)*fraction, s.play_bottom-5, width=18)
    s.detail('entry-steps', 'bzik-hub-interior-entry-steps',
             s.C, s.floor_bottom+2, width=130, layer='foreground')


def _arena(s):
    L, R, T, C = s.L, s.R, s.T, s.C
    service = s.service('bzik-hub-interior-central-statue', C-50, T+10, 120, 48, 'trophy')
    s.staff('mascot-location-mall', service)
    s.prop('blue', 'board', 'bzik-hub-interior-battle-blue', L+75, T+50, 145, 45)
    s.prop('violet', 'board', 'bzik-hub-interior-battle-violet', R-250, T+50, 145, 45)
    _sofa(s, 'spectator-blue', 'modern', L+95, T+205)
    _sofa(s, 'spectator-violet', 'modern', R-260, T+205)
    for i, x in enumerate([L+25, R-65], 1):
        s.prop(f'plant-{i}', 'plant', 'bzik-hub-interior-plant', x, T+110, 70, 28)
    _hub_details(s)


def _results(s):
    L, R, T, C = s.L, s.R, s.T, s.C
    # A terminal opens the existing ratings/history UI. There is no fabricated
    # live leaderboard in the static native PNGs or additional game endpoint.
    service = s.service('clan-furniture-computer-desk-modern', L+45, T+25, 80, 40, 'table')
    s.staff('mascot-location-mall', service)
    s.prop('gallery-trophy', 'trophy', 'bzik-hub-interior-central-statue', C-44, T+20, 108, 45)
    s.prop('gallery-hologram', 'board', 'clan-furniture-hologram-tech', R-285, T+30, 110, 32)
    s.prop('result-archives', 'bookcase', 'clan-furniture-bookcase-modern', R-145, T+25, 130, 32)
    _sofa(s, 'gallery-seat-left', 'modern', L+65, T+155)
    _sofa(s, 'gallery-seat-right', 'modern', R-260, T+155)
    for i, x in enumerate([L+20, R-58], 1):
        s.prop(f'plant-{i}', 'plant', 'bzik-hub-interior-plant', x, T+95, 70, 28)
    _hub_details(s, gallery=True)


def _clans(s):
    L, R, T, C = s.L, s.R, s.T, s.C
    service = s.service('clan-furniture-table-modern', L+45, T+20, 65, 40, 'table')
    s.staff('mascot-location-clan', service)
    s.prop('registry-terminal', 'display-desk', 'clan-furniture-computer-desk-modern', C-80, T+25, 75, 40)
    chair = s.prop('registry-seat', 'chair', 'clan-furniture-chair-modern', C-25, T+110, 60, 28, 'back')
    s.seat(chair, chair['id'], 'up')
    s.prop('management-screen', 'board', 'clan-furniture-hologram-tech', R-125, T+25, 120, 35)
    s.prop('archives', 'bookcase', 'clan-furniture-bookcase-modern', L+30, T+210, 135, 32)
    _conversation(s, 'conference-table', 'modern', R-310, T+210)
    _sofa(s, 'waiting-sofa', 'modern', L+65, T+330, facing='down')
    for i, x in enumerate([L+25, R-65], 1):
        s.prop(f'plant-{i}', 'plant', 'clan-furniture-plant-modern', x, T+365, 70, 28)
    s.wall_detail('clock', 'station-interior-clock', .32, 45)
    s.lights('station-interior-wall-lamp', 4, defer_layout=True)


def _terrace(s):
    L, R, T, C = s.L, s.R, s.T, s.C
    service = s.service('clan-furniture-table-wood', C-65, T+20, 65, 40, 'table')
    s.staff('mascot-location-clan', service)
    s.prop('reading-library', 'bookcase', 'clan-furniture-bookcase-wood', L+25, T+20, 135, 32)
    _sofa(s, 'reading-sofa', 'wood', R-220, T+20, facing='down')
    _conversation(s, 'conversation-left', 'wood', L+95, T+185)
    _conversation(s, 'conversation-right', 'wood', R-275, T+220)
    for i, x in enumerate([L+25, R-60], 1):
        s.prop(f'plant-{i}', 'plant', 'clan-furniture-plant-wood', x, T+365, 70, 28)
    s.wall_detail('clock', 'station-interior-clock', .62, 45)
    s.lights('station-interior-wall-lamp', 4, defer_layout=True)


def build(s):
    """Replace only content of these four rooms; return False for other plans."""
    build_room = {'arena': _arena, 'results': _results, 'clans': _clans, 'terrace': _terrace}.get(s.r['id'])
    if build_room is None:
        return False
    for field in ['props', 'solids', 'seats', 'details', 'zones']:
        s.r[field] = []
    s.r['action'], s.r['counter'] = {}, {}
    s.r.pop('staff', None)
    build_room(s)
    return True
