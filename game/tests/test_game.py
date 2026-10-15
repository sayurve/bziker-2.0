import json
import tempfile
import unittest
from pathlib import Path

try:
    from game import GameService, GameError
except ImportError:
    GameService = None
    GameError = Exception


class GameTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(GameService, 'Game service must be implemented')
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db = Path(self.tmp.name) / 'game.db'
        self.g = GameService(self.db)
        self.users = [self.g.create_account() for _ in range(6)]
        for i, user in enumerate(self.users):
            self.g.profile(user, {'name': f'Игрок {i}', 'avatar': {}})
        self.host, self.mate, self.other, self.jury, self.jury2, self.outsider = self.users

    def lobby(self, mode='team'):
        self.lid = self.g.create_lobby(self.host, {'title': 'Игра', 'mode': mode,
            'context': {'theme':'Книга', 'audience':'Коллеги', 'goal':'Идеи', 'constraints':'Без бюджета'}})['id']
        s = self.g.snapshot(self.host, self.lid)
        self.g.join(self.other, s['player_code'])
        self.g.join(self.jury, s['jury_code'])
        self.g.join(self.jury2, s['jury_code'])
        if mode == 'team':
            s = self.g.mutate(self.host, self.lid, 'teams', {'name':'Первая'})
            self.g.join(self.mate, s['teams'][0]['code'])
            self.g.mutate(self.other, self.lid, 'teams', {'name':'Вторая'})
        self.g.mutate(self.host, self.lid, 'start', {})
        return self.g.mutate(self.host, self.lid, 'question', {'question_id':'idea_100'})

    def review(self, second=True):
        self.lobby()
        self.g.mutate(self.host, self.lid, 'answer', {'text':'Первый ответ'})
        if second:
            self.g.mutate(self.other, self.lid, 'answer', {'text':'Второй ответ'})
        return self.g.mutate(self.host, self.lid, 'review', {})

    def denied(self, user, action, data=None):
        with self.assertRaises(GameError):
            self.g.mutate(user, self.lid, action, data or {})

    def test_team_permissions_freeze_and_private_answers(self):
        self.lobby()
        self.denied(self.mate, 'answer', {'text':'Нет'})
        self.denied(self.other, 'review')
        self.denied(self.jury, 'question', {'question_id':'idea_200'})
        self.denied(self.outsider, 'answer', {'text':'Нет'})
        self.g.mutate(self.host, self.lid, 'answer', {'text':'Секрет'})
        self.assertIsNone(self.g.snapshot(self.other, self.lid)['my_answer'])
        self.assertEqual(self.g.snapshot(self.mate, self.lid)['my_answer'], 'Секрет')
        with self.assertRaises(GameError):
            self.g.join(self.outsider, self.g.snapshot(self.host, self.lid)['player_code'])
        self.denied(self.other, 'teams', {'name':'Поздно'})

    def test_blind_exact_keys_tokens_stability_and_cross_curator_denial(self):
        self.review()
        a = self.g.snapshot(self.jury, self.lid)
        b = self.g.snapshot(self.jury2, self.lid)
        self.assertEqual(set(a), {'id','title','mode','state','role','question','cards','review_finished',
            'graded_count','total_cards','jury_count','context'})
        self.assertEqual(set(a['question']), {'title','topic','value','prompt','evaluation_focus'})
        self.assertEqual(set(a['cards'][0]), {'token','text','my_grade'})
        self.assertEqual(a, self.g.snapshot(self.jury, self.lid))
        self.assertTrue(set(c['token'] for c in a['cards']).isdisjoint(c['token'] for c in b['cards']))
        self.denied(self.jury2, 'grade', {'token':a['cards'][0]['token'],'score':5})
        self.denied(self.jury, 'grade', {'token':'bad','score':5})
        self.denied(self.jury, 'review/finish')

    def test_grade_replacement_lock_decimal_award_once_and_persistence(self):
        self.review()
        for curator, grade in [(self.jury, 7), (self.jury2, 8)]:
            cards = self.g.snapshot(curator, self.lid)['cards']
            for c in cards:
                self.g.mutate(curator, self.lid, 'grade', {'token':c['token'], 'score':1})
                self.g.mutate(curator, self.lid, 'grade', {'token':c['token'], 'score':grade})
            self.g.mutate(curator, self.lid, 'review/finish', {})
            self.denied(curator, 'grade', {'token':cards[0]['token'], 'score':10})
        s = self.g.snapshot(self.host, self.lid)
        self.assertEqual([t['score'] for t in s['teams']], [75,75])
        self.assertEqual(s['state'], 'choosing')
        self.assertTrue(self.g.snapshot(self.other, self.lid)['can_choose'])
        self.denied(self.jury2, 'review/finish')
        again = GameService(self.db)
        self.assertEqual(again.snapshot(self.host, self.lid), s)

    def test_missing_and_all_missing_answers_score_zero(self):
        self.review(second=False)
        for curator in [self.jury,self.jury2]:
            card = self.g.snapshot(curator, self.lid)['cards'][0]
            self.g.mutate(curator,self.lid,'grade',{'token':card['token'],'score':10})
            self.g.mutate(curator,self.lid,'review/finish',{})
        self.assertEqual([t['score'] for t in self.g.snapshot(self.host,self.lid)['teams']],[100,0])
        self.g.mutate(self.other,self.lid,'question',{'question_id':'idea_200'})
        self.g.mutate(self.host,self.lid,'review',{})
        self.assertEqual(self.g.snapshot(self.host,self.lid)['state'],'choosing')
        self.g.mutate(self.host,self.lid,'finish',{})
        self.assertEqual(self.g.snapshot(self.host,self.lid)['state'],'finished')

    def test_individual_mode_duplicate_join_and_role_conflict(self):
        self.lobby('individual')
        self.denied(self.host,'teams',{'name':'Нет'})
        self.g.mutate(self.other,self.lid,'answer',{'text':'Личный ответ'})
        self.assertEqual(self.g.snapshot(self.other,self.lid)['my_answer'],'Личный ответ')
        # Existing membership is idempotent even after the roster freezes.
        code = self.g.snapshot(self.host,self.lid)['player_code']
        self.assertEqual(self.g.join(self.other,code), {'id':self.lid})
        with self.assertRaises(GameError):
            self.g.join(self.host,self.g.snapshot(self.host,self.lid)['jury_code'])

    def test_validation_and_start_preconditions(self):
        for data in [{'name':''},{'name':'x','avatar':{'skin':True}}, {'name':'x','avatar':{'skin':9}},
                     {'name':'x','avatar':[]}, {'name':'\u200b'}]:
            with self.assertRaises(GameError): self.g.profile(self.host,data)
        p = self.g.profile(self.host,{'name':'Игрок 0'})
        self.assertEqual(len(p['avatar']),12)
        for data in [{'mode':'bad'}, {'mode':'team','max_teams':True}, {'mode':'team','meeting_url':'http://bad'}]:
            with self.assertRaises(GameError): self.g.create_lobby(self.host,dict(title='Игра',context={},**data))
        self.lid = self.g.create_lobby(self.host,{'title':'Игра','mode':'team','context':{}})['id']
        self.denied(self.host,'start')
        self.g.mutate(self.host,self.lid,'teams',{'name':'Команда'})
        self.denied(self.host,'start')
        self.g.join(self.jury,self.g.snapshot(self.host,self.lid)['jury_code'])
        self.g.mutate(self.host,self.lid,'start',{})
        self.denied(self.host,'question',{'question_id':'bogus'})
        self.g.mutate(self.host,self.lid,'question',{'question_id':'idea_100'})
        for value in ['',123,'x'*4001]: self.denied(self.host,'answer',{'text':value})
        self.g.mutate(self.host,self.lid,'answer',{'text':'Да'})
        self.g.mutate(self.host,self.lid,'review',{})
        token=self.g.snapshot(self.jury,self.lid)['cards'][0]['token']
        for value in [True,1.5,-1,11,'5']:
            self.denied(self.jury,'grade',{'token':token,'score':value})

    def test_untrusted_unicode_tokens_raise_deliberate_errors(self):
        self.review()
        with self.assertRaises(GameError): self.g.join(self.host,'токен')
        self.denied(self.jury,'grade',{'token':'токен','score':5})

    def test_decimal_scores_keep_precision_between_rounds(self):
        # Three jurors produce thirds; three rounds must display 50.0, not 50.1.
        self.lid=self.g.create_lobby(self.host,{'title':'Дроби','mode':'individual','context':{}})['id']
        code=self.g.snapshot(self.host,self.lid)['jury_code']
        jurors=[self.jury,self.jury2,self.outsider]
        for curator in jurors: self.g.join(curator,code)
        self.g.mutate(self.host,self.lid,'start',{})
        for qid in ['idea_100','message_100','solution_100']:
            self.g.mutate(self.host,self.lid,'question',{'question_id':qid})
            self.g.mutate(self.host,self.lid,'answer',{'text':'Ответ'})
            self.g.mutate(self.host,self.lid,'review',{})
            for curator,grade in zip(jurors,[1,2,2]):
                card=self.g.snapshot(curator,self.lid)['cards'][0]
                self.g.mutate(curator,self.lid,'grade',{'token':card['token'],'score':grade})
                self.g.mutate(curator,self.lid,'review/finish',{})
        self.assertEqual(self.g.snapshot(self.host,self.lid)['players'][0]['score'],50.0)

    def test_old_round_tokens_and_jury_join_are_rejected(self):
        self.review()
        old=self.g.snapshot(self.jury,self.lid)['cards'][0]['token']
        with self.assertRaises(GameError):
            self.g.join(self.outsider,self.g.snapshot(self.host,self.lid)['jury_code'])
        for curator in [self.jury,self.jury2]:
            for card in self.g.snapshot(curator,self.lid)['cards']:
                self.g.mutate(curator,self.lid,'grade',{'token':card['token'],'score':5})
            self.g.mutate(curator,self.lid,'review/finish',{})
        self.g.mutate(self.other,self.lid,'question',{'question_id':'idea_200'})
        self.g.mutate(self.host,self.lid,'answer',{'text':'Новый ответ'})
        self.g.mutate(self.host,self.lid,'review',{})
        self.denied(self.jury,'grade',{'token':old,'score':10})
        self.assertIsNone(self.g.snapshot(self.jury,self.lid)['cards'][0]['my_grade'])

    def test_general_participant_selects_team_before_start(self):
        self.lid=self.g.create_lobby(self.host,{'title':'Состав','mode':'team','context':{}})['id']
        initial=self.g.snapshot(self.host,self.lid)
        self.g.join(self.mate,initial['player_code'])
        self.g.join(self.jury,initial['jury_code'])
        team=self.g.mutate(self.host,self.lid,'teams',{'name':'Группа'})['teams'][0]
        self.denied(self.host,'start')
        self.g.join(self.mate,team['code'])
        self.g.join(self.mate,team['code'])
        snapshot=self.g.snapshot(self.host,self.lid)
        self.assertEqual(len(snapshot['teams'][0]['members']),2)
        self.assertTrue(snapshot['can_start'])
        self.g.mutate(self.host,self.lid,'start',{})

    def test_final_question_and_exhausted_board_finish_game(self):
        self.lobby('individual')
        self.g.mutate(self.host,self.lid,'review',{})
        questions=[q['id'] for t in self.g.snapshot(self.host,self.lid)['board'] for q in t['questions'] if not q['used']]
        self.assertIn('creative_project_final',questions)
        for qid in questions:
            self.g.mutate(self.host,self.lid,'question',{'question_id':qid})
            self.g.mutate(self.host,self.lid,'review',{})
        self.assertEqual(self.g.snapshot(self.host,self.lid)['state'],'finished')
        self.denied(self.host,'question',{'question_id':'idea_100'})

if __name__ == '__main__': unittest.main()
