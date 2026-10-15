#!/usr/bin/env python3
"""Assemble public rooms from registered, independent source PNGs.

The composed source scenes are reference-only. All physical supports, native
sprite anchors and service/seat positions are authored here in world units.
Run again after the city map changes to synchronize the eleven public doors.
"""
import json
import math
import sys
from pathlib import Path

# CLI and importlib-based validation both load the same portable plan package.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from interior_plans import floor_height as planned_floor_height, build as build_room_plan

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'web'
ASSETS = json.loads((WEB / 'design-data.js').read_text().split('=', 1)[1].strip().removesuffix(';'))['assets']
# Native total sprite heights use the same world units as the 80-high actor.
ACTOR_HEIGHT = 80
# The station reference spans 4.80 bench widths. At 620 its floor spanned
# 9.44 while its independently sized furniture stayed unchanged.
FLOOR_HEIGHTS = {'station': 310, 'casino': 640, 'clothing': 600,
                 'bar-pivkovy-tuz': 600, 'bzik-hub': 680}
# Measured inner material planes in the registered floor PNGs. The native
# border, entry apron, casino ornament and hub's blue runner stay untouched.
FLOOR_REGIONS = {
    'station': [[[120,98],[650,98],[731,256],[35,256]]],
    'clothing': [[[111,132],[661,132],[737,314],[34,314]]],
    'casino': [[[122,125],[645,125],[703,315],[64,315]]],
    'bar-pivkovy-tuz': [[[108,100],[663,100],[739,363],[27,363]]],
    'clan': [[[96,114],[676,114],[744,391],[23,391]]],
    'food': [[[96,114],[676,114],[744,391],[23,391]]],
    'furniture': [[[100,112],[666,112],[740,384],[25,384]]],
    'terrace': [[[103,112],[669,112],[744,392],[26,392]]],
    'bzik-hub': [
        [[333,85],[318,145],[295,218],[254,213],[213,203],[171,186],[142,166],[124,149],[130,133],[149,117],[182,102],[224,91],[270,85]],
        [[435,85],[450,145],[473,218],[514,213],[555,203],[597,186],[626,166],[644,149],[638,133],[619,117],[586,102],[544,91],[498,85]],
    ],
}

# Opaque upright body heights, measured from the registered side-panel PNGs.
# Their full bounding boxes include perspective depth as well as wall height.
# Sizing a whole side panel to the room depth formerly made station windows
# six people high. The body's 176-world-unit height is independent of room size.
SIDE_UPRIGHT_PIXELS = {
    'station': (256, 250), 'casino': (350, 333),
    'clothing': (322, 379), 'bar-pivkovy-tuz': (279, 259),
    'bzik-hub': (491, 566),
}


def asset(asset_id, direction='front'):
    value = ASSETS[asset_id]
    return value.get('views', {}).get(direction, value)


def ratio(asset_id, direction='front'):
    value = asset(asset_id, direction)
    b = value.get('solid_bbox', [0, 0, value['width'], value['height']])
    return (b[2] - b[0]) / (b[3] - b[1])


def visual(asset_id, x, y, width=None, height=None, direction='front', anchor_x=.5, anchor_y=1):
    aspect = ratio(asset_id, direction)
    if width is None:
        width = height * aspect
    if height is None:
        height = width / aspect
    return dict(x=round(x, 6), y=round(y, 6), width=round(width, 6), height=round(height, 6), anchorX=anchor_x, anchorY=anchor_y, crop='solid')


