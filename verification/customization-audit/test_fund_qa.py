import importlib.util,json,os,sqlite3,tempfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('qa_funding',Path(__file__).resolve().parents[1]/'fund-qa-wallet.py');fixture=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixture)
class FundingTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.path=Path(self.temp.name)/'bziker-test-qa.sqlite3'
  with sqlite3.connect(self.path) as db:
   db.executescript('CREATE TABLE accounts(id TEXT PRIMARY KEY,profile TEXT);CREATE TABLE wallets(account_id TEXT PRIMARY KEY,balance INTEGER CHECK(balance>=0));CREATE TABLE economy_ledger(account_id TEXT,reference TEXT,amount INTEGER,PRIMARY KEY(account_id,reference));CREATE TABLE inventory(account_id TEXT,item_id TEXT,quantity INTEGER);')
   db.execute('INSERT INTO accounts VALUES (?,?)',('fixture-user',json.dumps({'name':'Fixture QA'})));db.execute('INSERT INTO wallets VALUES (?,?)',('fixture-user',0));db.execute('INSERT INTO inventory VALUES (?,?,?)',('fixture-user','coffee',1))
 def call(self,**overrides):
  args=dict(database=self.path,account_id='fixture-user',expected_name='Fixture QA',coins=1000,fixture_key='paid-outfits-v27');args.update(overrides);return fixture.fund(**args)
 def test_idempotent_balance_and_no_inventory_grant(self):
  a=self.call();b=self.call();self.assertTrue(a['applied']);self.assertFalse(b['applied']);self.assertEqual((a['after'],b['after']),(1000,1000))
  with sqlite3.connect(self.path) as db:self.assertEqual(db.execute('SELECT * FROM inventory').fetchall(),[('fixture-user','coffee',1)]);self.assertEqual(db.execute('SELECT COUNT(*) FROM economy_ledger').fetchone()[0],1)
 def test_conflicting_key_rolls_back(self):
  self.call()
  with self.assertRaises(Exception):self.call(coins=1001)
  with sqlite3.connect(self.path) as db:self.assertEqual(db.execute('SELECT balance FROM wallets').fetchone()[0],1000)
 def test_wrong_profile_rejected_without_funding(self):
  with self.assertRaises(ValueError):self.call(expected_name='Other')
 def test_non_qa_name_and_missing_database_rejected(self):
  with self.assertRaises(ValueError):self.call(database=Path(self.temp.name)/'production.sqlite3')
  missing=Path(self.temp.name)/'bziker-missing-qa.sqlite3'
  with self.assertRaises(FileNotFoundError):self.call(database=missing)
  self.assertFalse(missing.exists())
 def test_symlink_and_hardlink_rejected(self):
  link=Path(self.temp.name)/'bziker-symlink-qa.sqlite3';link.symlink_to(self.path)
  with self.assertRaises(ValueError):self.call(database=link)
  hard=Path(self.temp.name)/'bziker-hardlink-qa.sqlite3';os.link(self.path,hard)
  with self.assertRaises(ValueError):self.call(database=hard)
 def test_invalid_amounts_rejected(self):
  for amount in [0,-1,10**9+1,True]:
   with self.subTest(amount=amount),self.assertRaises(ValueError):self.call(coins=amount)
 def test_production_path_never_opened(self):
  with self.assertRaises(ValueError):self.call(database=fixture.ROOT/'data/bziker.db')
if __name__=='__main__':unittest.main()
