"""Transactional game rules and role-filtered views; standard library only."""
import json
import secrets
import time
import sqlite3
import unicodedata
from contextlib import contextmanager
from decimal import Decimal
from pathlib import Path
from urllib.parse import urlsplit


class GameError(Exception):
    def __init__(self, code, message, status=400):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


def require(condition, message='Действие недоступно', code='invalid_action', status=400):
    if not condition:
        raise GameError(code, message, status)


def bounded(value, limit, label, minimum=0):
    require(isinstance(value, str), f'{label}: требуется текст')
    value = value.strip()
    visible = sum(not unicodedata.category(c).startswith('C') and not c.isspace() for c in value)
    require(minimum <= visible and len(value) <= limit, f'{label}: неверная длина')
    require(all(c in '\n\t' or not unicodedata.category(c).startswith('C') for c in value), f'{label}: недопустимые символы')
    return value


def token():
    return secrets.token_urlsafe(24)


AVATAR_RANGES = {'gender':1,'skin':7,'hairStyle':11,'hairColor':9,'shirtStyle':3,
                 'shirtColor':11,'pantsStyle':3,'pantsColor':7,'accessory':5,'shoesColor':5,'outfit':6,'headwear':4}


def nickname_key(name):
    return unicodedata.normalize('NFKC',unicodedata.normalize('NFKC',name).casefold())


def normalized_avatar(avatar):
    return {key:avatar.get(key,0) if type(avatar.get(key,0)) is int and 0<=avatar.get(key,0)<=maximum else 0
            for key,maximum in AVATAR_RANGES.items()}