class Room:
    def __init__(self, old, family, floor_id, wall_ids, doors):
        self.old, self.family = old, family
        self.floor_height = planned_floor_height(old['id'], FLOOR_HEIGHTS.get(family, 600))
        self.floor_width = self.floor_height * ratio(floor_id)
        # One giant rear sprite made a station wall six actors tall. Repeat
        # independent native modules across its span instead, retaining each
        # module's aspect and the supplied wall texture. The hub is an atrium.
        wall_span = self.floor_width*.8
        wb=asset(wall_ids[0])['solid_bbox']
        # Clothing has two projecting corner wings in its rear sprite. Those
        # belong at the room's sides; repeating them makes gaps and sawteeth.
        panel_x = (68,692) if family == 'clothing' else (wb[0],wb[2])
        panel_ratio = (panel_x[1]-panel_x[0])/(wb[3]-wb[1])
        wall_count = 1 if family == 'bzik-hub' else math.ceil(wall_span/panel_ratio/220)
        panel_width = wall_span/wall_count
        wall_width = panel_width*(wb[2]-wb[0])/(panel_x[1]-panel_x[0])+(0 if family=='bzik-hub' else 4)
        wall_height = wall_width/ratio(wall_ids[0])
        self.floor_top = math.ceil(wall_height+80)
        self.floor_bottom = self.floor_top+self.floor_height
        self.play_top = self.floor_top+(80 if family == 'bzik-hub' else 40)
        self.play_bottom = self.floor_bottom-(80 if family == 'bzik-hub' else 60)
        width = math.ceil(self.floor_width + 160)
        center = width / 2
        left, right = center - self.floor_width * .34, center + self.floor_width * .34
        material = {'station':'tile','casino':'concrete','clothing':'tile',
                    'bar-pivkovy-tuz':'board','bzik-hub':'concrete',
                    'clan':'tile','terrace':'board','food':'tile','furniture':'parquet'}[family]
        tint = {'station':'#c5c3b9','clothing':'#d5cdbc','casino':'#8b2447',
                'bzik-hub':'#b3bac5'}.get(family)
        floor_texture = 'clan-surface-floor-'+material+'-texture'
        # Preserve the authored wood grain scale relative to the80-high actor.
        # Other materials retain their existing public-room scale.
        floor_tile_size = list(asset(floor_texture)['tile_world_size']) if material in ('board', 'parquet') else [320,320]
        self.r = dict(id=old['id'], label=old['label'], kind=old['kind'], width=width, height=self.floor_bottom+70,
                      bounds=dict(left=round(left, 6), right=round(right, 6), top=self.play_top, bottom=self.play_bottom),
                      door=doors[old['id']], spawn=dict(x=center, y=self.play_bottom-45), exit=dict(x=center, y=self.play_bottom-20),
                      action={}, solids=[], seats=[], counter={}, cutouts=[], props=[], zones=[],
                      entry_label=old.get('entry_label', old['label']), layout_version=23, visual_version=23,
                      modular_source=True, source_family=family, interaction_radius=110,
                      source_reference=old.get('source_scene', {}).get('asset_id'), surfaces=[], details=[],
                      actor_height=ACTOR_HEIGHT,
                      floor_material=dict(asset_id=floor_texture,
                                          color=tint, tile_world_size=floor_tile_size),
                      circulation=dict(entry=dict(x=center-60,y=self.play_top+185,width=120,
                                                  height=self.play_bottom-self.play_top-185)))
        self.L, self.R, self.T, self.C = left, right, self.play_top, center
        self.surface('floor', floor_id, center, self.floor_bottom, height=self.floor_height)
        b=asset(floor_id)['solid_bbox'];k=self.floor_height/(b[3]-b[1])
        self.r['floor_material']['regions']=[[[round(center-self.floor_width/2+(x-b[0])*k,6),
                                               round(self.floor_top+(y-b[1])*k,6)] for x,y in polygon]
                                              for polygon in FLOOR_REGIONS[family]]
        # Perspective wall modules retain their own aspect and remain behind actors.
        back, left_wall, right_wall = wall_ids
        # The wall's ground seam is the rear plane, not its projecting side wings.
        # These rows were measured on the registered native PNG solid body.
        # Hub arches require a curved-floor support oracle: central pillars
        # meet floor row60; outer pillars meet row91. Using bbox bottom363
        # against the oval's top56 leaves all four pillars suspended.
        joins = {'station':(215,82), 'casino':(198,98), 'clothing':(206,99),
                 'bar-pivkovy-tuz':(208,87), 'bzik-hub':(322,60)}
        wb=asset(back)['solid_bbox'];fb=asset(floor_id)['solid_bbox']
        join_wall,join_floor=joins.get(family,(wb[3],fb[1]))
        wall_scale=wall_width/(wb[2]-wb[0]);floor_scale=self.floor_height/(fb[3]-fb[1])
        wall_bottom=self.floor_top+(join_floor-fb[1])*floor_scale+(wb[3]-join_wall)*wall_scale+2
        module_centers=[center-wall_span/2+panel_width*(i+.5) for i in range(wall_count)]
        module_centers.sort(key=lambda x: abs(x-center))
        for i,x in enumerate(module_centers):
            visual_center=x-((panel_x[0]+panel_x[1]-wb[0]-wb[2])/2)*wall_scale
            self.surface('back-wall'+(f'-{i}' if i else ''), back, visual_center, wall_bottom, width=wall_width)
            self.r['surfaces'][-1]['source_join']={'wall_native_y':join_wall,'floor_native_y':join_floor,'floor_world_y':self.floor_top+(join_floor-fb[1])*floor_scale}
            if family == 'clothing':
                self.r['surfaces'][-1]['clip']={'x':x-panel_width/2-1,'y':wall_bottom-wall_height,
                                               'width':panel_width+2,'height':(join_wall-wb[1])*wall_scale+2}
        if family=='bzik-hub':
            self.r['surfaces'][-1]['source_join']['native_column_contacts']=[
                {'wall':[30,361],'floor':[99,91]},
                {'wall':[247,322],'floor':[272,60]},
                {'wall':[534,323],'floor':[501,60]},
                {'wall':[744,361],'floor':[668,91]}]
        # Side panel solid bodies stay outside the rectangular navigation plane.
        for name, wall, x, anchor in [('left-wall', left_wall, center-self.floor_width/2, 0), ('right-wall', right_wall, center+self.floor_width/2, 1)]:
            side_height = min(1000, self.floor_width*.145/ratio(wall), self.floor_height+wall_height)
            self.surface(name, wall, x, self.floor_bottom, height=side_height, anchor_x=anchor)

    def surface(self, name, asset_id, x, y, **size):
        self.r['surfaces'].append(dict(id=name, asset_id=asset_id, visual=visual(asset_id, x, y, **size)))

    def prop(self, name, kind, asset_id, x, y, visual_height, foot_depth=35, direction='front', solid=True):
        width = round(visual_height*ratio(asset_id, direction),6)
        p = dict(id=name, type=kind, x=round(x, 6), y=round(y, 6), width=width, height=foot_depth,
                 solid=solid, source_asset=asset_id, source_direction=direction,
                 visual=visual(asset_id, x+width/2, y+foot_depth, height=visual_height, direction=direction),
                 depth=round(y+foot_depth, 6))
        self.r['props'].append(p)
        if solid:
            self.r['solids'].append(dict(prop_id=name, x=p['x'], y=p['y'], width=width, height=foot_depth))
        return p

    def service(self, asset_id, x, y, visual_height=110, foot_depth=45, kind='cashier', direction='front'):
        p = self.prop('service', kind, asset_id, x, y, visual_height, foot_depth, direction)
        old = self.old['action']
        self.r['action'] = dict(id=old['id'], label=old['label'], prop_id='service',
                               x=p['x']+p['width']/2, y=y+foot_depth+40, radius=110)
        self.r['counter'] = dict(x=p['x'], y=p['y'], width=p['width'], height=foot_depth)
        return p

    def staff(self, asset_id, support, x=None):
        # The source counters are tall full sprites. A human-sized seller
        # stands alongside, rather than becoming completely hidden behind one.
        x = support['x'] + support['width'] + 42 if x is None else x
        y = support['y'] + support['height'] - 12
        # Only the grounded feet obstruct movement; the native head/body stays
        # a depth-sorted sprite. Share this support with client and server.
        feet = dict(x=round(x-12, 6), y=round(y-14, 6), width=24, height=14)
        self.r['staff'] = dict(x=round(x, 6), y=round(y, 6), source_asset=asset_id, source_direction='front',
                               visual=visual(asset_id, x, y, height=84), depth=round(y, 6), footprint=feet)
        self.r['solids'].append(dict(prop_id='staff', **feet))

    def detail(self, name, asset_id, x, y, width=None, height=None, layer='background', support_id=None):
        v = visual(asset_id, x, y, width, height)
        self.r['details'].append(dict(id=name, asset_id=asset_id, source_direction='front', visual=v,
                                      layer=layer, depth=y, interactive=False, collision=False, **({'supportId':support_id} if support_id else {})))

    def wall_detail(self, name, asset_id, fraction, width):
        self.detail(name, asset_id, self.L+(self.R-self.L)*fraction, self.T-45,
                    height=125 if 'door' in name else min(70,width/ratio(asset_id)))

    def seat(self, prop, name, facing='down', count=1, approach_from='front'):
        for i in range(count):
            x = prop['x'] + prop['width']*(i+.5)/count
            y = prop['y'] + prop['height']
            approach = dict(x=x, y=prop['y']-36 if approach_from=='back' else y+36)
            self.r['seats'].append(dict(id=f"interior:{self.r['id']}:{name}"+(f':seat-{i+1}' if count>1 else ''),
                                       prop_id=prop['id'], x=prop['x'], y=prop['y'], width=prop['width'], height=prop['height'], seat=dict(x=x,y=y), approach=approach, facing=facing))

    def lights(self, asset_id, count=4, defer_layout=False):
        height=min(70,46/ratio(asset_id));width=height*ratio(asset_id)
        bottom=self.T-45
        for i in range(count):
            preferred=self.L+(self.R-self.L)*(i+.5)/count
            if defer_layout:
                # fit_visual_shell mounts signs on their final wall datum and
                # checks lamp clearances there. Preliminary bottom-aligned
                # signs can otherwise reject a compact, valid wall.
                self.detail(f'wall-light-{i+1}',asset_id,preferred,bottom,height=height)
                continue
            candidates=[self.L+width/2+20+j*16 for j in range(int((self.R-self.L-width-40)/16)+1)]
            def clear(x):
                for detail in self.r['details']:
                    v=detail.get('visual')
                    if not v or detail.get('layer')!='background':continue
                    dx=v['x']-v['width']*v['anchorX'];dy=v['y']-v['height']*v['anchorY']
                    if x-width/2<dx+v['width']+12 and x+width/2>dx-12 and bottom-height<dy+v['height'] and bottom>dy:return False
                return True
            available=sorted((x for x in candidates if clear(x)),key=lambda x:abs(x-preferred))
            if not available:raise RuntimeError(f'{self.r["id"]}: no clear wall support for lamp {i+1}')
            self.detail(f'wall-light-{i+1}',asset_id,available[0],bottom,height=height)

    def fit_visual_shell(self):
        """Align artwork to the existing physical room; never move gameplay.

        All PNGs retain their native aspect. Repeating human-sized wall panels
        covers a long room; it never magnifies a single window into a tower.
        Clips cut away the front wall and stop perspective artwork entering an
        aisle. The original floors remain registered underneath their genuine
        flat materials, clipped to the same rectangle used by both simulators.
        """
        r, b = self.r, self.r['bounds']
        left, right, top, bottom = b['left'], b['right'], b['top'], b['bottom']
        width, depth, wall_height = right-left, bottom-top, 176
        previous = r['surfaces']
        floor = next(s for s in previous if s['id']=='floor')
        back = next(s for s in previous if s['id']=='back-wall')['asset_id']
        sides = [next(s for s in previous if s['id']==side+'-wall')['asset_id'] for side in ['left','right']]
        floor['clip'] = dict(x=left,y=top,width=width,height=depth)
        r['surfaces'] = [floor]
        r['floor_material']['regions'] = [[[left,top],[right,top],[right,bottom],[left,bottom]]]
        r['wall_body_height'] = wall_height
        r['visual_version'] = 25

        rear=asset(back)['solid_bbox']
        # Ground the rear *plane*, not its projecting perspective wings.
        # In the clothing PNG those wings extend 54 native pixels below the
        # back face. Bbox-bottom anchoring leaves that face hanging in space.
        rear_contact={'station':215,'casino':198,'clothing':206,
                      'bar-pivkovy-tuz':208,'bzik-hub':322}.get(self.family,rear[3])
        rear_scale=wall_height/(rear_contact-rear[1])
        panel_x=(68,692) if self.family=='clothing' else (rear[0],rear[2])
        panel_width=(panel_x[1]-panel_x[0])*rear_scale
        sprite_width=(rear[2]-rear[0])*rear_scale
        sprite_height=(rear[3]-rear[1])*rear_scale
        rear_bottom=top+2+(rear[3]-rear_contact)*rear_scale
        count = math.ceil(width/panel_width)
        start = self.C-count*panel_width/2
        for i in range(count):
            x=start+panel_width*(i+.5)
            centre=x-(panel_x[0]+panel_x[1]-rear[0]-rear[2])*rear_scale/2
            self.surface('back-wall'+(f'-{i}' if i else ''),back,centre,rear_bottom,width=sprite_width,height=sprite_height)
            clip_left=max(left,x-panel_width/2-1);clip_right=min(right,x+panel_width/2+1)
            r['surfaces'][-1].update(clip=dict(x=clip_left,y=top-wall_height+2,width=clip_right-clip_left,height=wall_height),
                                      wall_body_height=wall_height,
                                      source_join=dict(floor_world_y=top,wall_native_y=rear_contact,physical_boundary=True))

        # The supplied side PNGs are diagonal perspective sections from the
        # composed scenes. Their inner and outer ground corners have different
        # X/Y coordinates (for example clothing-left spans native y259..495).
        # Bottom-anchoring the full bbox lifts the rear corner above this room;
        # translating it down would put its other ground edge outside the
        # rectangular collision wall. Neither uniform scaling nor repeating
        # that perspective section can make it an orthogonal room side.
        # Use the genuine material cutaways below for both physical side walls.
        # The independent native rear panels keep the room's architecture and
        # 176-unit upright; no whole image is stretched to the room depth.
        material={'station':'metal','casino':'stone','clothing':'plaster',
                  'bar-pivkovy-tuz':'wood','bzik-hub':'metal',
                  'clan':'plaster','food':'plaster','furniture':'plaster','terrace':'wood'}[self.family]
        r['wall_cutaway']=dict(asset_id='clan-surface-wall-'+material+'-texture',
            tile_world_size=[160,160],color=None,
            regions=[dict(x=left-18,y=top,width=18,height=depth+20),
                     dict(x=right,y=top,width=18,height=depth+20),
                     dict(x=left,y=bottom,width=width,height=20)])

        # The 20-unit native baseboard makes the actual southern collision
        # boundary visible. Use a cutaway rather than a perspective floor lip
        # that used to sit 60–80 units beyond the stopping point.
        plinth='station-interior-back-wall' if self.family=='bzik-hub' else back
        panel_width=wall_height*ratio(plinth)
        count=math.ceil(width/panel_width)
        for i in range(count):
            self.surface('front-cutaway'+(f'-{i}' if i else ''),plinth,
                         left+panel_width*(i+.5),bottom+20,height=wall_height)
            r['surfaces'][-1]['clip']=dict(x=left,y=bottom,width=width,height=20)

        # Centre mounted details on one wall datum. A square clock and a wide
        # sign need common centres, not a common lower edge. Doors alone meet
        # the physical floor, and overhead pendants use the ceiling datum.
        centre_y=top-wall_height*.56
        for d in r['details']:
            v=d.get('visual')
            if not v:continue
            if d['layer']=='foreground':
                v['y']=bottom+20;d['depth']=v['y'];continue
            if d['layer']!='background' or v['y']>=top:continue
            if 'door' in d['id']:
                v['y']=top+2;d['mounting']='floor'
            elif 'pendant' in d['id'] or 'chandelier' in d['id'] or 'overhead-light' in d['id']:
                v['y']=top-wall_height+v['height']+6;d['mounting']='ceiling'
            else:
                v['y']=round(centre_y+v['height']/2,6);d['mounting']='wall-centre'
            d['depth']=v['y']
        if r['id']=='railway':
            booths=[p for p in r['props'] if p['id'] in ['service','ticket-window-2']]
            cash=next(d for d in r['details'] if d['id']=='cash-sign')
            cash['visual']['x']=round(sum(p['x']+p['width']/2 for p in booths)/len(booths),6)
            # In the compact reference-scale hall the timetable belongs left
            # of the cash sign. Keep all native sizes; remount the clock and
            # fixtures below the pendants rather than overlapping their art.
            timetable=next(d for d in r['details'] if d['id']=='departure-board')
            timetable['visual']['x']=round(left+80,6)
            clock=next(d for d in r['details'] if d['id']=='clock')
            clock['visual']['x']=round(left+480,6)
            pendant=next(d for d in r['details'] if d['id']=='pendant-2')
            pendant['visual']['x']=round(left+500,6)
            for mounted in [cash,clock]:
                mounted['visual']['y']+=10;mounted['depth']=mounted['visual']['y']
            for lamp in (d for d in r['details'] if d['id'].startswith('wall-light-')):
                lamp['visual']['y']+=20;lamp['depth']=lamp['visual']['y']
            door=next(d for d in r['details'] if d['id']=='platform-door')['visual']
            sign=next(d for d in r['details'] if d['id']=='platform-sign')
            sign['visual']['y']=sign['depth']=door['y']-door['height']-12

        # Place native light supports on the same centre line while leaving
        # at least 12 world units around the signs and clocks. This uses final
        # visual supports rather than the former mismatched bottom baselines.
        lamps=[d for d in r['details'] if d['id'].startswith('wall-light-')]
        others=[d for d in r['details'] if d['layer']=='background' and d not in lamps]
        for i,d in enumerate(lamps):
            v=d['visual'];preferred=d.get('preferred_x',left+width*(i+.5)/len(lamps))
            # An authored support can fit between a door and a shelf even
            # when the eight-unit fallback grid skips that narrow interval.
            candidates=[preferred]+[left+v['width']/2+20+j*8 for j in range(int((width-v['width']-40)/8)+1)]
            def clear(x):
                if not math.isfinite(x) or x-v['width']/2<left+12 or x+v['width']/2>right-12:return False
                for other in others:
                    z=other['visual'];dx=z['x']-z['width']*.5;dy=z['y']-z['height']
                    if x-v['width']/2<dx+z['width']+12 and x+v['width']/2>dx-12 and v['y']-v['height']<dy+z['height'] and v['y']>dy:return False
                return True
            choices=sorted((x for x in candidates if clear(x)),key=lambda x:abs(x-preferred))
            if not choices:raise RuntimeError(r['id']+': no readable wall light support')
            v['x']=round(choices[0],6);others.append(d)


