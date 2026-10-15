"""Persistent city presence and clans, with server-enforced jury privacy."""
import json
import math
import re
import time
import hmac
import threading
from contextlib import contextmanager
from decimal import Decimal
from pathlib import Path
from game import bounded, require, token
from water import lake_contains, nearest_shore, nearest_pedestrian_shore, segment_stays_in_lake, pedestrian_lake_contains, pedestrian_segment_crosses_lake
from animals import animals_at, current_pauses
from actions import initialize_schema as initialize_actions, effect_from_row, action_snapshot

MAX_ONLINE = 100
PRESENCE_TTL = 45
BODY_RADIUS = 14
WEB_ROOT=Path(__file__).resolve().parent/'web'
WORLD_MAP=json.loads((WEB_ROOT/'world-map.json').read_text())
WORLD_INTERACTION_RADII={'door':110,'bench':110,**WORLD_MAP.get('interaction_radii',{})}
FURNITURE_MAP=json.loads((WEB_ROOT/'furniture-map.json').read_text())
FURNITURE_TYPES={kind['id']:kind for kind in FURNITURE_MAP['types']}
CITY_BOUNDS=tuple(WORLD_MAP['walkable'][key] for key in ('left','right','top','bottom'))
CITY_SPAWN=tuple(WORLD_MAP['spawn'][key] for key in ('x','y'))
DISTRICT_SPAWN=tuple(WORLD_MAP['district']['spawn'][key] for key in ('x','y'))
CITY_OBSTACLES=tuple(json.loads((WEB_ROOT/'city-collisions.json').read_text())['obstacles'])
CITY_FOOTPRINTS=tuple(tuple(b[key] for key in ('x','y','width','height')) for b in CITY_OBSTACLES)
DISTRICT_BUILDINGS=tuple(WORLD_MAP['district']['buildings'])
FURNITURE_PALETTE=tuple(FURNITURE_MAP['palette'])
SOURCE_FURNITURE_THEMES=('modern','loft','tech','wood','stone')
BASE_SURFACE_STYLES=('board','parquet','concrete','tile','stone','metal')
BASE_WALL_MATERIALS=('plaster','brick','concrete','wood','stone','metal')
HOUSE_CATALOG=json.loads((WEB_ROOT/'house-catalog.json').read_text())
HOUSE_PALETTE=tuple(HOUSE_CATALOG['palette'])
HOUSE_STYLES=tuple(style['id'] for style in HOUSE_CATALOG['styles'])
BENCHES={seat['id']:(seat['seat']['x'],seat['seat']['y']) for seat in WORLD_MAP['benches']}
PARK_BENCHES=frozenset(seat['id'] for seat in WORLD_MAP['benches']
                      if seat.get('zone')=='park' or WORLD_MAP['schema_version']<20 and seat['id'].startswith('park-bench'))
BENCH_GROUPS={seat['group_id']:[s['id'] for s in WORLD_MAP['benches'] if s['group_id']==seat['group_id']] for seat in WORLD_MAP['benches']}
INTERIORS={room['id']:room for room in json.loads((WEB_ROOT/'interiors-map.json').read_text())['rooms']}
INTERIOR_SEATS = {seat['id']:(room['id'],seat['seat']['x'],seat['seat']['y'])
                  for room in INTERIORS.values() for seat in room['seats']}
BOATS={boat['id']:boat for boat in WORLD_MAP.get('boats',[])}
LAKE=WORLD_MAP['lake']
TRAVEL_POINTS=tuple((point['x'],point['y']) for point in WORLD_MAP['landmarks'].values()) + tuple(
    (building['door']['x'],building['door']['y']+24) for building in WORLD_MAP['buildings']+list(DISTRICT_BUILDINGS))


def city_footprint_contains(x,y):
    return any(bx<x<bx+w and by<y<by+h for bx,by,w,h in CITY_FOOTPRINTS)


def body_footprint_contains(x,y,footprints):
    """The authored support stays fixed; a standing body's half-width is 14."""
    # The lower foot support is circular. A square expansion would close safe
    # diagonal pavement corners which the native layout intentionally retains.
    return any(math.hypot(max(bx-x,0,x-bx-w),max(by-y,0,y-by-h))<BODY_RADIUS-1e-7
               for bx,by,w,h in footprints
               if bx-BODY_RADIUS<x<bx+w+BODY_RADIUS and by-BODY_RADIUS<y<by+h+BODY_RADIUS)


def body_edge_candidates(point,box):
    """Cardinal and circular-corner contact points of an unchanged support."""
    px,py=point;bx,by,w,h=box
    choices=[(bx-BODY_RADIUS,py),(bx+w+BODY_RADIUS,py),(px,by-BODY_RADIUS),(px,by+h+BODY_RADIUS)]
    cx,cy=min(bx+w,max(bx,px)),min(by+h,max(by,py));distance=math.hypot(px-cx,py-cy)
    if distance>1e-7:choices.append((cx+(px-cx)*BODY_RADIUS/distance,cy+(py-cy)*BODY_RADIUS/distance))
    return choices


def segment_box_distance(start,end,box):
    """Exact distance between a straight foot path and a rectangular support."""
    ax,ay=start;zx,zy=end;bx,by,w,h=box;dx,dy=zx-ax,zy-ay
    lo,hi=0,1
    for value,delta,left,right in ((ax,dx,bx,bx+w),(ay,dy,by,by+h)):
        if abs(delta)<1e-7:
            if value<left or value>right:lo=2;break
        else:
            a,b=(left-value)/delta,(right-value)/delta
            lo=max(lo,min(a,b));hi=min(hi,max(a,b))
    if lo<=hi:return 0
    distance=min(math.hypot(max(bx-x,0,x-bx-w),max(by-y,0,y-by-h)) for x,y in (start,end))
    length=dx*dx+dy*dy
    for x,y in ((bx,by),(bx+w,by),(bx,by+h),(bx+w,by+h)):
        t=min(1,max(0,((x-ax)*dx+(y-ay)*dy)/length)) if length else 0
        distance=min(distance,math.hypot(x-ax-t*dx,y-ay-t*dy))
    return distance


def move_body_position(start,end,footprints):
    """Sweep the actual diagonal, otherwise clip X then Y at first contact."""
    # A dense city has over a thousand supports. Only boxes near this swept
    # segment can matter, including every candidate of its X/Y sliding path.
    left,right=min(start[0],end[0])-BODY_RADIUS,max(start[0],end[0])+BODY_RADIUS
    top,bottom=min(start[1],end[1])-BODY_RADIUS,max(start[1],end[1])+BODY_RADIUS
    footprints=tuple(b for b in footprints if b[0]<=right and b[0]+b[2]>=left and b[1]<=bottom and b[1]+b[3]>=top)
    if not any(segment_box_distance(start,end,box)<BODY_RADIUS-1e-7 for box in footprints):return end
    def clip_axis(value,target,cross,horizontal):
        clipped=target
        for bx,by,w,h in footprints:
            axis,other,length,depth=(bx,by,w,h) if horizontal else (by,bx,h,w)
            gap=max(other-cross,0,cross-other-depth)
            if gap>=BODY_RADIUS:continue
            extent=math.sqrt(max(0,BODY_RADIUS**2-gap**2))
            low,high=axis-extent,axis+length+extent
            if max(value,clipped)>low+1e-7 and min(value,clipped)<high-1e-7:
                if target>value:clipped=min(clipped,max(value,low))
                elif target<value:clipped=max(clipped,min(value,high))
        return clipped
    x=clip_axis(start[0],end[0],start[1],True)
    return x,clip_axis(start[1],end[1],x,False)


def movement_path(data):
    if 'path' not in data:return [(data['x'],data['y'])]
    path=data['path']
    require(isinstance(path,list) and 1<=len(path)<=128,'Путь: от 1 до 128 точек','invalid_movement_path')
    points=[]
    for point in path:
        require(isinstance(point,dict) and all(type(point.get(k)) in (int,float) and
                (type(point[k]) is int or math.isfinite(point[k])) and abs(point[k])<=10**6 for k in ('x','y')),
                'Путь: нужны конечные координаты','invalid_movement_path')
        points.append((point['x'],point['y']))
    require(points[-1]==(data['x'],data['y']),'Последняя точка пути должна совпадать с позицией','invalid_movement_path')
    return points


def body_fits_bounds(bounds,x,y):
    return bounds['left']+BODY_RADIUS<=x<=bounds['right']-BODY_RADIUS and \
           bounds['top']+BODY_RADIUS<=y<=bounds['bottom']-BODY_RADIUS


def normalized_base_color(value):
    require(isinstance(value,str) and re.fullmatch(r'#[0-9A-Fa-f]{6}',value),'Цвет: #RRGGBB')
    return value.lower()


def valid_position(scene,x,y,scene_id=None,*,seated=False):
    if scene=='interior':
        room=INTERIORS.get(scene_id) if isinstance(scene_id,str) else None
        if room is None: return False
        bounds=room['bounds']
        if not body_fits_bounds(bounds,x,y):return False
        if seated and any(math.hypot(x-s['seat']['x'],y-s['seat']['y'])<.01 for s in room['seats']):return True
        return not body_footprint_contains(x,y,((s['x'],s['y'],s['width'],s['height']) for s in room['solids']))
    if scene=='base':
        bounds=WORLD_MAP['base']['bounds']
        return body_fits_bounds(bounds,x,y)
    if scene not in ('city','district'): return 0<=x<=1200 and 0<=y<=900
    left,right,top,bottom=CITY_BOUNDS
    if not left+BODY_RADIUS<=x<=right-BODY_RADIUS or not top+BODY_RADIUS<=y<=bottom-BODY_RADIUS or pedestrian_lake_contains(LAKE,x,y,BODY_RADIUS):return False
    # Exact interaction slots remain legal; their surroundings are solid.
    if seated and any(math.hypot(x-sx,y-sy)<.01 for sx,sy in BENCHES.values()):return True
    return not body_footprint_contains(x,y,CITY_FOOTPRINTS)


def nearest_city_position(x,y):
    """Move a new obstacle out from under retained feet without a station jump."""
    if not math.isfinite(x) or not math.isfinite(y):return CITY_SPAWN
    left,right,top,bottom=CITY_BOUNDS
    left,right,top,bottom=left+BODY_RADIUS,right-BODY_RADIUS,top+BODY_RADIUS,bottom-BODY_RADIUS
    start=(min(right,max(left,x)),min(bottom,max(top,y)))
    if pedestrian_lake_contains(LAKE,*start,BODY_RADIUS):
        start=nearest_pedestrian_shore(LAKE,*start,BODY_RADIUS,
              lambda p:left<=p[0]<=right and top<=p[1]<=bottom and not body_footprint_contains(*p,CITY_FOOTPRINTS))
    free=lambda p:valid_position('city',*p) and not city_footprint_contains(*p)
    if free(start):return start
    points=[start];seen={start}
    index=0
    while index<len(points) and index<250:
        px,py=points[index];index+=1
        for bx,by,w,h in CITY_FOOTPRINTS:
            if not body_footprint_contains(px,py,((bx,by,w,h),)):continue
            for qx,qy in body_edge_candidates((px,py),(bx,by,w,h)):
                p=(min(right,max(left,qx)),min(bottom,max(top,qy)))
                if p not in seen:seen.add(p);points.append(p)
    return min((p for p in points if free(p)),key=lambda p:((p[0]-start[0])**2+(p[1]-start[1])**2,p[1],p[0]),default=CITY_SPAWN)


