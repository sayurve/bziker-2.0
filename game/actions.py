"""Short, server-authored item gestures; shared only with visible room peers."""
import math
from game import require, token

ACTION_TYPES=('eat','drink','pick-litter','throw-litter','smoke','fishing','fish-catch')
ACTION_DURATION=3
_ITEMS={'eat':'snack','drink':'coffee','pick-litter':'trash','throw-litter':'trash','smoke':'cigarette','fishing':'rod','fish-catch':'fish'}
_DURATIONS={'smoke':8,'fishing':2,'fish-catch':3}


def initialize_schema(db):
    db.execute('''CREATE TABLE IF NOT EXISTS world_action_effects (
        account_id TEXT PRIMARY KEY,id TEXT NOT NULL,type TEXT NOT NULL,
        started_at REAL NOT NULL,duration REAL NOT NULL,item_id TEXT NOT NULL,
        target_id TEXT,x REAL,y REAL)''')


def effect_from_row(row,now,prefix=''):
    """Read only public metadata from one existing joined row; never query here."""
    if row is None:return None
    effect_id=row[prefix+'id'];kind=row[prefix+'type'];start=row[prefix+'started_at'];duration=row[prefix+'duration']
    if not effect_id or kind not in ACTION_TYPES or start is None or duration is None or not start<=now<start+duration:return None
    result={'id':effect_id,'type':kind,'started_at':start,'duration':duration,
            'item_id':row[prefix+'item_id'],'target_id':row[prefix+'target_id']}
    for key in ('x','y'):
        if row[prefix+key] is not None:result[key]=row[prefix+key]
    return result


def action_snapshot(db,uid,now):
    row=db.execute('''SELECT effect.*,litter.quantity AS litter_quantity
            FROM accounts a LEFT JOIN world_action_effects effect ON effect.account_id=a.id
            LEFT JOIN inventory litter ON litter.account_id=a.id AND litter.item_id='trash'
            WHERE a.id=?''',(uid,)).fetchone()
    return {'action_effect':effect_from_row(row,now),'holding':'litter' if row and (row['litter_quantity'] or 0)>0 else None}


def start_action(db,uid,kind,now,*,item_id,target_id=None,point=None):
    """Call inside the successful inventory mutation's transaction only."""
    require(kind in ACTION_TYPES and _ITEMS[kind]==item_id,'Действие не найдено','not_found',404)
    require(type(now) in (int,float) and math.isfinite(now),'Неверное время действия')
    if kind in ('pick-litter','throw-litter'):
        require(isinstance(target_id,str) and point is not None and all(type(point.get(key)) in (int,float) and math.isfinite(point[key]) for key in ('x','y')),'Неверная цель действия')
    else:
        require(target_id is None and point is None,'Неверная цель действия')
    effect_id=token();x,y=(point['x'],point['y']) if point else (None,None)
    duration=_DURATIONS.get(kind,ACTION_DURATION)
    db.execute('INSERT OR REPLACE INTO world_action_effects VALUES (?,?,?,?,?,?,?,?,?)',
               (uid,effect_id,kind,now,duration,item_id,target_id,x,y))
    result={'id':effect_id,'type':kind,'started_at':now,'duration':duration,'item_id':item_id,'target_id':target_id}
    if point:result|={'x':x,'y':y}
    return result