class GameService:
    def __init__(self, db_path, bank_path=None):
        self.db_path = str(db_path)
        self.world_clock=time.time
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        bank = json.loads(Path(bank_path or Path(__file__).with_name('question-bank.demo.json')).read_text())
        self.topics = bank['topics'][:]
        if bank.get('final'):
            final = dict(bank['final'])
            final['value'] = final['proposed_value']
            self.topics.append({'id':'final','title':final['title'],'questions':[final]})
        self.questions = {q['id']: dict(q, topic=t['title'], title=q.get('title', f"{t['title']} · {q['value']}"))
                          for t in self.topics for q in t['questions']}
        with self.transaction() as db:
            db.execute('CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, telegram_id TEXT UNIQUE, profile TEXT)')
            db.execute('CREATE TABLE IF NOT EXISTS lobbies (id TEXT PRIMARY KEY, data TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, account_id TEXT, csrf TEXT NOT NULL, created INTEGER NOT NULL)')
            # Reservations preserve all older duplicate display names while preventing new duplicates.
            db.execute('CREATE TABLE IF NOT EXISTS nickname_reservations (name_key TEXT PRIMARY KEY)')
            for row in db.execute('SELECT id,profile FROM accounts WHERE profile IS NOT NULL').fetchall():
                profile=json.loads(row['profile'])
                db.execute('INSERT OR IGNORE INTO nickname_reservations VALUES (?)',(nickname_key(profile['name']),))
                profile['avatar']=normalized_avatar(profile.get('avatar',{}))
                db.execute('UPDATE accounts SET profile=? WHERE id=?',(json.dumps(profile,ensure_ascii=False),row['id']))
            from world import initialize_schema
            initialize_schema(db)
            from economy import initialize_schema as initialize_economy
            initialize_economy(db)

    @contextmanager
    def transaction(self):
        db = sqlite3.connect(self.db_path, timeout=15)
        db.row_factory = sqlite3.Row
        try:
            db.execute('BEGIN IMMEDIATE')
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    def create_account(self, telegram_id=None):
        with self.transaction() as db:
            if telegram_id is not None:
                existing = db.execute('SELECT id FROM accounts WHERE telegram_id=?',(str(telegram_id),)).fetchone()
                if existing: return existing['id']
            account_id = token()
            db.execute('INSERT INTO accounts VALUES (?,?,NULL)',(account_id,None if telegram_id is None else str(telegram_id)))
            from economy import ensure_wallet
            ensure_wallet(db,account_id)
            return account_id

    def _profile(self, db, account_id):
        row = db.execute('SELECT profile FROM accounts WHERE id=?',(account_id,)).fetchone()
        require(row is not None, 'Нужна авторизация', 'unauthorized', 401)
        return json.loads(row['profile']) if row['profile'] else None

    def profile(self, account_id, data):
        require(isinstance(data,dict),'Требуется объект')
        avatar = data.get('avatar',{})
        require(isinstance(avatar,dict),'Неверный аватар')
        require(not set(avatar)-set(AVATAR_RANGES),'Неизвестная часть аватара')
        for key,value in avatar.items():
            require(type(value) is int and 0<=value<=AVATAR_RANGES[key],'Неверная часть аватара')
        with self.transaction() as db:
            previous=self._profile(db,account_id)
            if previous:
                require(data.get('name',previous['name'])==previous['name'],'Ник нельзя изменить','nickname_immutable',409)
                name=previous['name']
            else:
                name=bounded(data.get('name'),32,'Ник',1)
                key=nickname_key(name)
                require(db.execute('SELECT 1 FROM nickname_reservations WHERE name_key=?',(key,)).fetchone() is None,
                        'Ник уже занят','nickname_taken',409)
                db.execute('INSERT INTO nickname_reservations VALUES (?)',(key,))
            result=normalized_avatar((previous or {}).get('avatar',{})) | avatar
            if result['outfit']:
                from economy import inventory_quantity
                require(inventory_quantity(db,account_id,f"outfit-{result['outfit']}")>0,
                        'Сначала купите этот костюм','outfit_locked',403)
            p = {'id':account_id,'name':name,'avatar':result}
            db.execute('UPDATE accounts SET profile=? WHERE id=?',(json.dumps(p,ensure_ascii=False),account_id))
        return p

    def bootstrap(self, account_id):
        with self.transaction() as db:
            profile = self._profile(db,account_id)
            lobbies = []
            for row in db.execute('SELECT data FROM lobbies ORDER BY rowid'):
                lobby = json.loads(row['data'])
                if account_id in lobby['members']:
                    lobbies.append({k:lobby[k] for k in ('id','title','mode','state')} | {'role':lobby['members'][account_id]['role']})
            return {'profile':profile,'lobbies':lobbies}

    def _save(self,db,lobby):
        db.execute('INSERT OR REPLACE INTO lobbies VALUES (?,?)',(lobby['id'],json.dumps(lobby,ensure_ascii=False)))

    def _load(self,db,lid,account_id):
        require(isinstance(lid,str),'Неверная игра')
        row = db.execute('SELECT data FROM lobbies WHERE id=?',(lid,)).fetchone()
        require(row is not None,'Игра не найдена','not_found',404)
        lobby = json.loads(row['data'])
        require(account_id in lobby['members'],'Нет доступа к игре','forbidden',403)
        return lobby

    def create_lobby(self,account_id,data):
        require(isinstance(data,dict),'Требуется объект')
        title = bounded(data.get('title'),80,'Название',1)
        mode = data.get('mode')
        require(mode in ('team','individual'),'Неверный режим')
        policy = data.get('answer_policy','all')
        require(policy in ('all','first'),'Неверный порядок ответов')
        maximum = data.get('max_teams',4)
        require(type(maximum) is int and 1 <= maximum <= 8,'Число команд: от 1 до 8')
        ctx = data.get('context',{})
        require(isinstance(ctx,dict),'Неверный контекст')
        ctx = {k:bounded(ctx.get(k,''),1000,k) for k in ('theme','audience','goal','constraints')}
        meeting = data.get('meeting_url','')
        require(isinstance(meeting,str) and len(meeting) <= 2000,'Неверная ссылка встречи')
        if meeting:
            try: url = urlsplit(meeting)
            except ValueError: raise GameError('invalid_input','Неверная ссылка встречи')
            require(url.scheme == 'https' and url.hostname and not url.username and not url.password
                    and not any(c.isspace() or ord(c)<32 for c in meeting),'Требуется HTTPS ссылка')
        with self.transaction() as db:
            require(self._profile(db,account_id) is not None,'Сначала создайте профиль')
            lid = token()
            lobby = {'id':lid,'title':title,'mode':mode,'max_teams':maximum,'context':ctx,'meeting_url':meeting,
                     'host':account_id,'state':'waiting','player_code':token(),'jury_code':token(),
                     'members':{account_id:{'role':'participant','team':None}},'teams':[], 'scores':{},
                     'used':[],'question_id':None,'answers':{},'cards':{},'finished_reviews':[],
                     'units':[],'chooser':0,'round_number':0,'awarded':False,
                     'answer_policy':policy,'buzz_owner':None,'unit_clans':{}}
            self._save(db,lobby)
            return {'id':lid}

    def join(self,account_id,code):
        with self.transaction() as db:
            return self._join(db,account_id,code)

    def _join(self,db,account_id,code):
        require(isinstance(code,str) and code.isascii() and 1 <= len(code) <= 100,'Неверный код')
        require(self._profile(db,account_id) is not None,'Сначала создайте профиль')
        for row in db.execute('SELECT data FROM lobbies'):
            lobby = json.loads(row['data'])
            role,team = None,None
            if secrets.compare_digest(code,lobby['player_code']): role='participant'
            if secrets.compare_digest(code,lobby['jury_code']): role='curator'
            for t in lobby['teams']:
                if secrets.compare_digest(code,t['code']): role,team='participant',t['id']
            if role is None: continue
            existing = lobby['members'].get(account_id)
            if existing:
                require(existing['role'] == role,'Роли участника и куратора несовместимы','forbidden',403)
                if not team or existing['team'] == team: return {'id':lobby['id']}
                require(existing['team'] is None,'Вы уже в команде')
            require(lobby['state'] == 'waiting','Состав игры уже зафиксирован')
            if role=='curator':
                from world import active_participant_lobby, active_cards
                require(active_participant_lobby(db,account_id) is None and active_cards(db,account_id) is None,
                        'Завершите игру участником перед назначением в жюри','match_conflict',409)
            lobby['members'][account_id] = {'role':role,'team':team}
            self._save(db,lobby)
            return {'id':lobby['id']}
        raise GameError('not_found','Код не найден',404)

    def _unit(self,lobby,account_id):
        m = lobby['members'][account_id]
        return m['team'] if lobby['mode']=='team' else account_id

    def _captain(self,lobby,account_id):
        if lobby['members'][account_id]['role'] != 'participant': return False
        if lobby['mode']=='individual': return True
        return any(t['captain_id']==account_id for t in lobby['teams'])

    def _jury(self,lobby):
        return [uid for uid,m in lobby['members'].items() if m['role']=='curator']

    def _advance(self,lobby):
        require(not lobby['awarded'],'Раунд уже рассчитан')
        question = self.questions[lobby['question_id']]
        jurors = self._jury(lobby)
        for unit in lobby['units']:
            if unit not in lobby['answers']: continue
            grades = [next(c['grade'] for c in lobby['cards'][j] if c['unit']==unit) for j in jurors]
            award = Decimal(question['value']) * sum(Decimal(g) for g in grades) / Decimal(len(jurors)) / Decimal(10)
            lobby['scores'][unit] = str(Decimal(lobby['scores'].get(unit,'0')) + award)
        lobby['awarded'] = True
        lobby['chooser'] = (lobby['chooser']+1) % len(lobby['units'])
        lobby['state'] = 'finished' if len(lobby['used']) == len(self.questions) else 'choosing'

    def mutate(self,account_id,lid,action,data):
        require(isinstance(data,dict),'Требуется объект')
        with self.transaction() as db:
            lobby = self._load(db,lid,account_id)
            role = lobby['members'][account_id]['role']
            host = lobby['host']==account_id
            if action in ('start','review','finish'):
                require(host,'Только ведущий','forbidden',403)
            if action == 'teams':
                require(role=='participant' and lobby['mode']=='team' and lobby['state']=='waiting','Команду сейчас создать нельзя')
                require(lobby['members'][account_id]['team'] is None,'Вы уже в команде')
                require(len(lobby['teams']) < lobby['max_teams'],'Все команды созданы')
                t = {'id':token(),'name':bounded(data.get('name'),40,'Команда',1),'code':token(),'captain_id':account_id}
                from world import account_clan
                t['clan_id']=account_clan(db,account_id)
                lobby['teams'].append(t)
                lobby['members'][account_id]['team']=t['id']
            elif action=='start':
                require(lobby['state']=='waiting','Игра уже началась')
                participants = [u for u,m in lobby['members'].items() if m['role']=='participant']
                require(participants and self._jury(lobby),'Нужны участник и куратор')
                from world import start_roster_available, transition_participants
                require(start_roster_available(db,lobby),'Завершите другие игры и назначения жюри участников','match_conflict',409)
                require(lobby['mode']=='individual' or all(lobby['members'][u]['team'] for u in participants),'Все участники должны выбрать команду')
                lobby['units'] = [t['id'] for t in lobby['teams']] if lobby['mode']=='team' else participants
                from world import account_clan
                lobby['unit_clans']={t['id']:t.get('clan_id') for t in lobby['teams']} if lobby['mode']=='team' else {u:account_clan(db,u) for u in participants}
                lobby['state']='choosing'
                transition_participants(db,lobby,'arena',self.world_clock())
            elif action=='question':
                require(lobby['state']=='choosing','Сейчас вопрос выбрать нельзя')
                require(role=='participant' and (host or (self._captain(lobby,account_id) and self._unit(lobby,account_id)==lobby['units'][lobby['chooser']])),'Выбор доступен ведущему или текущему капитану','forbidden',403)
                qid = data.get('question_id')
                require(isinstance(qid,str) and qid in self.questions and qid not in lobby['used'],'Вопрос недоступен')
                lobby.update(question_id=qid,state='answering',answers={},cards={},finished_reviews=[],awarded=False,buzz_owner=None)
                lobby['used'].append(qid)
                lobby['round_number']+=1
            elif action=='buzz':
                require(lobby.get('answer_policy','all')=='first' and lobby['state']=='answering','Звонок сейчас недоступен')
                require(self._captain(lobby,account_id),'Звонит капитан или индивидуальный участник','forbidden',403)
                require(lobby.get('buzz_owner') is None,'Первый участник уже определён','buzz_taken',409)
                lobby['buzz_owner']=self._unit(lobby,account_id)
            elif action=='answer':
                require(lobby['state']=='answering' and self._captain(lobby,account_id),'Ответ отправляет капитан или индивидуальный участник','forbidden',403)
                require(lobby.get('answer_policy','all')=='all' or lobby.get('buzz_owner')==self._unit(lobby,account_id),'Ответ доступен первому капитану','forbidden',403)
                lobby['answers'][self._unit(lobby,account_id)] = bounded(data.get('text'),4000,'Ответ',1)
            elif action=='review':
                require(lobby['state']=='answering','Проверка сейчас недоступна')
                lobby['state']='reviewing'
                for juror in self._jury(lobby):
                    cards = [{'token':token(),'unit':unit,'text':text,'grade':None} for unit,text in lobby['answers'].items()]
                    secrets.SystemRandom().shuffle(cards)
                    lobby['cards'][juror]=cards
                if not lobby['answers']: self._advance(lobby)
            elif action in ('grade','review/finish'):
                require(role=='curator','Только куратор','forbidden',403)
                require(lobby['state']=='reviewing' and account_id not in lobby['finished_reviews'],'Проверка уже закрыта')
                cards=lobby['cards'][account_id]
                if action=='grade':
                    score=data.get('score')
                    require(type(score) is int and 0<=score<=10,'Оценка: целое число от 0 до 10')
                    tok=data.get('token')
                    require(isinstance(tok,str) and tok.isascii() and len(tok)<=100,'Неверный токен')
                    card=next((c for c in cards if secrets.compare_digest(c['token'],tok)),None)
                    require(card is not None,'Ответ недоступен','forbidden',403)
                    card['grade']=score
                else:
                    require(all(c['grade'] is not None for c in cards),'Оцените каждый ответ')
                    lobby['finished_reviews'].append(account_id)
                    if len(lobby['finished_reviews'])==len(self._jury(lobby)): self._advance(lobby)
            elif action=='finish':
                require(lobby['state']=='choosing','Завершите текущий раунд')
                lobby['state']='finished'
            else: raise GameError('not_found','Действие не найдено',404)
            if lobby['state']=='finished':
                from world import transition_participants
                self._record_clan_results(db,lobby)
                transition_participants(db,lobby,'city',self.world_clock())
            self._save(db,lobby)
            return self._snapshot(db,lobby,account_id)

    def _record_clan_results(self,db,lobby):
        # Freeze affiliations at start; group multiple represented teams once per clan.
        points={}
        maximum=max((Decimal(lobby['scores'].get(u,'0')) for u in lobby['units']),default=Decimal(0))
        winners=set()
        for unit,cid in lobby.get('unit_clans',{}).items():
            if cid is None: continue
            score=Decimal(lobby['scores'].get(unit,'0'))
            points[cid]=points.get(cid,Decimal(0))+score
            if maximum>0 and score==maximum: winners.add(cid)
        for cid,score in points.items():
            db.execute('INSERT OR IGNORE INTO clan_results VALUES (?,?,?,?)',(lobby['id'],cid,str(score),int(cid in winners)))

    def snapshot(self,account_id,lid):
        with self.transaction() as db:
            return self._snapshot(db,self._load(db,lid,account_id),account_id)

    def _question(self,lobby,blind=False):
        if not lobby['question_id']: return None
        q=self.questions[lobby['question_id']]
        keys=('title','topic','value','prompt','evaluation_focus') if blind else ('id','title','topic','value','prompt','evaluation_focus')
        result={k:q[k] for k in keys}
        context=lobby['context']
        prefix='\n'.join(f'{label}: {context[key]}' for key,label in [('theme','Тема'),('audience','Аудитория'),('goal','Цель'),('constraints','Условия')])
        result['prompt']=prefix+'\n\n'+q['prompt']+'\nЗадание выполняется самостоятельно: сформулируйте необходимую исходную идею в этом ответе.'
        return result

    def _snapshot(self,db,lobby,account_id):
        m=lobby['members'][account_id]
        base={k:lobby[k] for k in ('id','title','mode','state','context')}
        base['role']=m['role']
        base['jury_count']=len(self._jury(lobby))
        if m['role']=='curator':
            cards=lobby['cards'].get(account_id,[])
            return base | {'question':self._question(lobby,True),
                'cards':[{'token':c['token'],'text':c['text'],'my_grade':c['grade']} for c in cards],
                'review_finished':account_id in lobby['finished_reviews'], 'graded_count':sum(c['grade'] is not None for c in cards),
                'total_cards':len(cards)}
        from world import jury_restricted
        require(not jury_restricted(db,account_id),'Состав участников недоступен до завершения всех игр жюри','jury_restricted',403)
        host=lobby['host']==account_id
        unit=self._unit(lobby,account_id)
        profiles={u:self._profile(db,u) for u in lobby['members'] if lobby['members'][u]['role']=='participant'}
        teams=[]
        for t in lobby['teams']:
            item={k:t[k] for k in ('id','name','captain_id')}
            item['members']=[profiles[u] for u in profiles if lobby['members'][u]['team']==t['id']]
            item['score']=float(Decimal(lobby['scores'].get(t['id'],'0')).quantize(Decimal('0.1')))
            if t['captain_id']==account_id: item['code']=t['code']
            teams.append(item)
        players=[p | {'score':float(Decimal(lobby['scores'].get(u,'0')).quantize(Decimal('0.1')))} for u,p in profiles.items()]
        chooser=lobby['units'][lobby['chooser']] if lobby['units'] else None
        chooser_name=next((t['name'] for t in lobby['teams'] if t['id']==chooser),'') if lobby['mode']=='team' else profiles.get(chooser,{}).get('name','')
        from world import start_roster_available
        policy=lobby.get('answer_policy','all')
        buzz=lobby.get('buzz_owner')
        buzz_name=next((t['name'] for t in lobby['teams'] if t['id']==buzz),'') if lobby['mode']=='team' else profiles.get(buzz,{}).get('name','')
        base.update(answer_policy=policy,can_buzz=policy=='first' and lobby['state']=='answering' and self._captain(lobby,account_id) and buzz is None,
            buzzed_by_me=buzz is not None and buzz==unit,buzz_owner_name=buzz_name,is_host=host,max_teams=lobby['max_teams'],meeting_url=lobby['meeting_url'],profile=profiles[account_id],
            can_start=host and lobby['state']=='waiting' and bool(self._jury(lobby)) and start_roster_available(db,lobby) and
                (lobby['mode']=='individual' or all(v['team'] for v in lobby['members'].values() if v['role']=='participant')),
            can_choose=lobby['state']=='choosing' and (host or (self._captain(lobby,account_id) and unit==chooser)),
            can_answer=lobby['state']=='answering' and self._captain(lobby,account_id) and (policy=='all' or buzz==unit),
            can_review=host and lobby['state']=='answering',can_finish=host and lobby['state']=='choosing',
            chooser_name=chooser_name,teams=teams,players=players,my_team_id=m['team'],question=self._question(lobby),
            board=[{'id':t['id'],'title':t['title'],'questions':[{'id':q['id'],'value':q['value'],'used':q['id'] in lobby['used']} for q in t['questions']]} for t in self.topics],
            my_answer=lobby['answers'].get(unit),answers_received=len(lobby['answers']),
            total_units=len(lobby['units']) if lobby['units'] else (len(teams) if lobby['mode']=='team' else len(players)),round_number=lobby['round_number'])
        if host: base.update(player_code=lobby['player_code'],jury_code=lobby['jury_code'])
        return base
