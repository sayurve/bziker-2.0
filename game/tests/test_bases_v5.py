import tempfile
import unittest
from pathlib import Path
from game import GameService, GameError
from world import WorldService, FURNITURE_TYPES
from clan_fixtures import legacy_home, approach_base_seat


class BasesV5Tests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.g=GameService(Path(self.tmp.name)/'bases.db');self.now=1000
        self.w=WorldService(self.g,clock=lambda:self.now)
        self.a,self.b,self.c=[self.g.create_account() for _ in range(3)]
        for uid,name in zip((self.a,self.b,self.c),('BaseAlpha','BaseBeta','BaseGamma')):self.g.profile(uid,{'name':name})
        self.cid=self.w.create_clan(self.a,{'name':'Host Clan','flag':'!','color':'#111111'})['id']
        legacy_home(self.g,self.cid)

    def deny(self,fn,*args,code):
        with self.assertRaises(GameError) as e:fn(*args)
        self.assertEqual(e.exception.code,code)

    def test_addressed_guest_invitation_acceptance_restores_base_without_editor_rights(self):
        self.deny(self.w.move,self.b,{'scene':'base','clan_id':self.cid,'x':600,'y':670},code='forbidden')
        invitation=self.w.invite_base(self.a,self.cid,{'to_id':self.b})['invitation']
        self.deny(self.w.respond_base_invitation,self.c,invitation['id'],'accept',code='forbidden')
        self.w.respond_base_invitation(self.b,invitation['id'],'accept')
        self.w.respond_base_invitation(self.b,invitation['id'],'accept')
        guest=self.w.move(self.b,{'scene':'base','clan_id':self.cid,'x':600,'y':670})
        self.assertEqual(guest['active_base']['id'],self.cid)
        self.assertTrue(guest['active_base']['is_guest']);self.assertFalse(guest['active_base']['is_leader'])
        self.assertIsNone(guest['my_clan'])
        self.deny(self.w.mutate_clan,self.b,self.cid,'base',{'items':[]},code='forbidden')
        again=WorldService(GameService(self.g.db_path),clock=lambda:self.now+46)
        self.assertEqual(again.snapshot(self.b)['scene_id'],self.cid)
        self.assertTrue(again.snapshot(self.b)['active_base']['is_guest'])
        self.w.mutate_clan(self.a,self.cid,'leave',{})
        self.assertEqual(again.snapshot(self.b)['scene'],'city')

    def test_shared_furniture_footprint_rotation_collision_and_two_persistent_seats(self):
        self.assertTrue({'bed','shelf','lamp','rug','tv','cabinet','armchair'}<=set(FURNITURE_TYPES))
        sofa={'id':'real-sofa','type':'sofa','x':2,'y':3,'rotation':0}
        base=self.w.mutate_clan(self.a,self.cid,'base',{'items':[sofa]})['base']
        self.assertEqual(base['items'][0]['rotation'],0)
        self.w.move(self.a,{'scene':'base','x':600,'y':670})
        self.deny(self.w.move,self.a,{'scene':'base','x':0,'y':0},code='invalid_action')
        self.deny(self.w.move,self.a,{'scene':'base','x':330,'y':440},code='invalid_action')
        seats=self.w.snapshot(self.a)['active_base']['base']['seats']
        self.assertEqual(len(seats),2);self.assertNotEqual(seats[0]['seat'],seats[1]['seat'])
        approach_base_seat(self.w,self.a,self.cid,seats[0]['seat'])
        seated=self.w.activity(self.a,{'action':'sit','bench_id':seats[0]['id']})
        self.assertEqual(seated['bench_id'],seats[0]['id'])
        self.assertEqual(self.w.activity(self.a,{'action':'phone','open':True})['pose'],'sit')
        self.deny(self.w.mutate_clan,self.a,self.cid,'base',{'items':[dict(sofa,x=11)]},code='invalid_action')
        self.deny(self.w.mutate_clan,self.a,self.cid,'base',{'items':[sofa,{'id':'overlap','type':'chair','x':3,'y':3,'rotation':0}]},code='invalid_action')
        rotated=self.w.mutate_clan(self.a,self.cid,'base',{'items':[dict(sofa,x=11,rotation=90)]})['base']['items'][0]
        self.assertEqual(rotated['rotation'],90)

    def test_legacy_one_cell_objects_are_not_silently_resized(self):
        old={'id':'old','type':'sofa','x':11,'y':7}
        base=self.w.mutate_clan(self.a,self.cid,'base',{'items':[old]})['base']
        self.assertNotIn('rotation',base['items'][0])
        again=WorldService(GameService(self.g.db_path),clock=lambda:self.now)
        self.assertNotIn('rotation',again.clan_snapshot(self.a,self.cid)['base']['items'][0])

    def test_hidden_juror_has_no_base_invitation_or_roster_identity(self):
        invitation=self.w.invite_base(self.a,self.cid,{'to_id':self.b})['invitation']
        self.w.respond_base_invitation(self.b,invitation['id'],'accept')
        self.w.mutate_clan(self.c,self.cid,'apply',{});self.w.mutate_clan(self.a,self.cid,'accept',{'account_id':self.c})
        duty=self.g.create_lobby(self.b,{'title':'Jury duty','mode':'individual'})
        self.g.join(self.a,self.g.snapshot(self.b,duty['id'])['jury_code'])
        guest=self.w.move(self.b,{'scene':'base','clan_id':self.cid,'x':600,'y':670})
        self.assertIsNone(guest['active_base']['leader_id'])
        member=self.w.clan_snapshot(self.c,self.cid)
        self.assertNotIn(self.a,{profile['id'] for profile in member['members']})
        self.assertIsNone(member['leader_id'])

    def test_moving_or_removing_furniture_releases_claim_without_teleport_or_closing_phone(self):
        sofa={'id':'sofa','type':'sofa','x':2,'y':3,'rotation':0}
        self.w.mutate_clan(self.a,self.cid,'base',{'items':[sofa]})
        self.w.move(self.a,{'scene':'base','x':600,'y':670})
        seat=self.w.snapshot(self.a)['active_base']['base']['seats'][0]
        approach_base_seat(self.w,self.a,self.cid,seat['seat'])
        self.w.activity(self.a,{'action':'sit','bench_id':seat['id']})
        self.w.activity(self.a,{'action':'phone','open':True})
        self.w.mutate_clan(self.a,self.cid,'base',{'items':[]})
        restored=self.w.snapshot(self.a)
        self.assertIsNone(restored['bench_id']);self.assertEqual(restored['pose'],'idle')
        self.assertEqual(restored['position'],seat['seat']);self.assertTrue(restored['phone_open'])


if __name__=='__main__':unittest.main()
