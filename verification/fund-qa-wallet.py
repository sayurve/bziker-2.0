#!/usr/bin/env python3
"""One-shot local QA funding fixture. No server/API, schema or inventory edits."""
import argparse,json,re,sqlite3,stat,sys,tempfile
from pathlib import Path
from urllib.parse import quote
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'game'))
from economy import change_balance


def fund(database,account_id,expected_name,coins,fixture_key):
    if type(coins) is not int or not 1<=coins<=10**9:
        raise ValueError('coins must be a positive integer at most 1000000000')
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,64}',fixture_key):
        raise ValueError('fixture-key must be a unique short test label')
    if not isinstance(account_id,str) or not 1<=len(account_id)<=128 or any(ord(c)<32 for c in account_id):
        raise ValueError('An explicit QA account ID is required')
    if not isinstance(expected_name,str) or not expected_name:
        raise ValueError('An exact QA profile name is required')
    given=Path(database)
    if not re.fullmatch(r'bziker-[A-Za-z0-9_-]+-qa\.sqlite3',given.name):
        raise ValueError('Only a named bziker-...-qa.sqlite3 fixture is accepted')
    if given.is_symlink():raise ValueError('Symlink databases are not accepted')
    actual=given.resolve(strict=True)
    temporary_roots={Path('/tmp').resolve(),Path(tempfile.gettempdir()).resolve()}
    if not any(actual.is_relative_to(p) for p in temporary_roots):
        raise ValueError('QA database must be inside a system temporary directory')
    # Reject a link to a live inode, even if its directory/name looks temporary.
    info=actual.stat()
    if not stat.S_ISREG(info.st_mode) or info.st_nlink!=1:
        raise ValueError('A standalone regular QA database is required')
    reference='testfixtures:qa-fund:'+fixture_key
    db=sqlite3.connect('file:'+quote(str(actual),safe='/')+'?mode=rw',uri=True,timeout=10,isolation_level=None)
    db.row_factory=sqlite3.Row
    try:
        db.execute('BEGIN IMMEDIATE')
        for table,required in [('accounts',{'id','profile'}),('wallets',{'account_id','balance'}),('economy_ledger',{'account_id','reference','amount'})]:
            columns={r['name'] for r in db.execute('PRAGMA table_info('+table+')')}
            if not required<=columns:raise ValueError('Existing game economy schema required: '+table)
        account=db.execute('SELECT profile FROM accounts WHERE id=?',(account_id,)).fetchone()
        if account is None:raise ValueError('QA account does not exist')
        profile=json.loads(account['profile'] or '{}')
        if profile.get('name')!=expected_name:raise ValueError('QA profile name does not match expected-name')
        wallet=db.execute('SELECT balance FROM wallets WHERE account_id=?',(account_id,)).fetchone()
        if wallet is None:raise ValueError('QA wallet must already be initialized by the game')
        old=db.execute('SELECT amount FROM economy_ledger WHERE account_id=? AND reference=?',(account_id,reference)).fetchone()
        balance=change_balance(db,account_id,coins,reference)
        db.execute('COMMIT')
        return dict(database=str(actual),account_id=account_id,profile_name=expected_name,
                    reference=reference,coins=coins,applied=old is None,before=wallet['balance'],after=balance,
                    inventory_changed=False,server_endpoint_added=False)
    except Exception:
        if db.in_transaction:db.execute('ROLLBACK')
        raise
    finally:db.close()


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--database',required=True,type=Path)
    p.add_argument('--account-id',required=True)
    p.add_argument('--expected-name',required=True)
    p.add_argument('--coins',required=True,type=int)
    p.add_argument('--fixture-key',required=True)
    args=p.parse_args()
    try:result=fund(args.database,args.account_id,args.expected_name,args.coins,args.fixture_key)
    except Exception as error:p.exit(1,str(error)+'\n')
    print(json.dumps(result,ensure_ascii=False))


if __name__=='__main__':main()