def migrated_city_position(x,y,scene='city',source_version=None):
    """Keep a retained player near the same destination in a redesigned city."""
    if not math.isfinite(x) or not math.isfinite(y):return CITY_SPAWN
    if source_version is not None and source_version>=22:
        key='previous_landmarks_v22'
    elif source_version is not None and source_version>=21:
        key='previous_landmarks_v21'
    elif source_version is not None and source_version>=20:
        key='previous_landmarks_v20'
    elif source_version is not None and source_version>=19:
        key='previous_landmarks_v19'
    elif source_version is not None and source_version>=18:
        key='previous_landmarks_v18'
    elif source_version is not None and source_version<=5:
        key='previous_landmarks_v5'
    else:
        key='previous_landmarks'
    previous=WORLD_MAP.get(key,WORLD_MAP.get('previous_landmarks',{}))
    current=WORLD_MAP['landmarks']
    names=[name for name in previous if name in current]
    if not names:return nearest_city_position(x,y)
    name='district' if scene=='district' and 'district' in names else min(
        names,key=lambda key:(math.hypot(x-previous[key]['x'],y-previous[key]['y']),key))
    source,target=previous[name],current[name]
    dx,dy=x-source['x'],y-source['y']
    # Old empty fields can be kilometres from a landmark. Retain nearby feet,
    # but bound that offset so they cannot land in a different new district.
    distance=math.hypot(dx,dy)
    if distance>160:dx,dy=dx*160/distance,dy*160/distance
    return nearest_city_position(target['x']+dx,target['y']+dy)


def nearest_interior_position(room,x,y):
    """Repair a renovated floor locally, leaving already valid coordinates intact."""
    sid=room['id'];bounds=room['bounds']
    if math.isfinite(x) and math.isfinite(y) and valid_position('interior',x,y,sid):return x,y
    if not math.isfinite(x) or not math.isfinite(y):x,y=room['spawn']['x'],room['spawn']['y']
    # Keep full foot clearance at straight edges and rounded corners.
    for clearance in (BODY_RADIUS,):
        left,right=bounds['left']+clearance,bounds['right']-clearance
        top,bottom=bounds['top']+clearance,bounds['bottom']-clearance
        if left>right or top>bottom:continue
        xs={min(right,max(left,x)),left,right}
        ys={min(bottom,max(top,y)),top,bottom}
        for solid in room['solids']:
            xs.update((min(right,max(left,solid['x']-clearance)),
                       min(right,max(left,solid['x']+solid['width']+clearance))))
            ys.update((min(bottom,max(top,solid['y']-clearance)),
                       min(bottom,max(top,solid['y']+solid['height']+clearance))))
        footprints=[(s['x'],s['y'],s['width'],s['height']) for s in room['solids']]
        choices=[(px,py) for px in xs for py in ys]
        choices.extend(p for box in footprints for p in body_edge_candidates((x,y),box)
                       if left<=p[0]<=right and top<=p[1]<=bottom)
        candidates=(p for p in choices if not body_footprint_contains(*p,footprints))
        point=min(candidates,key=lambda p:((p[0]-x)**2+(p[1]-y)**2,p[1],p[0]),default=None)
        if point is not None:return point
    return None


def reconcile_interior_presence(db,row):
    """Shared startup/live reconciliation; a stable seat owns its new position."""
    keys=('x','y','scene','scene_id','pose','bench_id','pose_until','phone_open','sit_since')
    state={key:row[key] for key in keys};sid=state['scene_id'];room=INTERIORS.get(sid)
    if room is None:
        state.update(x=CITY_SPAWN[0],y=CITY_SPAWN[1],scene='city',scene_id=None,
                     pose='idle',bench_id=None,pose_until=None,phone_open=0,sit_since=None)
    else:
        seat=INTERIOR_SEATS.get(state['bench_id'])
        if (seat and seat[0]==sid and state['pose'] in ('sit','phone') and
                valid_position('interior',seat[1],seat[2],sid,seated=True)):
            state.update(x=seat[1],y=seat[2])
        else:
            if state['bench_id'] is not None or state['pose']=='sit':
                state.update(bench_id=None,sit_since=None,pose_until=None,
                             pose='phone' if state['phone_open'] else 'idle')
            if not valid_position('interior',state['x'],state['y'],sid):
                point=nearest_interior_position(room,state['x'],state['y'])
                if point is None:
                    state.update(x=CITY_SPAWN[0],y=CITY_SPAWN[1],scene='city',scene_id=None,
                                 pose='idle',bench_id=None,pose_until=None,phone_open=0,sit_since=None)
                else:
                    state.update(x=point[0],y=point[1],bench_id=None,sit_since=None,pose_until=None,
                                 pose='phone' if state['phone_open'] else 'idle')
    if any(state[key]!=row[key] for key in keys):
        db.execute('''UPDATE presence SET x=?,y=?,scene=?,scene_id=?,pose=?,bench_id=?,
                      pose_until=?,phone_open=?,sit_since=? WHERE account_id=?''',
                   (*[state[key] for key in keys],row['account_id']))
        remember_position(db,row['account_id'],state['x'],state['y'],state['scene'],state['scene_id'])
    return state


def reconcile_retained_interior(db,row):
    room=INTERIORS.get(row['scene_id'])
    point=nearest_interior_position(room,row['x'],row['y']) if room else None
    x,y,scene,sid=(*point,'interior',room['id']) if point is not None else (*CITY_SPAWN,'city',None)
    if (x,y,scene,sid)!=(row['x'],row['y'],row['scene'],row['scene_id']):
        remember_position(db,row['account_id'],x,y,scene,sid)
    return x,y,scene,sid


def available_building(db):
    occupied={row['building_id'] for row in db.execute("SELECT building_id FROM clans WHERE status='active'")}
    return next((b['id'] for b in DISTRICT_BUILDINGS if b['id'] not in occupied),None)


def furniture_footprint(item):
    kind=FURNITURE_TYPES[item['type']]
    shape=kind.get('legacy_footprint',kind['footprint']) if 'rotation' not in item else kind['footprint']
    width,height=shape['width'],shape['height']
    return (height,width) if item.get('rotation',0) in (90,270) else (width,height)