def scene(old, doors):
    id = old['id']
    families = {'railway':'station', 'casino':'casino', 'profile':'clothing', 'shop-clothes':'clothing',
                'messages':'bar-pivkovy-tuz', 'arena':'bzik-hub', 'results':'bzik-hub'}
    family = families.get(id, {'clans':'clan', 'terrace':'terrace', 'shop-food':'food', 'shop-furniture':'furniture'}[id] if id not in families else '')
    if family in ['station','casino','clothing','bar-pivkovy-tuz','bzik-hub']:
        prefix = family+'-interior-'
        floor_id=prefix+'floor'
        wall_ids=[prefix+n for n in (['wall-back','wall-left','wall-right'] if family=='bzik-hub' else ['back-wall','left-wall','right-wall'])]
    else:
        material = {'clans':'tile','terrace':'board','shop-food':'tile','shop-furniture':'parquet'}[id]
        floor_id='clan-surface-floor-'+material
        wall_ids=['clan-surface-wall-'+('wood' if id=='terrace' else 'plaster'), 'station-interior-left-wall', 'station-interior-right-wall']
    s=Room(old,family,floor_id,wall_ids,doors)
    L,R,T,C=s.L,s.R,s.T,s.C
    W=R-L
    D=s.play_bottom-T
    if build_room_plan(s):
        pass
    elif id=='railway':
        service=s.service('station-interior-ticket-module', L+85,T+30,140,45)
        # Counter front ends at T+75, bench rear begins at T+121.8:
        # centre the action in the server-valid aisle between their feet.
        s.r['action']['y']=T+98
        s.prop('ticket-window-2','cashier','station-interior-ticket-module',L+410,T+30,140,45)
        s.prop('terminal','kiosk','station-interior-terminal',R-115,T+35,110,32)
        for n,x in enumerate([L+150,R-330],1):
            p=s.prop(f'bench-{n}','bench','station-interior-bench',x,T+D*.58,70,35)
            s.seat(p,f'bench-{n}',facing='down',count=3)
        for n,x in enumerate([L+35,R-70],1):s.prop(f'plant-{n}','plant','station-interior-plant',x,T+150,70,28)
        s.prop('suitcase','luggage','station-interior-suitcase',R-130,T+D*.63,50,22)
        s.prop('bin','bin','station-interior-bin',L+80,T+D*.78,45,25)
        s.staff('station-interior-cashier',service)
        for name,f,w in [('cash-sign',.20,180),('departure-board',.48,170),('clock',.58,45),('platform-door',.86,105),('platform-sign',.86,150)]:s.wall_detail(name,'station-interior-'+name,f,w)
        door=next(d for d in s.r['details'] if d['id']=='platform-door')['visual']
        sign=next(d for d in s.r['details'] if d['id']=='platform-sign')
        sign['visual']['y']=sign['depth']=door['y']-door['height']-12
        for n,f in enumerate([.30,.70],1):s.wall_detail(f'pendant-{n}','station-interior-pendant',f,150)
        s.lights('station-interior-wall-lamp',defer_layout=True)
    elif id=='casino':
        service=s.service('casino-interior-cash-module',L+35,T+20,140,45)
        s.staff('casino-interior-cashier',service)
        for i in range(2):
            x=C-180+i*155
            s.prop(f'slot-{i+1}','slot','casino-interior-slot',x,T+20,135,38)
            p=s.prop(f'slot-seat-{i+1}','chair','casino-interior-chair-front',x+18,T+120,60,30,'back')
            s.seat(p,f'slots:seat-{i+1}',facing='up')
        bar=s.prop('bar','bar','casino-interior-bar-counter',R-285,T+30,95,45)
        for i in range(2):
            p=s.prop(f'bar-seat-{i+1}','chair','casino-interior-bar-stool',R-250+i*120,T+120,55,30)
            s.seat(p,f'bar:seat-{i+1}',facing='up')
        for name,kind,asset_id,x in [('roulette','roulette-table','casino-interior-roulette',L+110),('poker-one','poker-table','casino-interior-card-table',R-370)]:
            table=s.prop(name,kind,asset_id,x,T+300,90,65)
            for i in range(3):
                xx=x+16+i*(table['width']-68)/2
                north=s.prop(f'{name}:north-{i+1}','chair','casino-interior-chair-front',xx,T+230,60,25)
                south=s.prop(f'{name}:south-{i+1}','chair','casino-interior-chair-front',xx,T+395,60,30,'back')
                s.seat(north,f'{name}:north-{i+1}','down',approach_from='back');s.r['seats'][-1]['table_id']=name
                s.seat(south,f'{name}:south-{i+1}','up');s.r['seats'][-1]['table_id']=name
        s.prop('plant','plant','casino-interior-plant',L+35,T+D-70,75,28)
        for name,f,w in [('cash-sign',.10,140),('shelf',.87,190),('entry-door',.025,65),('emblem',.50,130)]:s.wall_detail(name,'casino-interior-'+name,f,w)
        for n,f in enumerate([.3,.7],1):s.wall_detail(f'chandelier-{n}','casino-interior-chandelier',f,130)
        s.lights('casino-interior-wall-lamp',8)
        s.detail('cup','casino-interior-cup',bar['x']+bar['width']*.75,bar['depth']-48,width=15,layer='object',support_id='bar')
    elif family=='clothing':
        service=s.service('clothing-interior-counter',L+60,T+25,110,40)
        s.staff('clothing-interior-mascot',service)
        # The supplied shop plan groups both clothes rails on the left, shoes
        # on the right, and fitting rooms against the rear wall.
        for i in range(2):
            s.prop(f'fitting-{i+1}','fitting','clothing-interior-fitting-booth',R-310+i*140,T+30,125,55)
            s.prop(f'rail-{i+1}','rack','clothing-interior-rail',L+65+i*200,T+260,120,38)
            s.prop(f'shoe-shelf-{i+1}','shelf','clothing-interior-shoe-shelf',R-315+i*145,T+280,120,32)
        s.prop('mirror','mirror','clothing-interior-mirror',R-95,T+150,110,22)
        s.prop('plant','plant','clothing-interior-plant',L+25,T+140,75,28)
        for name,f,w in [('sign-clothes',.20,200),('sign-fitting',.84,190),('strip-light',.50,210)]:s.wall_detail(name,'clothing-interior-'+name,f,w)
        s.detail('entry-mat','clothing-interior-entry-mat',C,s.play_bottom+25,width=110)
        s.lights('clothing-interior-sconce')
    elif family=='bar-pivkovy-tuz':
        service=s.service('bar-pivkovy-tuz-interior-counter',L+45,T+25,96,50,'bar')
        s.staff('mascot-location-bar',service)
        for i in range(3):
            p=s.prop(f'bar-stool-{i+1}','chair','bar-pivkovy-tuz-interior-bar-stool',L+70+i*100,T+145,60,28)
            s.seat(p,f'bar-stool-{i+1}','up')
        for i,(x,y) in enumerate([(R-235,T+120),(L+150,T+335),(R-235,T+335)],1):
            s.prop(f'table-{i}','table','bar-pivkovy-tuz-interior-pub-table',x,y,80,45)
            for side,xx,direction,facing in [('left',x-85,'right','right'),('right',x+125,'left','left')]:
                p=s.prop(f'table-{i}:{side}','chair','bar-pivkovy-tuz-interior-chair',xx,y+10,70,30,direction)
                s.seat(p,f'table-{i}:{side}','up');s.r['seats'][-1]['facing']=facing
        for name,f,w in [('bottle-shelf',.19,250),('window',.77,170),('door',.03,65),('sign',.51,200),('pendant',.63,45)]:s.wall_detail(name,'bar-pivkovy-tuz-interior-'+name,f,w)
        s.lights('bar-pivkovy-tuz-interior-wall-lamp')
    elif family=='bzik-hub':
        service=s.service('bzik-hub-interior-central-statue',C-52,T+20,130,55,'trophy')
        s.staff('mascot-location-mall',service)
        for name,x,asset_id in [('blue',L+100,'bzik-hub-interior-battle-blue'),('violet',R-280,'bzik-hub-interior-battle-violet')]:s.prop(name,'board',asset_id,x,T+250,160,60)
        for n,x in enumerate([L+35,R-75],1):s.prop(f'plant-{n}','plant','bzik-hub-interior-plant',x,T+80,75,28)
        for name,f,w in [('header',.5,240),('selector-sign',.27,150),('overhead-light',.73,65),('entry-door',.04,65),('backdrop-amber',.90,80)]:s.wall_detail(name,'bzik-hub-interior-'+name,f,w)
        s.lights('bzik-hub-interior-sconce')
        for i,f in enumerate([.35,.65],1):s.detail(f'floor-light-{i}','bzik-hub-interior-floor-light',L+W*f,s.play_bottom-5,width=25)
        for i,f in enumerate([.15,.85],1):s.detail(f'front-rim-{i}','bzik-hub-interior-front-rim',L+W*f,s.floor_bottom+1,width=150,layer='foreground')
        s.detail('entry-steps','bzik-hub-interior-entry-steps',C,s.floor_bottom+2,width=130,layer='foreground')
    else:
        theme={'clans':'modern','terrace':'wood','shop-food':'modern','shop-furniture':'modern'}[id]
        native=lambda kind,style=theme:f'clan-furniture-{kind}-{style}'
        service=s.service('clothing-interior-counter' if id=='shop-food' else native('table'),L+40,T+25,110 if id=='shop-food' else 65,40,'cashier' if id=='shop-food' else 'table')
        s.staff('mascot-location-'+{'clans':'clan','terrace':'clan','shop-food':'food','shop-furniture':'furniture'}[id],service)
        if id=='clans':
            s.prop('management-screen','board',native('hologram','tech'),R-160,T+40,150,40)
            s.prop('archives','bookcase',native('bookcase'),L+45,T+230,140,35)
            s.prop('conference-table','table',native('table'),R-290,T+220,70,50)
            for i,x in enumerate([L+40,R-230],1):
                p=s.prop(f'sofa-{i}','sofa',native('sofa'),x,T+365,70,40)
                s.seat(p,f'sofa-{i}',facing='up',count=2)
        elif id=='terrace':
            for i,x in enumerate([L+100,R-300],1):
                s.prop(f'table-{i}','table',native('table'),x,T+235,75,45)
                for n,xx in enumerate([x+15,x+105],1):
                    p=s.prop(f'chair-{i}-{n}','chair',native('chair'),xx,T+340,65,30,'back')
                    s.seat(p,f'chair-{i}-{n}','up')
            s.prop('sofa','sofa',native('sofa'),R-240,T+40,75,40)
        elif id=='shop-food':
            s.r['source_gaps']=['The supplied pack has no separate grocery fridge or gondola PNG. Paired native display tables carry the supplied products and the glass cabinet region of the original food-kiosk PNG, without its exterior or roof.']
            displays=[]
            display_width=65*ratio(native('table'));pair_width=display_width*2+4
            for row,(prefix,y) in enumerate([('shelf',T+230),('goods-table',T+395)],1):
                for i,x in enumerate([L+120,R-120-pair_width],1):
                    display=s.prop(f'{prefix}-{i}','food-display',native('table'),x,y,65,40);displays.append(display)
                    case=s.prop(f'{prefix}-{i}-vitrine','food-display',native('table'),x+display_width+4,y,65,40)
                    s.r['details'].append(dict(id=case['id']+'-glass',asset_id='food-kiosk',source_rect=[209,291,373,357],
                        x=case['x']+case['width']/2,y=case['depth']-45,width=case['width']-24,
                        layer='object',depth=case['depth']+1,interactive=False,collision=False,supportId=case['id']))
            for display in displays:
                for i,prop in enumerate(['sandwich','food-packet','mug']):
                    s.r['details'].append(dict(id=display['id']+'-goods-'+str(i+1), source_prop=prop,
                        x=display['x']+display['width']*(i+1)/4, y=display['depth']-45,
                        width=24 if prop!='food-packet' else 20, layer='object',depth=display['depth']+1,
                        interactive=False,collision=False,supportId=display['id']))
        else:
            for i,(kind,x,y,h,d,style) in enumerate([('sofa',L+40,T+210,70,40,'loft'),('computer-desk',R-290,T+45,75,45,'tech'),('bookcase',R-215,T+230,140,35,'wood'),('table',L+65,T+365,65,45,'stone'),('chair',R-170,T+370,65,30,'modern')],1):
                s.prop(f'showroom-{i}',{'computer-desk':'display-desk'}.get(kind,kind),native(kind,style),x,y,h,d)
        for i,x in enumerate([L+20,R-70],1):s.prop(f'plant-{i}','plant',native('plant'),x,T+135,75,28)
        s.lights('station-interior-wall-lamp')
    # Display furniture remains usable: every genuine seat gets a clear approach.
    assigned={seat['prop_id'] for seat in s.r['seats']}
    for p in s.r['props']:
        if p['type'] in ['chair','sofa','bench'] and p['id'] not in assigned:
            s.seat(p,p['id'],facing='down',count=2 if p['type']=='sofa' else 1)
    s.fit_visual_shell()
    return s.r


def main():
    historical=WEB/'interiors-map-v19.json'
    current=WEB/'interiors-map.json'
    if not historical.exists():
        original=json.loads(current.read_text())
        if original['schema_version']!=19:
            raise RuntimeError('Preserve the genuine v19 reference before generating modular rooms')
        historical.write_bytes(current.read_bytes())
    old=json.loads(historical.read_text())
    city=json.loads((WEB/'world-map.json').read_text())
    doors={b['id']:b['door'] for b in city['buildings']}
    rooms=[scene(r,doors) for r in old['rooms']]
    document=dict(schema_version=25, source_assembly='independent native components; composed PNGs reference-only; artwork clipped to physical room boundaries', city_schema_version=city['schema_version'], rooms=rooms)
    current.write_text(json.dumps(document,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(dict(schema_version=25,city_schema_version=city['schema_version'],rooms=[dict(id=r['id'],size=[r['width'],r['height']],playable_depth=r['bounds']['bottom']-r['bounds']['top'],props=len(r['props']),seats=len(r['seats'])) for r in rooms]),ensure_ascii=False))


if __name__=='__main__':main()
