"""Deterministic city animals; the same routes and timing are used by the browser.

No accounts, periodic coordinate writes or independent simulation sessions are
needed. A short pet pause freezes the route clock, then catches up smoothly.
"""
import json
import math
from pathlib import Path

ANIMALS={a['id']:a for a in json.loads((Path(__file__).resolve().parent/'web'/'animals-map.json').read_text())['animals']}
PAUSE_CATCHUP=2


def _route_time(now,pause):
    if not pause:return now,False
    start,duration=pause.get('started_at'),pause.get('duration')
    if not isinstance(start,(int,float)) or not isinstance(duration,(int,float)) or duration<=0 or now<start:return now,False
    end=start+duration
    anchor=pause.get('route_time',start)
    if now<end:return anchor,True
    if now<end+PAUSE_CATCHUP:
        remaining=1-(now-end)/PAUSE_CATCHUP
        return now-(end-anchor)*remaining**2,False
    return now,False


def animal_position(animal,now,pause=None):
    """Return an anonymous public sprite/action position at server time seconds."""
    moment,held=_route_time(now,pause)
    route=animal['route'];speed=animal['speed']
    spans=[math.hypot(b['x']-a['x'],b['y']-a['y'])/speed for a,b in zip(route,route[1:]+route[:1])]
    cycle=sum(p['dwell']+span for p,span in zip(route,spans))
    phase=(moment+animal.get('phase',0))%cycle
    result={key:animal[key] for key in ('id','kind','action','label','radius')}
    for index,(point,span) in enumerate(zip(route,spans)):
        next_point=route[(index+1)%len(route)];dx=next_point['x']-point['x'];dy=next_point['y']-point['y']
        facing=('right' if dx>0 else 'left') if abs(dx)>abs(dy) else ('down' if dy>0 else 'up')
        if phase<point['dwell']:
            return result|{'x':float(point['x']),'y':float(point['y']),'facing':facing,'walking':False,'walk_frame':0}
        phase-=point['dwell']
        if phase<span:
            ratio=phase/span if span else 0
            return result|{'x':point['x']+dx*ratio,'y':point['y']+dy*ratio,'facing':facing,'walking':not held,'walk_frame':int(math.floor(phase*speed/10)%4) if not held else 0}
        phase-=span
    return result|{'x':float(route[0]['x']),'y':float(route[0]['y']),'facing':'down','walking':False,'walk_frame':0}


def animals_at(now,pauses=None):
    pauses=pauses or {};result=[]
    for animal in ANIMALS.values():
        pause=pauses.get(animal['id'])
        valid=pause and pause['started_at']<=now<pause['started_at']+pause['duration']+PAUSE_CATCHUP
        row=animal_position(animal,now,pause if valid else None)
        if valid:row['pause']={key:pause[key] for key in ('started_at','duration','route_time') if key in pause}
        result.append(row)
    return result


def current_pauses(db,now):
    """One city-level read, regardless of the number of visible players."""
    return {row['target_id']:{key:row[key] for key in ('started_at','duration','route_time')}
            for row in db.execute('SELECT * FROM world_animal_pauses WHERE started_at<=? AND started_at+duration+?>?',(now,PAUSE_CATCHUP,now))
            if row['target_id'] in ANIMALS}


def animal_pause(db,target,now):
    row=db.execute('SELECT started_at,duration,route_time FROM world_animal_pauses WHERE target_id=?',(target,)).fetchone()
    return dict(row) if row and row['started_at']<=now<row['started_at']+row['duration']+PAUSE_CATCHUP else None


def pause_animal(db,target,now,duration=2):
    """A pet action alone writes a 12-row maximum, identity-free reaction store.

    Re-anchoring to the current route time preserves the real point when another
    person pets the same animal during its pause or catch-up.
    """
    anchor,_=_route_time(now,animal_pause(db,target,now))
    db.execute('INSERT OR REPLACE INTO world_animal_pauses VALUES (?,?,?,?)',(target,now,duration,anchor))