def furniture_seats(cid,items):
    grid=FURNITURE_MAP['grid'];result=[]
    for item in items:
        kind=FURNITURE_TYPES.get(item.get('type'))
        if not kind:continue
        offsets=kind['seats'][:1] if 'rotation' not in item and kind.get('legacy_footprint') else kind['seats']
        rotation=item.get('rotation',0)
        width=kind['footprint']['width']*grid['cell_width']
        height=kind['footprint']['height']*grid['cell_height']
        for index,offset in enumerate(offsets,1):
            x,y=offset['x'],offset['y']
            if rotation==90:x,y=height-y,x
            elif rotation==180:x,y=width-x,height-y
            elif rotation==270:x,y=y,width-x
            point={'x':grid['x']+item['x']*grid['cell_width']+x,'y':grid['y']+item['y']*grid['cell_height']+y}
            facings=('down','left','up','right')
            facing=facings[(facings.index(offset.get('facing','down'))+rotation//90)%4]
            result.append({'id':f'base:{cid}:{item["id"]}:seat-{index}','item_id':item['id'],'type':item['type'],'seat':point,'facing':facing})
    return result


def base_access(db,uid,cid):
    if not isinstance(cid,str):return False
    clan=db.execute("SELECT 1 FROM clans WHERE id=? AND status='active' AND building_id IS NOT NULL",(cid,)).fetchone()
    return bool(clan and (account_clan(db,uid)==cid or db.execute('SELECT 1 FROM base_guests WHERE clan_id=? AND account_id=?',(cid,uid)).fetchone()))


def base_footprints(items):
    grid=FURNITURE_MAP['grid'];result=[]
    for item in items:
        if item.get('type') not in FURNITURE_TYPES or not FURNITURE_TYPES[item['type']]['solid']:continue
        width,height=furniture_footprint(item)
        result.append((grid['x']+item['x']*grid['cell_width'],grid['y']+item['y']*grid['cell_height'],
                       width*grid['cell_width'],height*grid['cell_height']))
    return result


def valid_base_position(db,cid,x,y,*,seated=False):
    if not valid_position('base',x,y):return False
    row=db.execute('SELECT base FROM clans WHERE id=?',(cid,)).fetchone()
    if row is None:return False
    items=json.loads(row['base']).get('items',[])
    # Authoritative seat positions are the allowed interaction points of solids.
    if seated and any(math.hypot(x-s['seat']['x'],y-s['seat']['y'])<.01 for s in furniture_seats(cid,items)):return True
    return not body_footprint_contains(x,y,base_footprints(items))


def nearest_base_position(db,cid,x,y):
    row=db.execute('SELECT base FROM clans WHERE id=?',(cid,)).fetchone()
    if row is None:return None
    footprints=base_footprints(json.loads(row['base']).get('items',[]))
    room={'id':'base-clearance','bounds':WORLD_MAP['base']['bounds'],'spawn':WORLD_MAP['base']['spawn'],
          'solids':[dict(zip(('x','y','width','height'),box)) for box in footprints]}
    # Use the same edge candidates as a public room, without a fake room ID.
    if valid_base_position(db,cid,x,y):return x,y
    bounds=room['bounds'];clearance=BODY_RADIUS
    left,right,top,bottom=bounds['left']+clearance,bounds['right']-clearance,bounds['top']+clearance,bounds['bottom']-clearance
    if not math.isfinite(x) or not math.isfinite(y):x,y=room['spawn']['x'],room['spawn']['y']
    xs={min(right,max(left,x)),left,right};ys={min(bottom,max(top,y)),top,bottom}
    for solid in room['solids']:
        xs.update((min(right,max(left,solid['x']-clearance)),min(right,max(left,solid['x']+solid['width']+clearance))))
        ys.update((min(bottom,max(top,solid['y']-clearance)),min(bottom,max(top,solid['y']+solid['height']+clearance))))
    choices=[(px,py) for px in xs for py in ys]
    choices.extend(p for box in footprints for p in body_edge_candidates((x,y),box)
                   if left<=p[0]<=right and top<=p[1]<=bottom)
    return min((p for p in choices if not body_footprint_contains(*p,footprints)),
               key=lambda p:((p[0]-x)**2+(p[1]-y)**2,p[1],p[0]),default=None)


def retained_seat_position(db,row,scene,sid,x,y):
    """Only an existing seat claim may keep contact with its own support."""
    if not row or row['pose'] not in ('sit','phone') or row['scene']!=scene or row['scene_id']!=sid:return False
    if scene=='city':seat=BENCHES.get(row['bench_id'])
    elif scene=='interior':
        value=INTERIOR_SEATS.get(row['bench_id']);seat=value[1:] if value and value[0]==sid else None
    elif scene=='base':
        base=db.execute('SELECT base FROM clans WHERE id=?',(sid,)).fetchone()
        value=next((s for s in furniture_seats(sid,json.loads(base['base']).get('items',[])) if s['id']==row['bench_id']),None) if base else None
        seat=(value['seat']['x'],value['seat']['y']) if value else None
    else:seat=None
    return bool(seat and seat==(x,y))


def axis_body_segment_clear(start,end,footprints):
    """Exact circular-foot sweep on the axis-aligned layout graph."""
    horizontal=start[1]==end[1]
    for bx,by,w,h in footprints:
        axis,other,length,depth=(bx,by,w,h) if horizontal else (by,bx,h,w)
        cross=start[1] if horizontal else start[0]
        distance=max(other-cross,0,cross-other-depth)
        if distance>=BODY_RADIUS-1e-7:continue
        reach=math.sqrt(max(0,BODY_RADIUS**2-distance**2))
        a,b=(start[0],end[0]) if horizontal else (start[1],end[1])
        if max(a,b)>axis-reach+1e-7 and min(a,b)<axis+length+reach-1e-7:return False
    return True


def base_layout_reachable(cid,items):
    """Every seat and the exit can be approached from the actual arrival."""
    footprints=base_footprints(items);bounds=WORLD_MAP['base']['bounds'];spawn=WORLD_MAP['base']['spawn']
    left,right,top,bottom=bounds['left']+BODY_RADIUS,bounds['right']-BODY_RADIUS,bounds['top']+BODY_RADIUS,bounds['bottom']-BODY_RADIUS
    xs={left,right,spawn['x']};ys={top,bottom,spawn['y']}
    seats=furniture_seats(cid,items)
    for bx,by,w,h in footprints:
        xs.update((min(right,max(left,bx-BODY_RADIUS)),min(right,max(left,bx+w+BODY_RADIUS))))
        ys.update((min(bottom,max(top,by-BODY_RADIUS)),min(bottom,max(top,by+h+BODY_RADIUS))))
    for seat in seats:
        xs.add(min(right,max(left,seat['seat']['x'])))
        ys.add(min(bottom,max(top,seat['seat']['y'])))
    xs,ys=sorted(xs),sorted(ys)
    free={(ix,iy) for ix,x in enumerate(xs) for iy,y in enumerate(ys) if not body_footprint_contains(x,y,footprints)}
    start=(xs.index(spawn['x']),ys.index(spawn['y']))
    if start not in free:return False
    reached={start};queue=[start]
    for ix,iy in queue:
        for other in ((ix-1,iy),(ix+1,iy),(ix,iy-1),(ix,iy+1)):
            if other not in free or other in reached:continue
            nx,ny=other
            if axis_body_segment_clear((xs[ix],ys[iy]),(xs[nx],ys[ny]),footprints):
                reached.add(other);queue.append(other)
    if (xs.index(spawn['x']),ys.index(bottom)) not in reached:return False
    # The mobile action button uses a 65px approach. The occupied seat itself
    # remains a contact exception, never an ordinary walkable route vertex.
    points=[(xs[ix],ys[iy]) for ix,iy in reached]
    return all(any(math.hypot(x-seat['seat']['x'],y-seat['seat']['y'])<=65 for x,y in points) for seat in seats)


def initialize_schema(db):
    initialize_actions(db)
    db.execute('CREATE TABLE IF NOT EXISTS clans (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, color TEXT NOT NULL, flag TEXT NOT NULL, leader_id TEXT NOT NULL, base TEXT NOT NULL)')
    if 'status' not in {row['name'] for row in db.execute('PRAGMA table_info(clans)')}:
        db.execute("ALTER TABLE clans ADD COLUMN status TEXT NOT NULL DEFAULT 'active'")
    if 'building_id' not in {row['name'] for row in db.execute('PRAGMA table_info(clans)')}:
        db.execute('ALTER TABLE clans ADD COLUMN building_id TEXT')
        for row in db.execute("SELECT id FROM clans WHERE status='active' ORDER BY rowid").fetchall():
            db.execute('UPDATE clans SET building_id=? WHERE id=?',(available_building(db),row['id']))
    db.execute("CREATE UNIQUE INDEX IF NOT EXISTS clan_active_building ON clans(building_id) WHERE status='active' AND building_id IS NOT NULL")
    # Existing houses are already constructed: preserve their design and accent.
    # New clans keep building_id NULL until an explicit, validated construction.
    for row in db.execute('SELECT id,base,color FROM clans WHERE building_id IS NOT NULL').fetchall():
        base=json.loads(row['base'])
        if not base.get('exterior_locked') or 'exterior_color' not in base:
            base['exterior_locked']=True
            base.setdefault('exterior_color',row['color'])
            db.execute('UPDATE clans SET base=? WHERE id=?',(json.dumps(base,ensure_ascii=False),row['id']))
    db.execute('CREATE TABLE IF NOT EXISTS active_accounts (account_id TEXT PRIMARY KEY, updated REAL NOT NULL)')
    db.execute('CREATE TABLE IF NOT EXISTS clan_members (account_id TEXT PRIMARY KEY, clan_id TEXT NOT NULL)')
    db.execute('CREATE TABLE IF NOT EXISTS clan_requests (account_id TEXT NOT NULL, clan_id TEXT NOT NULL, PRIMARY KEY(account_id,clan_id))')
    db.execute('CREATE TABLE IF NOT EXISTS base_invitations (id TEXT PRIMARY KEY,clan_id TEXT NOT NULL,from_id TEXT NOT NULL,to_id TEXT NOT NULL,state TEXT NOT NULL)')
    db.execute("CREATE UNIQUE INDEX IF NOT EXISTS pending_base_invitation ON base_invitations(clan_id,to_id) WHERE state='pending'")
    db.execute('CREATE TABLE IF NOT EXISTS base_guests (clan_id TEXT NOT NULL,account_id TEXT NOT NULL,PRIMARY KEY(clan_id,account_id))')
    db.execute('CREATE TABLE IF NOT EXISTS presence (account_id TEXT PRIMARY KEY, x REAL NOT NULL, y REAL NOT NULL, scene TEXT NOT NULL, scene_id TEXT, updated REAL NOT NULL)')
    fields={row['name'] for row in db.execute('PRAGMA table_info(presence)')}
    for name,definition in (('pose',"TEXT NOT NULL DEFAULT 'idle'"),('bench_id','TEXT'),('pose_until','REAL'),('phone_open','INTEGER NOT NULL DEFAULT 0'),('sit_since','REAL')):
        if name not in fields: db.execute(f'ALTER TABLE presence ADD COLUMN {name} {definition}')
    if 'phone_open' not in fields: db.execute("UPDATE presence SET phone_open=1 WHERE pose='phone'")
    db.execute("CREATE UNIQUE INDEX IF NOT EXISTS single_bench_seat ON presence(bench_id) WHERE bench_id IS NOT NULL")
    db.execute('CREATE TABLE IF NOT EXISTS world_positions (account_id TEXT PRIMARY KEY,x REAL NOT NULL,y REAL NOT NULL,scene TEXT NOT NULL,scene_id TEXT)')
    db.execute('CREATE TABLE IF NOT EXISTS world_boats (id TEXT PRIMARY KEY,x REAL NOT NULL,y REAL NOT NULL,occupant_id TEXT UNIQUE,updated REAL)')
    for boat in BOATS.values():
        db.execute('INSERT OR IGNORE INTO world_boats VALUES (?,?,?,NULL,NULL)',(boat['id'],boat['dock']['x'],boat['dock']['y']))
    db.execute('CREATE TABLE IF NOT EXISTS world_pet_effects (account_id TEXT PRIMARY KEY,id TEXT NOT NULL,target_id TEXT NOT NULL,kind TEXT NOT NULL,started_at REAL NOT NULL,duration REAL NOT NULL)')
    db.execute('CREATE TABLE IF NOT EXISTS world_animal_pauses (target_id TEXT PRIMARY KEY,started_at REAL NOT NULL,duration REAL NOT NULL,route_time REAL NOT NULL)')
    db.execute('CREATE TABLE IF NOT EXISTS world_metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL)')
    version=db.execute("SELECT value FROM world_metadata WHERE key='map_version'").fetchone()
    layout_changed=version is None or int(version['value'])<WORLD_MAP['schema_version']
    if layout_changed:
        # Boat occupancy belongs to the old water layout. Release temporary
        # occupants and place the retained boat IDs at their new docks.
        for row in db.execute('SELECT id FROM world_boats').fetchall():
            boat=BOATS.get(row['id'])
            if boat is None:
                db.execute('DELETE FROM world_boats WHERE id=?',(row['id'],))
            else:
                dock=boat['dock']
                db.execute('UPDATE world_boats SET x=?,y=?,occupant_id=NULL,updated=NULL WHERE id=?',
                           (dock['x'],dock['y'],row['id']))
        for table in ('presence','world_positions'):
            for row in db.execute(f"SELECT * FROM {table} WHERE scene IN ('city','district')").fetchall():
                x,y=migrated_city_position(row['x'],row['y'],row['scene'],int(version['value']) if version else None)
                db.execute(f"UPDATE {table} SET x=?,y=?,scene='city',scene_id=NULL WHERE account_id=?",(x,y,row['account_id']))
                if table=='presence':
                    db.execute("""UPDATE presence SET pose=CASE WHEN phone_open=1 THEN 'phone' ELSE 'idle' END,
                                  bench_id=NULL,pose_until=NULL,sit_since=NULL WHERE account_id=?""",(row['account_id'],))
        db.execute("INSERT OR REPLACE INTO world_metadata VALUES ('map_version',?)",(str(WORLD_MAP['schema_version']),))
    for row in db.execute("SELECT * FROM presence WHERE scene='interior'").fetchall():
        reconcile_interior_presence(db,row)
    for row in db.execute("SELECT * FROM world_positions WHERE scene='interior'").fetchall():
        occupied=db.execute('SELECT * FROM presence WHERE account_id=?',(row['account_id'],)).fetchone()
        if occupied and retained_seat_position(db,occupied,'interior',occupied['scene_id'],occupied['x'],occupied['y']):
            remember_position(db,row['account_id'],occupied['x'],occupied['y'],'interior',occupied['scene_id'])
        else:reconcile_retained_interior(db,row)
    # Older clients used a separate district scene. Normalize any remaining
    # row without clearing its open phone or touching a private base/interior.
    for table in ('presence','world_positions'):
        for row in db.execute(f"SELECT * FROM {table} WHERE scene='district'").fetchall():
            x,y=nearest_city_position(*DISTRICT_SPAWN)
            db.execute(f"UPDATE {table} SET scene='city',scene_id=NULL,x=?,y=? WHERE account_id=?",(x,y,row['account_id']))
            if table=='presence':
                db.execute("""UPDATE presence SET pose=CASE WHEN phone_open=1 THEN 'phone' ELSE 'idle' END,
                              bench_id=NULL,pose_until=NULL,sit_since=NULL WHERE account_id=?""",(row['account_id'],))
    db.execute("INSERT OR IGNORE INTO world_positions (account_id,x,y,scene,scene_id) SELECT account_id,x,y,scene,scene_id FROM presence WHERE scene IN ('city','base','interior')")
    db.execute('CREATE TABLE IF NOT EXISTS clan_results (lobby_id TEXT NOT NULL, clan_id TEXT NOT NULL, score TEXT NOT NULL, win INTEGER NOT NULL, PRIMARY KEY(lobby_id,clan_id))')


def account_clan(db, account_id):
    row = db.execute('SELECT clan_id FROM clan_members WHERE account_id=?',(account_id,)).fetchone()
    return row['clan_id'] if row else None


def jury_restricted(db, account_id):
    for row in db.execute('SELECT data FROM lobbies'):
        lobby=json.loads(row['data'])
        if lobby['state']!='finished' and lobby['members'].get(account_id,{}).get('role')=='curator':
            return True
    return False


def active_participant_lobby(db,account_id):
    # New starts prohibit overlap; latest retained lobby wins for legacy overlap.
    for row in db.execute('SELECT data FROM lobbies ORDER BY rowid DESC'):
        lobby=json.loads(row['data'])
        if lobby['state'] not in ('waiting','finished') and lobby['members'].get(account_id,{}).get('role')=='participant':
            return lobby
    return None


def active_cards(db,account_id):
    if not db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='card_tables'").fetchone(): return None
    from cards import active_card_table
    return active_card_table(db,account_id)


def _activity_maps(db):
    """One transaction's roster views; latest legacy overlap wins as before."""
    restricted,participants,tables=set(),{},{}
    for row in db.execute('SELECT data FROM lobbies ORDER BY rowid DESC'):
        lobby=json.loads(row['data'])
        for uid,member in lobby['members'].items():
            if lobby['state']!='finished' and member['role']=='curator':restricted.add(uid)
            if lobby['state'] not in ('waiting','finished') and member['role']=='participant':
                participants.setdefault(uid,lobby)
    if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='card_tables'").fetchone():
        for row in db.execute('SELECT data FROM card_tables ORDER BY rowid DESC'):
            table=json.loads(row['data'])
            if table['state']=='playing':
                for player in table['players']:tables.setdefault(player['id'],table)
    return restricted,participants,tables


def _joined_profile(row):
    require(row['profile_id'] is not None,'Нужна авторизация','unauthorized',401)
    return json.loads(row['profile']) if row['profile'] else None


def remember_position(db,account_id,x,y,scene,scene_id):
    # Coordinates survive disconnects; poses and bench ownership remain ephemeral.
    if scene in ('city','base','interior'):
        db.execute('INSERT INTO world_positions (account_id,x,y,scene,scene_id) VALUES (?,?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET x=excluded.x,y=excluded.y,scene=excluded.scene,scene_id=excluded.scene_id',
                   (account_id,x,y,scene,scene_id))


def release_boat(db,uid):
    row=db.execute('SELECT * FROM world_boats WHERE occupant_id=?',(uid,)).fetchone()
    if row is None:return
    boat=BOATS.get(row['id'])
    if boat is None:
        db.execute('DELETE FROM world_boats WHERE id=?',(row['id'],));return
    dry=boat['boarding'];dock=boat['dock']
    db.execute('UPDATE world_boats SET x=?,y=?,occupant_id=NULL,updated=NULL WHERE id=?',(dock['x'],dock['y'],row['id']))
    db.execute("UPDATE fishing_sessions SET state='cancelled' WHERE account_id=? AND spot_id=? AND state='waiting'",(uid,'boat:'+row['id']))
    db.execute("UPDATE presence SET x=?,y=?,pose=CASE WHEN phone_open=1 THEN 'phone' ELSE 'idle' END,bench_id=NULL,pose_until=NULL,sit_since=NULL WHERE account_id=? AND scene='city'",(dry['x'],dry['y'],uid))
    remember_position(db,uid,dry['x'],dry['y'],'city',None)


def start_roster_available(db,lobby):
    for uid,member in lobby['members'].items():
        if active_participant_lobby(db,uid) is not None: return False
        if active_cards(db,uid) is not None: return False
        if member['role']=='participant' and jury_restricted(db,uid): return False
    return True


def transition_participants(db,lobby,scene,now):
    for uid,member in lobby['members'].items():
        if member['role']!='participant': continue
        release_boat(db,uid)
        if scene=='city':
            row=db.execute('SELECT scene,scene_id FROM presence WHERE account_id=?',(uid,)).fetchone()
            if row and row['scene']=='arena' and row['scene_id']!=lobby['id']: continue
        db.execute('INSERT OR REPLACE INTO presence (account_id,x,y,scene,scene_id,updated) VALUES (?,?,?,?,?,?)',
                   (uid,*(CITY_SPAWN if scene=='city' else (600,510)),scene,lobby['id'] if scene=='arena' else None,now))


class WorldService:
    def __init__(self, game, clock=None):
        self.game=game
        self.clock=clock or time.time
        # Controller ownership is transient process state, separate from login,
        # persistent coordinates and every part of the account's progress.
        self._controller_lock=threading.RLock()
        self._controllers={}
        game.world_clock=lambda:self.clock()
        with game.transaction() as db: initialize_schema(db)

    def claim_controller(self,account_id):
        with self._controller_lock:
            with self.game.transaction() as db:
                require(self.game._profile(db,account_id) is not None,'Сначала создайте профиль')
                self._admit(db,account_id)
            claimed=token()
            self._controllers[account_id]=claimed
            # This is the only response containing the private token. Player
            # snapshots and durable storage never receive it.
            return {'controller_token':claimed}

    @contextmanager
    def controller_write(self,account_id,supplied):
        # Keep the lock through the mutation. A check followed by an unlocked
        # write would let an old request commit after a newer claim succeeded.
        with self._controller_lock:
            current=self._controllers.get(account_id)
            require(current is None or isinstance(supplied,str) and supplied.isascii() and
                    hmac.compare_digest(current,supplied),
                    'Игра открыта в другой вкладке. Вернитесь в город, чтобы продолжить здесь.',
                    'world_controller_lost',409)
            yield

    def _admit(self,db,account_id):
        now=self.clock()
        db.execute('DELETE FROM active_accounts WHERE updated<=?',(now-PRESENCE_TTL,))
        existing=db.execute('SELECT 1 FROM active_accounts WHERE account_id=?',(account_id,)).fetchone()
        require(existing is not None or db.execute('SELECT COUNT(*) FROM active_accounts').fetchone()[0]<MAX_ONLINE,
                'Игра заполнена: 100 активных аккаунтов','active_full',409)
        db.execute('INSERT OR REPLACE INTO active_accounts VALUES (?,?)',(account_id,now))

    def admit(self,account_id):
        # Authenticated API activity counts even without a profile or visible city presence.
        with self.game.transaction() as db:
            self.game._profile(db,account_id)
            self._admit(db,account_id)

    def _guard(self, db, account_id):
        require(self.game._profile(db,account_id) is not None,'Сначала создайте профиль')
        self._admit(db,account_id)
        require(not jury_restricted(db,account_id),'Город недоступен до завершения всех игр жюри','jury_restricted',403)

    def _clan_row(self, db, cid):
        require(isinstance(cid,str),'Неверный клан')
        row=db.execute('SELECT * FROM clans WHERE id=?',(cid,)).fetchone()
        require(row is not None,'Клан не найден','not_found',404)
        return row

    def _summary(self,db,row,entries=None,member_count=None):
        if entries is None:entries=db.execute('SELECT score,win FROM clan_results WHERE clan_id=?',(row['id'],)).fetchall()
        if member_count is None:member_count=db.execute('SELECT COUNT(*) FROM clan_members WHERE clan_id=?',(row['id'],)).fetchone()[0]
        base=json.loads(row['base'])
        return {k:row[k] for k in ('id','name','color','flag','status')} | {
            'building_id':row['building_id'],
            'exterior_style':base.get('exterior_style',0),
            'exterior_color':base.get('exterior_color',row['color'] if row['building_id'] else '#faf8f2'),
            'exterior_locked':bool(row['building_id'] or base.get('exterior_locked')),
            'member_count':member_count,
            'score':float(sum((Decimal(e['score']) for e in entries),Decimal(0))),
            'wins':sum(e['win'] for e in entries)}

    def _clan_snapshot(self,db,account_id,cid,summary=None):
        row=self._clan_row(db,cid)
        require(account_clan(db,account_id)==cid,'Состав и база доступны своему клану','forbidden',403)
        leader=row['leader_id']==account_id
        restricted={uid for r in db.execute('SELECT data FROM lobbies')
                    for lobby in (json.loads(r['data']),) if lobby['state']!='finished'
                    for uid,member in lobby['members'].items() if member['role']=='curator'}
        members=[_joined_profile(r) for r in db.execute('''SELECT m.account_id,a.id AS profile_id,a.profile
                    FROM clan_members m LEFT JOIN accounts a ON a.id=m.account_id
                    WHERE m.clan_id=? ORDER BY m.rowid''',(cid,)) if r['account_id'] not in restricted]
        requests=[_joined_profile(r) for r in db.execute('''SELECT m.account_id,a.id AS profile_id,a.profile
                    FROM clan_requests m LEFT JOIN accounts a ON a.id=m.account_id
                    WHERE m.clan_id=? ORDER BY m.rowid''',(cid,)) if r['account_id'] not in restricted] if leader else []
        base=json.loads(row['base'])
        base=base | {'wall_color':base.get('wall_color','#faf8f2'),'floor_color':base.get('floor_color','#141414'),
                     'exterior_style':base.get('exterior_style',0),
                     'exterior_color':base.get('exterior_color',row['color'] if row['building_id'] else '#faf8f2'),
                     'exterior_locked':bool(row['building_id'] or base.get('exterior_locked')),
                     'items':[item | {'color':item.get('color','#faf8f2'),'variant':item.get('variant','standard')} for item in base.get('items',[])]}
        return (summary if summary is not None else self._summary(db,row)) | {'leader_id':None if row['leader_id'] in restricted else row['leader_id'],'members':members,'requests':requests,
                                      'base':base | {'building_id':row['building_id']},'is_leader':leader}

    def clan_snapshot(self,account_id,cid):
        with self.game.transaction() as db:
            self._guard(db,account_id)
            return self._clan_snapshot(db,account_id,cid)

    def _active_base(self,db,uid,cid):
        if not base_access(db,uid,cid):return None
        row=self._clan_row(db,cid);base=json.loads(row['base'])
        base=base|{'building_id':row['building_id'],'wall_color':base.get('wall_color','#faf8f2'),
                   'floor_color':base.get('floor_color','#141414'),'exterior_style':base.get('exterior_style',0),
                   'exterior_color':base.get('exterior_color',row['color']), 'exterior_locked':True,
                   'seats':furniture_seats(cid,base.get('items',[]))}
        return {key:row[key] for key in ('id','name','color','flag')}|{'leader_id':None if jury_restricted(db,row['leader_id']) else row['leader_id'],
                                                                 'base':base,'is_leader':row['leader_id']==uid,'is_guest':account_clan(db,uid)!=cid}

    def _base_invitations(self,db,uid):
        invitations=[]
        for row in db.execute("SELECT * FROM base_invitations WHERE to_id=? AND state='pending' ORDER BY rowid",(uid,)):
            clan=self._clan_row(db,row['clan_id'])
            if clan['status']!='active' or jury_restricted(db,row['from_id']):continue
            invitations.append({'id':row['id'],'state':row['state'],'clan':self._summary(db,clan),'from':self.game._profile(db,row['from_id'])})
        visits=[self._summary(db,row) for row in db.execute("SELECT clans.* FROM clans JOIN base_guests ON clans.id=base_guests.clan_id WHERE base_guests.account_id=? AND clans.status='active'",(uid,))]
        return {'invitations':invitations,'visits':visits}

    def base_invitations(self,uid):
        with self.game.transaction() as db:
            self._guard(db,uid)
            return self._base_invitations(db,uid)

    def invite_base(self,uid,cid,data):
        require(isinstance(data,dict),'Требуется объект')
        with self.game.transaction() as db:
            self._guard(db,uid);clan=self._clan_row(db,cid)
            require(clan['status']=='active' and clan['leader_id']==uid,'Приглашает только лидер активного клана','forbidden',403)
            require(clan['building_id'] is not None,'Сначала постройте клановый дом','base_unassigned',409)
            peer=data.get('to_id')
            require(isinstance(peer,str) and peer!=uid,'Выберите другого игрока')
            from economy import guard
            guard(db,peer)
            row=db.execute("SELECT * FROM base_invitations WHERE clan_id=? AND to_id=? AND state='pending'",(cid,peer)).fetchone()
            if row is None:
                rid=token();db.execute('INSERT INTO base_invitations VALUES (?,?,?,?,?)',(rid,cid,uid,peer,'pending'))
                row=db.execute('SELECT * FROM base_invitations WHERE id=?',(rid,)).fetchone()
            return {'invitation':{key:row[key] for key in ('id','clan_id','to_id','state')}}

    def respond_base_invitation(self,uid,rid,action):
        require(action in ('accept','dismiss'),'Действие не найдено','not_found',404)
        with self.game.transaction() as db:
            self._guard(db,uid)
            row=db.execute('SELECT * FROM base_invitations WHERE id=?',(rid,)).fetchone()
            require(row is not None,'Приглашение не найдено','not_found',404)
            require(row['to_id']==uid,'Чужое приглашение','forbidden',403)
            state='accepted' if action=='accept' else 'dismissed'
            require(row['state'] in ('pending',state),'Приглашение уже закрыто','invitation_closed',409)
            clan=self._clan_row(db,row['clan_id'])
            require(clan['status']=='active' and not jury_restricted(db,row['from_id']),'Приглашение недоступно','forbidden',403)
            if row['state']=='pending':
                if action=='accept':db.execute('INSERT OR IGNORE INTO base_guests VALUES (?,?)',(row['clan_id'],uid))
                db.execute('UPDATE base_invitations SET state=? WHERE id=?',(state,rid))
            return self._base_invitations(db,uid)|{'id':rid,'state':state,'clan_id':row['clan_id']}

    def create_clan(self,account_id,data):
        require(isinstance(data,dict),'Требуется объект')
        name=bounded(data.get('name'),32,'Название клана',1)
        color=data.get('color')
        require(isinstance(color,str) and re.fullmatch(r'#[0-9A-Fa-f]{6}',color),'Цвет: #RRGGBB')
        flag=bounded(data.get('flag'),16,'Флаг',1)
        with self.game.transaction() as db:
            self._guard(db,account_id)
            require(account_clan(db,account_id) is None,'Вы уже в клане')
            require(db.execute('SELECT 1 FROM clans WHERE lower(name)=lower(?)',(name,)).fetchone() is None,'Название уже занято')
            cid=token()
            db.execute('INSERT INTO clans (id,name,color,flag,leader_id,base) VALUES (?,?,?,?,?,?)',(cid,name,color,flag,account_id,json.dumps({'items':[]})))
            db.execute('INSERT INTO clan_members VALUES (?,?)',(account_id,cid))
            db.execute('DELETE FROM clan_requests WHERE account_id=?',(account_id,))
            return self._clan_snapshot(db,account_id,cid)

    def mutate_clan(self,account_id,cid,action,data):
        require(isinstance(data,dict),'Требуется объект')
        with self.game.transaction() as db:
            self._guard(db,account_id)
            clan=self._clan_row(db,cid)
            require(clan['status']=='active','Клан находится в архиве','clan_archived',403)
            member=account_clan(db,account_id)
            leader=clan['leader_id']==account_id
            if action=='apply':
                require(member is None,'Вы уже в клане')
                db.execute('INSERT OR IGNORE INTO clan_requests VALUES (?,?)',(account_id,cid))
                return {'id':cid,'applied':True}
            require(member==cid,'Только участник клана','forbidden',403)
            if action in ('accept','transfer','base','building'): require(leader,'Только лидер клана','forbidden',403)
            if action=='accept':
                user=data.get('account_id')
                require(isinstance(user,str),'Неверный участник')
                request=db.execute('SELECT 1 FROM clan_requests WHERE account_id=? AND clan_id=?',(user,cid)).fetchone()
                require(request is not None and account_clan(db,user) is None,'Заявка недоступна')
                db.execute('INSERT INTO clan_members VALUES (?,?)',(user,cid))
                db.execute('DELETE FROM clan_requests WHERE account_id=?',(user,))
            elif action=='transfer':
                user=data.get('account_id')
                require(isinstance(user,str) and user!=account_id and account_clan(db,user)==cid,'Выберите другого участника клана')
                db.execute('UPDATE clans SET leader_id=? WHERE id=?',(user,cid))
            elif action=='leave':
                count=db.execute('SELECT COUNT(*) FROM clan_members WHERE clan_id=?',(cid,)).fetchone()[0]
                require(not leader or count==1,'Сначала передайте лидерство')
                db.execute('DELETE FROM clan_members WHERE account_id=?',(account_id,))
                building=next((b for b in DISTRICT_BUILDINGS if b['id']==clan['building_id']),None)
                exit_position=nearest_city_position(building['door']['x'],building['door']['y']+24) if building else DISTRICT_SPAWN
                db.execute("UPDATE presence SET scene='city',scene_id=NULL,x=?,y=?,pose='idle',bench_id=NULL,pose_until=NULL,phone_open=0 WHERE account_id=? AND scene='base'",(*exit_position,account_id))
                db.execute("UPDATE world_positions SET scene='city',scene_id=NULL,x=?,y=? WHERE account_id=? AND scene='base'",(*exit_position,account_id))
                if count==1:
                    db.execute("UPDATE clans SET status='archived',building_id=NULL WHERE id=?",(cid,))
                    db.execute('DELETE FROM clan_requests WHERE clan_id=?',(cid,))
                return {'id':cid,'left':True}
            elif action=='building':
                require(clan['building_id'] is None,'Клановый дом уже построен: участок и фасад зафиксированы','base_already_built',409)
                building=data.get('building_id')
                require(isinstance(building,str) and building in {b['id'] for b in DISTRICT_BUILDINGS},'Выберите здание района')
                style=data.get('exterior_style');color=data.get('exterior_color')
                require(type(style) is int and style in HOUSE_STYLES,'Выберите один из шести стилей дома')
                require(isinstance(color,str) and re.fullmatch(r'#[0-9a-fA-F]{6}',color) is not None,'Цвет фасада должен иметь формат #RRGGBB')
                color=color.lower()
                require(db.execute('SELECT COUNT(*) FROM clan_members WHERE clan_id=?',(cid,)).fetchone()[0]>=4,
                        'Для строительства нужны минимум четыре участника клана','clan_members_required',409)
                require(active_participant_lobby(db,account_id) is None and active_cards(db,account_id) is None,
                        'Строительство доступно после завершения текущей игры','active_match_scene',409)
                position=self._touch(db,account_id)
                plot=next(b for b in DISTRICT_BUILDINGS if b['id']==building);door=plot['door']
                require(position['scene']=='city' and math.hypot(position['x']-door['x'],position['y']-door['y'])<=WORLD_INTERACTION_RADII['door'],
                        'Подойдите к входу выбранного участка','door_distance',409)
                occupant=db.execute("SELECT id FROM clans WHERE status='active' AND building_id=?",(building,)).fetchone()
                require(occupant is None,'Участок уже занят','building_occupied',409)
                base=json.loads(clan['base'])|{'exterior_style':style,'exterior_color':color,'exterior_locked':True}
                db.execute('UPDATE clans SET building_id=?,base=? WHERE id=?',(building,json.dumps(base,ensure_ascii=False),cid))
            elif action=='base':
                require(clan['building_id'] is not None,'Сначала постройте клановый дом','base_unassigned',409)
                items=data.get('items')
                require(isinstance(items,list) and len(items)<=30,'На базе может быть до 30 объектов')
                previous=json.loads(clan['base'])
                wall=normalized_base_color(data.get('wall_color',previous.get('wall_color','#faf8f2')))
                floor=normalized_base_color(data.get('floor_color',previous.get('floor_color','#141414')))
                surfaces={}
                for key,allowed in (('surface_style',BASE_SURFACE_STYLES),('wall_material',BASE_WALL_MATERIALS)):
                    if key in data:
                        require(data[key] in allowed,'Выберите доступный материал помещения')
                        surfaces[key]=data[key]
                for key,fixed in (('exterior_style',previous.get('exterior_style',0)),('exterior_color',previous.get('exterior_color',clan['color']))):
                    require(key not in data or type(data[key]) is type(fixed) and data[key]==fixed,
                            'После строительства фасад нельзя изменить','exterior_locked',409)
                ids=set();clean=[];occupied=[]
                for item in items:
                    require(isinstance(item,dict),'Неверный объект базы')
                    oid=bounded(item.get('id'),64,'Объект',1)
                    require(oid not in ids,'Повтор объекта базы')
                    require(isinstance(item.get('type'),str) and item['type'] in FURNITURE_TYPES,'Неверный тип объекта')
                    require(type(item.get('x')) is int and 0<=item['x']<12 and type(item.get('y')) is int and 0<=item['y']<8,'Координаты сетки 12×8')
                    color=normalized_base_color(item.get('color','#faf8f2'));variant=item.get('variant','standard')
                    require('source_asset' not in item,'Выберите доступный стиль мебели')
                    if 'source_theme' in item:
                        require(item['source_theme'] in SOURCE_FURNITURE_THEMES,'Выберите доступный стиль мебели')
                    require(variant in ('standard','premium'),'Неверный вариант мебели')
                    rotation=item.get('rotation')
                    require('rotation' not in item or type(rotation) is int and rotation in FURNITURE_TYPES[item['type']]['rotations'],'Поворот мебели: 0, 90, 180 или 270')
                    require(rotation is not None or 'legacy_footprint' in FURNITURE_TYPES[item['type']],'Для новой мебели нужен поворот')
                    width,height=furniture_footprint(item)
                    require(item['x']+width<=12 and item['y']+height<=8,'Мебель выходит за границы сетки')
                    if FURNITURE_TYPES[item['type']]['solid']:
                        box=(item['x'],item['y'],item['x']+width,item['y']+height)
                        require(not any(box[0]<other[2] and box[2]>other[0] and box[1]<other[3] and box[3]>other[1] for other in occupied),'Мебель пересекается')
                        occupied.append(box)
                    if variant=='premium':
                        from economy import inventory_quantity
                        require(inventory_quantity(db,account_id,'furniture-'+item['type'])>0,'Сначала купите премиальную мебель','furniture_locked',403)
                    ids.add(oid);clean.append({k:item[k] for k in ('id','type','x','y')} | {'color':color,'variant':variant} |
                        ({'rotation':rotation} if rotation is not None else {}) |
                        ({'source_theme':item['source_theme']} if 'source_theme' in item else {}))
                base=previous|{'items':clean,'wall_color':wall,'floor_color':floor,
                               'exterior_style':previous.get('exterior_style',0),
                               'exterior_color':previous.get('exterior_color',clan['color']),'exterior_locked':True}|surfaces
                # The entry and exit must stay usable even after every player
                # disconnects. Reserve a two-body-wide arrival aisle, not a
                # decorative sprite area; rugs remain legal on that floor.
                spawn=WORLD_MAP['base']['spawn'];bounds=WORLD_MAP['base']['bounds']
                entry=(spawn['x']-BODY_RADIUS*2,spawn['y']-BODY_RADIUS*2,
                       spawn['x']+BODY_RADIUS*2,bounds['bottom'])
                require(not any(bx<entry[2] and bx+w>entry[0] and by<entry[3] and by+h>entry[1]
                                for bx,by,w,h in base_footprints(clean)),
                        'Оставьте свободными вход и проход к выходу','base_entry_blocked',409)
                require(base_layout_reachable(cid,clean),'Оставьте проход от входа к каждому месту для сидения','base_layout_blocked',409)
                db.execute('UPDATE clans SET base=? WHERE id=?',(json.dumps(base,ensure_ascii=False),cid))
            else: require(False,'Действие не найдено','not_found',404)
            return self._clan_snapshot(db,account_id,cid)

    def _owned_boat(self,db,uid):
        return db.execute('SELECT * FROM world_boats WHERE occupant_id=?',(uid,)).fetchone()

    def _boat_snapshot(self,db,uid):
        row=self._owned_boat(db,uid)
        return {key:row[key] for key in ('id','x','y')} if row else None

    def _pet_effect(self,db,uid):
        row=db.execute('SELECT * FROM world_pet_effects WHERE account_id=?',(uid,)).fetchone()
        if row and row['started_at']<=self.clock()<row['started_at']+row['duration']:
            return {key:row[key] for key in ('id','target_id','kind','started_at','duration')}
        return None

    def _clean_boats(self,db,now,activity):
        restricted,participants,tables=activity
        for boat in db.execute('SELECT * FROM world_boats WHERE occupant_id IS NOT NULL').fetchall():
            uid=boat['occupant_id'];presence=db.execute('SELECT * FROM presence WHERE account_id=?',(uid,)).fetchone()
            if (boat['id'] not in BOATS or presence is None or presence['updated']<=now-PRESENCE_TTL or
                    presence['scene']!='city' or uid in restricted or uid in participants or uid in tables):
                release_boat(db,uid)

    def boat_action(self,account_id,data):
        action,bid=data.get('action'),data.get('target_id')
        require(action in ('boat-board','boat-exit') and isinstance(bid,str) and bid in BOATS,
                'Лодка не найдена','not_found',404)
        with self.game.transaction() as db:
            self._guard(db,account_id)
            require(active_participant_lobby(db,account_id) is None and active_cards(db,account_id) is None,
                    'Сначала завершите текущую игру','match_conflict',409)
            position=self._touch(db,account_id)
            own=self._owned_boat(db,account_id);boat=BOATS[bid]
            if action=='boat-exit':
                require(own is not None and own['id']==bid,'Вы не находитесь в этой лодке','boat_not_owned',403)
                require(math.hypot(own['x']-boat['dock']['x'],own['y']-boat['dock']['y'])<=85,
                        'Вернитесь к своему причалу','boat_dock_distance',409)
                release_boat(db,account_id)
            elif own:
                require(own['id']==bid,'Сначала выйдите из текущей лодки','boat_exit_required',409)
            else:
                dry=boat['boarding']
                require(position['scene']=='city' and math.hypot(position['x']-dry['x'],position['y']-dry['y'])<=dry['radius'],
                        'Подойдите к причалу','boat_distance',409)
                available=db.execute('SELECT * FROM world_boats WHERE id=?',(bid,)).fetchone()
                require(available['occupant_id'] is None,'Лодка уже занята','boat_occupied',409)
                db.execute('UPDATE world_boats SET occupant_id=?,updated=? WHERE id=?',(account_id,self.clock(),bid))
                db.execute("UPDATE presence SET x=?,y=?,pose=CASE WHEN phone_open=1 THEN 'phone' ELSE 'idle' END,bench_id=NULL,pose_until=NULL,sit_since=NULL WHERE account_id=?",
                           (available['x'],available['y'],account_id))
            return self._snapshot(db,account_id,self._touch(db,account_id))

    def _touch(self,db,account_id,data=None):
        now=self.clock()
        from economy import record_event
        activity=_activity_maps(db)
        restricted,participants,tables=activity
        self._clean_boats(db,now,activity)
        boat_users={row['occupant_id'] for row in db.execute('SELECT occupant_id FROM world_boats WHERE occupant_id IS NOT NULL')}
        for seated in db.execute('SELECT * FROM presence WHERE sit_since IS NOT NULL AND updated>? AND sit_since<=?',(now-PRESENCE_TTL,now-10)).fetchall():
            if seated['scene']=='city' and seated['bench_id'] in PARK_BENCHES and seated['account_id'] not in restricted:
                record_event(db,seated['account_id'],'sit10s',now)
        # Also save direct quiz/card/clan returns before another player's TTL cleanup.
        # Most positions already match their durable copy. Only direct game /
        # clan transitions (or legacy rows) need saving before TTL cleanup.
        for stored in db.execute("""SELECT presence.* FROM presence
                LEFT JOIN world_positions saved ON saved.account_id=presence.account_id
                WHERE presence.scene IN ('city','base','interior') AND
                (saved.account_id IS NULL OR saved.x!=presence.x OR saved.y!=presence.y
                 OR saved.scene!=presence.scene OR saved.scene_id IS NOT presence.scene_id)""").fetchall():
            remember_position(db,stored['account_id'],stored['x'],stored['y'],stored['scene'],stored['scene_id'])
        db.execute('DELETE FROM presence WHERE updated<=?',(now-PRESENCE_TTL,))
        db.execute("UPDATE presence SET pose='idle',pose_until=NULL WHERE pose_until IS NOT NULL AND pose_until<=?",(now,))
        # Remove every restricted juror, including accounts present before assignment.
        for stored in db.execute('SELECT * FROM presence').fetchall():
            uid=stored['account_id']
            if uid in restricted:
                db.execute('DELETE FROM presence WHERE account_id=?',(uid,))
                continue
            if stored['scene']=='city' and uid not in boat_users:
                x,y=stored['x'],stored['y']
                seat=BENCHES.get(stored['bench_id']) if stored['pose'] in ('sit','phone') and uid not in participants and uid not in tables else None
                if seat and math.hypot(x-seat[0],y-seat[1])>1:
                    # Stable occupied city slots follow corrected map geometry.
                    # Preserve the seat claim, phone, pose and original sit timer.
                    x,y=seat
                    db.execute('UPDATE presence SET x=?,y=? WHERE account_id=?',(x,y,uid))
                    remember_position(db,uid,x,y,'city',None)
                if not valid_position('city',x,y,seated=seat is not None) or seat is None and city_footprint_contains(x,y):
                    point=nearest_city_position(x,y)
                    if not valid_position('city',*point):point=CITY_SPAWN
                    db.execute("UPDATE presence SET x=?,y=?,pose='idle',bench_id=NULL,pose_until=NULL WHERE account_id=?",(*point,uid))
            if stored['scene']=='interior':
                reconcile_interior_presence(db,stored)
            if stored['scene']=='base':
                if not base_access(db,uid,stored['scene_id']):
                    db.execute("UPDATE presence SET x=?,y=?,scene='city',scene_id=NULL,pose='idle',bench_id=NULL,pose_until=NULL,phone_open=0,sit_since=NULL WHERE account_id=?",(*CITY_SPAWN,uid))
                else:
                    base=json.loads(self._clan_row(db,stored['scene_id'])['base'])
                    seat=next((seat for seat in furniture_seats(stored['scene_id'],base.get('items',[])) if seat['id']==stored['bench_id']),None)
                    if stored['bench_id'] and (seat is None or math.hypot(stored['x']-seat['seat']['x'],stored['y']-seat['seat']['y'])>1):
                        db.execute("UPDATE presence SET pose='idle',bench_id=NULL,pose_until=NULL,sit_since=NULL WHERE account_id=?",(uid,))
                    claimed=retained_seat_position(db,stored,'base',stored['scene_id'],stored['x'],stored['y'])
                    if not valid_base_position(db,stored['scene_id'],stored['x'],stored['y'],seated=claimed):
                        point=nearest_base_position(db,stored['scene_id'],stored['x'],stored['y'])
                        if point is not None:
                            db.execute("UPDATE presence SET x=?,y=?,pose='idle',bench_id=NULL,pose_until=NULL,sit_since=NULL WHERE account_id=?",(*point,uid))
                            remember_position(db,uid,*point,'base',stored['scene_id'])
            match=participants.get(uid)
            table=tables.get(uid)
            if match and (stored['scene']!='arena' or stored['scene_id']!=match['id']):
                db.execute("UPDATE presence SET scene='arena',scene_id=?,x=600,y=510,pose='idle',bench_id=NULL,pose_until=NULL,phone_open=0 WHERE account_id=?",(match['id'],uid))
            elif table and (stored['scene']!='cards' or stored['scene_id']!=table['id']):
                db.execute("UPDATE presence SET scene='cards',scene_id=?,x=600,y=510,pose='idle',bench_id=NULL,pose_until=NULL,phone_open=0 WHERE account_id=?",(table['id'],uid))
            elif not match and not table and stored['scene'] in ('arena','cards'):
                db.execute("UPDATE presence SET scene='city',scene_id=NULL,x=?,y=?,pose='idle',bench_id=NULL,pose_until=NULL,phone_open=0 WHERE account_id=?",(*CITY_SPAWN,uid))
        row=db.execute('SELECT * FROM presence WHERE account_id=?',(account_id,)).fetchone()
        if row is None and data is not None:
            # Reconnection cannot erase the beginning of an authoritative sweep.
            # Restore durable feet (or the real spawn) before applying a move.
            self._touch(db,account_id)
            row=db.execute('SELECT * FROM presence WHERE account_id=?',(account_id,)).fetchone()
        boat=self._owned_boat(db,account_id)
        active=participants.get(account_id)
        table=tables.get(account_id)
        if data is None:
            retained=row or db.execute('SELECT * FROM world_positions WHERE account_id=?',(account_id,)).fetchone()
            x,y,scene,sid=(retained['x'],retained['y'],retained['scene'],retained['scene_id']) if retained else (*CITY_SPAWN,'city',None)
            if active is not None:
                if scene!='arena' or sid!=active['id']: x,y,scene,sid=600,510,'arena',active['id']
            elif table is not None:
                if scene!='cards' or sid!=table['id']: x,y,scene,sid=600,510,'cards',table['id']
            if scene=='base' and not base_access(db,account_id,sid): x,y,scene,sid=*CITY_SPAWN,'city',None
        else:
            x,y,scene=data.get('x'),data.get('y'),data.get('scene')
            require(type(x) in (int,float) and type(y) in (int,float) and (type(x) is int or math.isfinite(x)) and (type(y) is int or math.isfinite(y)),'Нужны конечные координаты')
            require(abs(x)<=10**6 and abs(y)<=10**6,'Координаты вне карты')
            require(scene in ('city','district','base','arena','cards','interior'),'Неверная сцена')
            points=movement_path(data)
            district_transition=scene=='district'
            if scene=='district': x,y,scene=*DISTRICT_SPAWN,'city'
            if active is not None:
                require(scene=='arena' and data.get('lobby_id')==active['id'],
                        'До завершения игры участник находится на арене','active_match_scene',409)
            if table is not None:
                require(scene=='cards' and data.get('table_id')==table['id'],
                        'До завершения карточной игры участник находится за столом','active_match_scene',409)
            if boat:
                require(scene=='city' and not data.get('teleport'),
                        'Сначала выйдите из лодки у причала','boat_exit_required',409)
                require(data.get('boat_id',boat['id'])==boat['id'],'Вы не находитесь в этой лодке','boat_not_owned',403)
                require(lake_contains(LAKE,x,y,12),'Лодка движется только по воде','boat_water_only',409)
                require(row is not None and all(lake_contains(LAKE,*p,12) and segment_stays_in_lake(LAKE,a,p,12)
                        for a,p in zip([(row['x'],row['y'])]+points,points)),
                        'Лодка не может пересечь берег или остров','boat_water_only',409)
            else:
                require(data.get('boat_id') is None,'Вы не находитесь в этой лодке','boat_not_owned',403)
                if 'teleport' in data:
                    require(type(data['teleport']) is bool,'Переход: логическое значение')
                if data.get('teleport'):
                    require(scene=='city' and any(math.hypot(x-px,y-py)<=0.01 for px,py in TRAVEL_POINTS) and valid_position('city',x,y),
                            'Выберите доступную точку перехода','travel_destination',403)
                elif scene=='city':
                    require(not pedestrian_lake_contains(LAKE,x,y,BODY_RADIUS) and (row is None or row['scene']!='city' or
                            all(not pedestrian_lake_contains(LAKE,*p,BODY_RADIUS) and not pedestrian_segment_crosses_lake(LAKE,a,p,BODY_RADIUS)
                                for a,p in zip([(row['x'],row['y'])]+points,points))),
                            'Пешком пересечь озеро нельзя','water_blocked',409)
            sid=None
            if scene=='interior':
                sid=data.get('interior_id',data.get('scene_id',data.get('building_id')))
                require(isinstance(sid,str) and sid in INTERIORS,'Помещение не найдено','not_found',404)
                require(row is not None and row['scene']=='interior' and row['scene_id']==sid,
                        'В помещение можно войти только через дверь','forbidden',403)
            elif scene=='base':
                sid=data.get('clan_id',data.get('scene_id',account_clan(db,account_id)))
                require(base_access(db,account_id,sid),'База доступна участнику или приглашённому гостю','forbidden',403)
                require(self._clan_row(db,sid)['building_id'] is not None,'У клана нет здания','base_unassigned',409)
            elif scene=='arena':
                sid=data.get('lobby_id')
                lobby=self.game._load(db,sid,account_id)
                require(lobby['state'] not in ('waiting','finished') and lobby['members'][account_id]['role']=='participant','Арена доступна участнику активной игры','forbidden',403)
            elif scene=='cards':
                require(table is not None,'Карточная комната доступна участнику активной игры','forbidden',403)
                sid=table['id']
            if scene=='city' and not boat and any(math.hypot(x-sx,y-sy)<.01 for sx,sy in BENCHES.values()):
                # Seat coordinates are geometric interaction slots, not ordinary
                # walkable endpoints. Only a retained claim may occupy the support.
                seat=BENCHES.get(row['bench_id']) if row and row['scene']=='city' and row['pose'] in ('sit','phone') else None
                require(seat==(x,y) and (row['x'],row['y'])==(x,y),
                        'На скамейку садятся кнопкой действия','bench_pose_required',409)
            claimed=retained_seat_position(db,row,scene,sid,x,y) and all(p==(x,y) for p in points)
            require(bool(boat) or valid_position(scene,x,y,sid,seated=claimed),'Координаты вне проходимой зоны')
            if scene=='base':require(valid_base_position(db,sid,x,y,seated=claimed),'Координаты заняты мебелью')
            # Client frames can turn around a corner between publications. Check
            # those actual waypoints, never just their potentially blocked chord.
            same_scene=row is not None and row['scene']==scene and row['scene_id']==sid
            if not boat and same_scene and scene in ('city','interior','base') and not data.get('teleport') and not district_transition and not claimed:
                for px,py in points:
                    require(valid_position(scene,px,py,sid) and
                            (scene!='base' or valid_base_position(db,sid,px,py)),
                            'Путь проходит вне проходимой зоны','invalid_movement_path')
                if scene=='city':footprints=CITY_FOOTPRINTS
                elif scene=='interior':footprints=tuple((s['x'],s['y'],s['width'],s['height']) for s in INTERIORS[sid]['solids'])
                else:footprints=base_footprints(json.loads(self._clan_row(db,sid)['base']).get('items',[]))
                start=(row['x'],row['y'])
                if retained_seat_position(db,row,scene,sid,*start):
                    if scene=='city':start=nearest_city_position(*start)
                    elif scene=='interior':start=nearest_interior_position(INTERIORS[sid],*start)
                    else:
                        # Match the selected direction when stepping out of base
                        # furniture; arbitrary contact is legal only while seated.
                        dx,dy=points[0][0]-start[0],points[0][1]-start[1]
                        box=next((b for b in footprints if b[0]<start[0]<b[0]+b[2] and b[1]<start[1]<b[1]+b[3]),None)
                        if box:
                            bx,by,w,h=box
                            start=(bx-BODY_RADIUS if dx<0 else bx+w+BODY_RADIUS,start[1]) if abs(dx)>abs(dy) else (start[0],by-BODY_RADIUS if dy<0 else by+h+BODY_RADIUS)
                        start=nearest_base_position(db,sid,*start)
                    require(start is not None,'Рядом с местом нет свободного прохода','seat_exit_blocked',409)
                for target in points:
                    reached=move_body_position(start,target,footprints)
                    start=reached
                    if reached!=target:break
                x,y=start
        claimed_seat=BENCHES.get(row['bench_id']) if row and row['scene']=='city' and row['pose'] in ('sit','phone') else None
        if scene=='city' and not boat and (not valid_position(scene,x,y,seated=claimed_seat is not None) or
                                         claimed_seat is None and city_footprint_contains(x,y)):
            x,y=nearest_city_position(x,y)
            if not valid_position(scene,x,y):x,y=CITY_SPAWN
        if scene=='interior' and not valid_position(scene,x,y,sid,seated=retained_seat_position(db,row,scene,sid,x,y)):
            room=INTERIORS.get(sid)
            point=nearest_interior_position(room,x,y) if room else None
            x,y,scene,sid=(*point,'interior',room['id']) if point is not None else (*CITY_SPAWN,'city',None)
        if scene=='base' and self._clan_row(db,sid)['building_id'] is None: x,y,scene,sid=*DISTRICT_SPAWN,'city',None
        if scene=='base' and not valid_base_position(db,sid,x,y,seated=retained_seat_position(db,row,scene,sid,x,y)):
            point=nearest_base_position(db,sid,x,y)
            if point is not None:x,y=point
        pose,bench,until=(row['pose'],row['bench_id'],row['pose_until']) if row else ('idle',None,None)
        phone=bool(row['phone_open']) if row else False
        if row and (scene!=row['scene'] or sid!=row['scene_id']): pose,bench,until,phone='idle',None,None,False
        elif row and (x!=row['x'] or y!=row['y']):
            bench=None
            if pose in ('sit','smoke'): pose,until='idle',None
        db.execute('INSERT INTO presence (account_id,x,y,scene,scene_id,updated,pose,bench_id,pose_until) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET x=excluded.x,y=excluded.y,scene=excluded.scene,scene_id=excluded.scene_id,updated=excluded.updated,pose=excluded.pose,bench_id=excluded.bench_id,pose_until=excluded.pose_until',
                   (account_id,x,y,scene,sid,now,pose,bench,until))
        db.execute('UPDATE presence SET phone_open=?,sit_since=CASE WHEN bench_id IS NULL THEN NULL ELSE sit_since END WHERE account_id=?',(int(phone),account_id))
        remember_position(db,account_id,x,y,scene,sid)
        if boat:db.execute('UPDATE world_boats SET x=?,y=?,updated=? WHERE occupant_id=?',(x,y,now,account_id))
        park=WORLD_MAP['landmarks']['park']
        if scene=='city' and math.hypot(x-park['x'],y-park['y'])<=750:record_event(db,account_id,'parkvisit',now)
        return {'x':x,'y':y,'scene':scene,'scene_id':sid,'pose':pose,'bench_id':bench,'phone_open':phone}

    def activity(self,account_id,data):
        require(isinstance(data,dict),'Требуется объект')
        action=data.get('action')
        require(action in ('phone','sit','stand'),'Действие не найдено','not_found',404)
        with self.game.transaction() as db:
            self._guard(db,account_id)
            position=self._touch(db,account_id)
            row=db.execute('SELECT * FROM presence WHERE account_id=?',(account_id,)).fetchone()
            if action=='phone':
                require(type(data.get('open')) is bool,'Открытие телефона: логическое значение')
                opened=data['open'];pose=row['pose']
                if opened and pose=='idle': pose='phone'
                elif not opened and pose=='phone': pose='sit' if row['bench_id'] else 'idle'
                db.execute('UPDATE presence SET phone_open=?,pose=? WHERE account_id=?',(int(opened),pose,account_id))
            elif action=='stand':
                self._stand(db,account_id,row)
            else:
                bench=data.get('bench_id')
                require(self._owned_boat(db,account_id) is None,'Сначала выйдите из лодки у причала','boat_exit_required',409)
                require(isinstance(bench,str),'Скамейка не найдена','not_found',404)
                if bench in BENCH_GROUPS:
                    slots=BENCH_GROUPS[bench]
                    bench=next((seat for seat in slots if not db.execute('SELECT 1 FROM presence WHERE bench_id=?',(seat,)).fetchone()),slots[0])
                active_base=self._active_base(db,account_id,position['scene_id']) if position['scene']=='base' else None
                base_seats={seat['id']:seat['seat'] for seat in active_base['base']['seats']} if active_base else {}
                require(isinstance(bench,str) and (bench in BENCHES or bench in INTERIOR_SEATS or bench in base_seats),'Скамейка не найдена','not_found',404)
                if bench in BENCHES:
                    require(position['scene']=='city','Скамейка находится в городе','forbidden',403)
                    x,y=BENCHES[bench]
                elif bench in INTERIOR_SEATS:
                    room_id,x,y=INTERIOR_SEATS[bench]
                    require(position['scene']=='interior' and position['scene_id']==room_id,
                            'Место находится в другом помещении','forbidden',403)
                else:x,y=base_seats[bench]['x'],base_seats[bench]['y']
                require(math.hypot(row['x']-x,row['y']-y)<=WORLD_INTERACTION_RADII['bench'],'Подойдите к скамейке','bench_distance',409)
                if row['bench_id']==bench:
                    self._stand(db,account_id,row)
                else:
                    require(db.execute('SELECT 1 FROM presence WHERE bench_id=? AND account_id!=?',(bench,account_id)).fetchone() is None,
                            'Место уже занято','bench_occupied',409)
                    db.execute("UPDATE presence SET x=?,y=?,pose='sit',bench_id=?,pose_until=NULL,sit_since=? WHERE account_id=?",(x,y,bench,self.clock(),account_id))
            return self._snapshot(db,account_id,self._touch(db,account_id))

    def _stand(self,db,account_id,row):
        """A seat is a contact exception; standing restores full foot clearance."""
        scene,sid=row['scene'],row['scene_id'];point=(row['x'],row['y'])
        if scene=='city' and self._owned_boat(db,account_id) is None:point=nearest_city_position(*point)
        elif scene=='interior':point=nearest_interior_position(INTERIORS[sid],*point)
        elif scene=='base':point=nearest_base_position(db,sid,*point)
        require(point is not None,'Рядом с местом нет свободного прохода','seat_exit_blocked',409)
        db.execute("UPDATE presence SET x=?,y=?,pose='idle',bench_id=NULL,pose_until=NULL,sit_since=NULL WHERE account_id=?",(*point,account_id))
        remember_position(db,account_id,*point,scene,sid)

    def _snapshot(self,db,account_id,position):
        from economy import ITEMS,selected_pet,moscow_day
        results={}
        for result in db.execute('SELECT clan_id,score,win FROM clan_results'):
            results.setdefault(result['clan_id'],[]).append(result)
        member_counts={row['clan_id']:row['count'] for row in db.execute('SELECT clan_id,COUNT(*) AS count FROM clan_members GROUP BY clan_id')}
        history=[self._summary(db,r,results.get(r['id'],[]),member_counts.get(r['id'],0)) for r in db.execute('SELECT * FROM clans ORDER BY rowid')]
        clans=[c for c in history if c['status']=='active']
        summaries={c['id']:c for c in history}
        clan_map={c['id']:{k:c[k] for k in ('id','name','color','flag','building_id','exterior_style','exterior_color','exterior_locked')} for c in clans}
        building_clans={c['building_id']:clan_map[c['id']] for c in clans if c['building_id'] is not None}
        players=[]
        now=self.clock()
        own=None
        # All joins are one-to-one on their primary/unique keys. Filter the
        # room before loading profile/ownership; IS preserves the NULL city id.
        for row in db.execute('''SELECT p.*,a.id AS profile_id,a.profile,m.clan_id,
                pet.item_id AS pet_id,inventory.quantity AS pet_quantity,
                boat.id AS boat_id,boat.x AS boat_x,boat.y AS boat_y,
                effect.id AS effect_id,effect.target_id,effect.kind AS effect_kind,effect.started_at,effect.duration,
                action.id AS action_id,action.type AS action_type,action.started_at AS action_started_at,action.duration AS action_duration,
                action.item_id AS action_item_id,action.target_id AS action_target_id,action.x AS action_x,action.y AS action_y,litter.quantity AS litter_quantity
                FROM presence p LEFT JOIN accounts a ON a.id=p.account_id
                LEFT JOIN clan_members m ON m.account_id=p.account_id
                LEFT JOIN account_pets pet ON pet.account_id=p.account_id
                LEFT JOIN inventory ON inventory.account_id=p.account_id AND inventory.item_id=pet.item_id
                LEFT JOIN world_boats boat ON boat.occupant_id=p.account_id
                LEFT JOIN world_pet_effects effect ON effect.account_id=p.account_id
                LEFT JOIN world_action_effects action ON action.account_id=p.account_id
                LEFT JOIN inventory litter ON litter.account_id=p.account_id AND litter.item_id='trash'
                WHERE p.scene=? AND p.scene_id IS ? ORDER BY p.rowid''',(position['scene'],position['scene_id'])):
            profile=_joined_profile(row)
            pet={'id':row['pet_id'],'kind':ITEMS[row['pet_id']]['pet_kind']} if row['pet_id'] and (row['pet_quantity'] or 0)>0 else None
            boat={'id':row['boat_id'],'x':row['boat_x'],'y':row['boat_y']} if row['boat_id'] else None
            effect={'id':row['effect_id'],'target_id':row['target_id'],'kind':row['effect_kind'],
                    'started_at':row['started_at'],'duration':row['duration']} if row['effect_id'] and row['started_at']<=now<row['started_at']+row['duration'] else None
            action_state={'action_effect':effect_from_row(row,now,'action_'),'holding':'litter' if (row['litter_quantity'] or 0)>0 else None}
            if row['account_id']==account_id:own={'clan_id':row['clan_id'],'pet':pet,'boat':boat,'pet_effect':effect}|action_state
            players.append(profile | action_state | {'x':row['x'],'y':row['y'],'scene':row['scene'],'scene_id':row['scene_id'],
                                      'interior_id':row['scene_id'] if row['scene']=='interior' else None,
                                      'phone_open':bool(row['phone_open']),
                                      'pet':pet,'boat':boat,'pet_effect':effect,
                                      'pose':row['pose'],'bench_id':row['bench_id'],'clan':clan_map.get(row['clan_id'])})
        if own is None:
            own={'clan_id':account_clan(db,account_id),'pet':selected_pet(db,account_id),
                 'boat':self._boat_snapshot(db,account_id),'pet_effect':self._pet_effect(db,account_id)}|action_snapshot(db,account_id,now)
        cid=own['clan_id']
        return {'action_effect':own['action_effect'],'holding':own['holding'],'server_time':now,'animals':animals_at(now,current_pauses(db,now)) if position['scene']=='city' else [],
                'restricted':False,'scene':position['scene'],'scene_id':position['scene_id'],
                'interior_id':position['scene_id'] if position['scene']=='interior' else None,
                'interior':INTERIORS.get(position['scene_id']) if position['scene']=='interior' else None,
                'position':{k:position[k] for k in ('x','y')},
                'arena_lobby_id':position['scene_id'] if position['scene']=='arena' else None,
                'card_table_id':position['scene_id'] if position['scene']=='cards' else None,
                'pose':position['pose'],'bench_id':position['bench_id'],'phone_open':position['phone_open'],
                'pet':dict(own['pet']) if own['pet'] else None,
                'boat':dict(own['boat']) if own['boat'] else None,'pet_effect':dict(own['pet_effect']) if own['pet_effect'] else None,
                'boats':[{'id':b['id'],'x':b['x'],'y':b['y'],'occupant_id':b['occupant_id'],
                          'dock':BOATS[b['id']]['dock'],'boarding':BOATS[b['id']]['boarding']}
                         for b in db.execute('SELECT * FROM world_boats ORDER BY id') if b['id'] in BOATS] if position['scene']=='city' else [],
                'collected_litter':[row['target_id'] for row in db.execute('SELECT target_id FROM litter_picks WHERE account_id=? AND day=?',(account_id,moscow_day(self.clock())))],
                'wallet':{'currency':'Бзинге','balance':db.execute('SELECT balance FROM wallets WHERE account_id=?',(account_id,)).fetchone()['balance']},
                'buildings':[{'id':b['id'],'name':b['name'],'clan':building_clans.get(b['id'])} for b in DISTRICT_BUILDINGS],
                'players':players,'clans':clans,'my_clan':self._clan_snapshot(db,account_id,cid,summaries[cid]) if cid else None,
                'active_base':self._active_base(db,account_id,position['scene_id']) if position['scene']=='base' else None,
                'leaderboard':sorted(history,key=lambda c:(-c['score'],-c['wins'],c['name'])),
                'max_online':MAX_ONLINE,'online_count':db.execute('SELECT COUNT(*) FROM active_accounts').fetchone()[0]}

    def snapshot(self,account_id):
        with self.game.transaction() as db:
            require(self.game._profile(db,account_id) is not None,'Сначала создайте профиль')
            self._admit(db,account_id)
            if jury_restricted(db,account_id):
                release_boat(db,account_id)
                db.execute('DELETE FROM presence WHERE account_id=?',(account_id,))
                return {'action_effect':None,'holding':None,'server_time':self.clock(),'animals':[],'restricted':True,'scene':'restricted','scene_id':None,'interior_id':None,'interior':None,'position':None,'buildings':[],'players':[], 'clans':[], 'my_clan':None,'active_base':None,'pet':None,'boat':None,'boats':[],'pet_effect':None,'phone_open':False,'leaderboard':[],'card_table_id':None,'arena_lobby_id':None,'max_online':MAX_ONLINE,'online_count':0}
            return self._snapshot(db,account_id,self._touch(db,account_id))

    def move(self,account_id,data):
        require(isinstance(data,dict),'Требуется объект')
        with self.game.transaction() as db:
            self._guard(db,account_id)
            return self._snapshot(db,account_id,self._touch(db,account_id,data))

    def enter(self,account_id,data):
        require(isinstance(data,dict),'Требуется объект')
        building=data.get('building_id')
        require(isinstance(building,str) and building in INTERIORS,'Помещение не найдено','not_found',404)
        room=INTERIORS[building]
        with self.game.transaction() as db:
            self._guard(db,account_id)
            position=self._touch(db,account_id)
            require(active_participant_lobby(db,account_id) is None and active_cards(db,account_id) is None,
                    'Сначала завершите активную игру','active_match_scene',409)
            require(self._owned_boat(db,account_id) is None,'Сначала выйдите из лодки у причала','boat_exit_required',409)
            require(position['scene']=='city','Войти можно из города','forbidden',403)
            require(math.hypot(position['x']-room['door']['x'],position['y']-room['door']['y'])<=WORLD_INTERACTION_RADII['door'],
                    'Подойдите к двери','door_distance',409)
            db.execute("UPDATE presence SET x=?,y=?,scene='interior',scene_id=?,pose='idle',bench_id=NULL,pose_until=NULL,phone_open=0 WHERE account_id=?",
                       (room['spawn']['x'],room['spawn']['y'],building,account_id))
            if building in ('casino','terrace'):
                from economy import record_event
                record_event(db,account_id,'casinovisit' if building=='casino' else 'terracevisit',self.clock())
            return self._snapshot(db,account_id,self._touch(db,account_id))

    def exit(self,account_id,data):
        require(isinstance(data,dict),'Требуется объект')
        with self.game.transaction() as db:
            self._guard(db,account_id)
            position=self._touch(db,account_id)
            require(active_participant_lobby(db,account_id) is None and active_cards(db,account_id) is None,
                    'Сначала завершите активную игру','active_match_scene',409)
            require(position['scene']=='interior' and position['scene_id'] in INTERIORS,
                    'Выход доступен из помещения','forbidden',403)
            room=INTERIORS[position['scene_id']]
            require(math.hypot(position['x']-room['exit']['x'],position['y']-room['exit']['y'])<=WORLD_INTERACTION_RADII['door'],
                    'Подойдите к выходу','door_distance',409)
            return self._snapshot(db,account_id,self._touch(db,account_id,
                {'scene':'city','x':room['door']['x'],'y':room['door']['y']+24}))
