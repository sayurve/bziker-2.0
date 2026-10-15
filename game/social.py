"""Account-owned phone messages and invitations; no client-provided invite codes."""
import json
from game import bounded, nickname_key, require, token
from world import jury_restricted


class SocialService:
    def __init__(self,game,world):
        self.game,self.world=game,world
        with game.transaction() as db:
            db.execute('CREATE TABLE IF NOT EXISTS direct_messages (id TEXT PRIMARY KEY, from_id TEXT NOT NULL, to_id TEXT NOT NULL, text TEXT NOT NULL, created REAL NOT NULL, seen INTEGER NOT NULL DEFAULT 0)')
            db.execute('CREATE INDEX IF NOT EXISTS direct_message_peers ON direct_messages(from_id,to_id,created)')
            db.execute('CREATE TABLE IF NOT EXISTS invitations (id TEXT PRIMARY KEY, from_id TEXT NOT NULL, to_id TEXT NOT NULL, lobby_id TEXT NOT NULL, role TEXT NOT NULL, team_id TEXT, state TEXT NOT NULL, created REAL NOT NULL)')
            db.execute('CREATE INDEX IF NOT EXISTS invitation_owner ON invitations(to_id,created)')

    def _guard(self,db,uid):
        self.world._guard(db,uid)

    def _peer(self,db,uid,peer_id,allow_restricted=False):
        require(isinstance(peer_id,str) and peer_id!=uid,'Выберите другого игрока')
        row=db.execute('SELECT profile FROM accounts WHERE id=?',(peer_id,)).fetchone()
        require(row is not None and row['profile'] is not None,'Игрок не найден','not_found',404)
        require(allow_restricted or not jury_restricted(db,peer_id),'Игрок недоступен до завершения назначения жюри','jury_restricted',403)
        return self.game._profile(db,peer_id)

    def search(self,uid,query):
        require(isinstance(query,str) and len(query)<=64,'Неверный запрос поиска')
        with self.game.transaction() as db:
            self._guard(db,uid)
            online={r['account_id'] for r in db.execute('SELECT account_id FROM active_accounts')}
            needle=nickname_key(query.strip()); result=[]
            for row in db.execute('SELECT id,profile FROM accounts WHERE profile IS NOT NULL ORDER BY rowid'):
                if row['id']==uid or jury_restricted(db,row['id']): continue
                profile=json.loads(row['profile'])
                if needle in nickname_key(profile['name']):
                    result.append(profile | {'online':row['id'] in online})
                if len(result)>=100: break
            return {'players':result,'restricted':False}

    def _conversation(self,db,uid,peer_id):
        peer=self._peer(db,uid,peer_id)
        db.execute('UPDATE direct_messages SET seen=1 WHERE from_id=? AND to_id=?',(peer_id,uid))
        messages=[{k:row[k] for k in ('id','from_id','text','created')} for row in db.execute(
            'SELECT * FROM direct_messages WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?) ORDER BY created,rowid',
            (uid,peer_id,peer_id,uid))]
        return {'peer':peer,'messages':messages,'restricted':False}

    def conversation(self,uid,peer_id):
        with self.game.transaction() as db:
            self._guard(db,uid)
            return self._conversation(db,uid,peer_id)

    def message(self,uid,peer_id,data):
        require(isinstance(data,dict),'Требуется объект')
        text=bounded(data.get('text'),2000,'Сообщение',1)
        with self.game.transaction() as db:
            self._guard(db,uid); self._peer(db,uid,peer_id)
            db.execute('INSERT INTO direct_messages (id,from_id,to_id,text,created) VALUES (?,?,?,?,?)',
                       (token(),uid,peer_id,text,self.world.clock()))
            return self._conversation(db,uid,peer_id)

    def phone(self,uid):
        with self.game.transaction() as db:
            self._guard(db,uid)
            notifications=[]
            for row in db.execute('SELECT * FROM invitations WHERE to_id=? ORDER BY created DESC,rowid DESC',(uid,)):
                if jury_restricted(db,row['from_id']): continue
                lobby=db.execute('SELECT data FROM lobbies WHERE id=?',(row['lobby_id'],)).fetchone()
                if not lobby: continue
                lobby=json.loads(lobby['data'])
                sender=self.game._profile(db,row['from_id'])
                notifications.append({'id':row['id'],'kind':'invite','from':sender,
                                      'lobby':{'id':lobby['id'],'title':lobby['title']},'role':row['role'],'state':row['state']})
            conversations={}
            for row in db.execute('SELECT * FROM direct_messages WHERE from_id=? OR to_id=? ORDER BY created DESC,rowid DESC',(uid,uid)):
                peer_id=row['to_id'] if row['from_id']==uid else row['from_id']
                if jury_restricted(db,peer_id): continue
                if peer_id not in conversations:
                    peer=self._peer(db,uid,peer_id)
                    conversations[peer_id]={'peer':peer,'last_text':row['text'],'unread':0}
                if row['to_id']==uid and not row['seen']: conversations[peer_id]['unread']+=1
            unread=sum(c['unread'] for c in conversations.values())+sum(n['state']=='pending' for n in notifications)
            return {'restricted':False,'notifications':notifications,'conversations':list(conversations.values()),'unread':unread}

    def _invitation_code(self,lobby,uid,role,team_id):
        require(lobby['state']=='waiting','Состав игры уже зафиксирован','invitation_stale',409)
        require(role in ('player','curator'),'Неверная роль приглашения')
        member=lobby['members'].get(uid)
        require(member is not None and member['role']=='participant','Нет доступа к приглашению','forbidden',403)
        host=lobby['host']==uid
        if role=='curator':
            require(host and team_id is None,'Кураторов приглашает ведущий','forbidden',403)
            return lobby['jury_code'],None
        own=next((t for t in lobby['teams'] if t['captain_id']==uid),None)
        if team_id is not None:
            require(isinstance(team_id,str) and own is not None and own['id']==team_id,'Приглашение в свою команду доступно капитану','forbidden',403)
            return own['code'],own['id']
        if own: return own['code'],own['id']
        require(host,'Приглашения игроков доступны ведущему или капитану','forbidden',403)
        return lobby['player_code'],None

    def invite(self,uid,data):
        require(isinstance(data,dict),'Требуется объект')
        require(not {'code','invite_code'} & set(data),'Код приглашения выбирает сервер')
        with self.game.transaction() as db:
            self._guard(db,uid)
            peer=data.get('to_id'); self._peer(db,uid,peer)
            lobby=self.game._load(db,data.get('lobby_id'),uid)
            role=data.get('role'); _,team=self._invitation_code(lobby,uid,role,data.get('team_id'))
            existing=lobby['members'].get(peer)
            if existing:
                require(existing['role']==('curator' if role=='curator' else 'participant'),'Роли участника и куратора несовместимы','forbidden',403)
                require(team is None or existing['team'] in (None,team),'Игрок уже в другой команде','forbidden',403)
            pending=db.execute("SELECT id FROM invitations WHERE from_id=? AND to_id=? AND lobby_id=? AND role=? AND team_id IS ? AND state='pending'",(uid,peer,lobby['id'],role,team)).fetchone()
            if not pending:
                db.execute('INSERT INTO invitations VALUES (?,?,?,?,?,?,?,?)',(token(),uid,peer,lobby['id'],role,team,'pending',self.world.clock()))
            return {'sent':True}

    def respond(self,uid,invitation_id,action):
        require(isinstance(invitation_id,str),'Неверное приглашение')
        require(action in ('accept','dismiss'),'Действие не найдено','not_found',404)
        with self.game.transaction() as db:
            self._guard(db,uid)
            invitation=db.execute('SELECT * FROM invitations WHERE id=?',(invitation_id,)).fetchone()
            require(invitation is not None,'Приглашение не найдено','not_found',404)
            require(invitation['to_id']==uid,'Чужое приглашение','forbidden',403)
            desired='accepted' if action=='accept' else 'dismissed'
            require(invitation['state'] in ('pending',desired),'Приглашение уже обработано','invitation_closed',409)
            if invitation['state']=='pending':
                if action=='accept':
                    require(not jury_restricted(db,invitation['from_id']),'Отправитель недоступен','jury_restricted',403)
                    lobby=self.game._load(db,invitation['lobby_id'],invitation['from_id'])
                    code,_=self._invitation_code(lobby,invitation['from_id'],invitation['role'],invitation['team_id'])
                    self.game._join(db,uid,code)
                db.execute('UPDATE invitations SET state=? WHERE id=?',(desired,invitation_id))
            return {'accepted':True,'lobby_id':invitation['lobby_id']} if action=='accept' else {'dismissed':True}
