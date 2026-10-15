#!/usr/bin/env python3
"""Smoke-test this isolated project with a temporary, empty SQLite database."""
import http.client
import json
import sqlite3
import tempfile
import threading
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from server import make_server,STATIC


def check():
    with tempfile.TemporaryDirectory(prefix='bziker-handoff-check-') as temporary:
        database=Path(temporary)/'empty-game.db'
        server=make_server('127.0.0.1',0,database,auth_mode='demo',web_root=ROOT)
        worker=threading.Thread(target=server.serve_forever,daemon=True)
        worker.start()
        def request(path,headers=None,body=None):
            connection=http.client.HTTPConnection(*server.server_address,timeout=5)
            try:
                request_headers=dict(headers or {})
                if body is not None:request_headers['Content-Type']='application/json'
                connection.request('POST' if body is not None else 'GET',path,
                                   json.dumps(body) if body is not None else None,request_headers)
                response=connection.getresponse()
                return response.status,dict(response.getheaders()),response.read()
            finally:connection.close()
        try:
            for path in sorted(STATIC):
                status,headers,data=request(path)
                assert status==200,(path,status)
                assert data,(path,'empty static file')
            for path in ('/.env','/data/game.db','/server.py','/tests/test_server.py'):
                assert request(path)[0]==404,path
            status,headers,data=request('/api/bootstrap')
            assert status==200
            session=json.loads(data)
            assert session['auth_mode']=='demo' and session['authenticated'] is True
            assert 'HttpOnly' in headers['Set-Cookie']
            auth_headers={'Cookie':headers['Set-Cookie'].split(';')[0],'X-CSRF-Token':session['csrf_token']}
            status,headers,data=request('/api/account/register',auth_headers,
                                        {'login':'handoff_fixture','password':'Handoff-fixture-25!'})
            assert status==200
            session=json.loads(data)
            auth_headers={'Cookie':headers['Set-Cookie'].split(';')[0],'X-CSRF-Token':session['csrf_token']}
            assert request('/api/profile',auth_headers,{'name':'HandoffSmoke','avatar':{}})[0]==200
            assert request('/api/world',auth_headers)[0]==200
            with sqlite3.connect(database) as db:
                assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
            print(json.dumps({'result':'passed','static_routes':len(STATIC),'temporary_database':True,
                              'external_requests':False,'live_database_touched':False}))
        finally:
            server.shutdown();server.server_close();worker.join(timeout=5)


if __name__=='__main__':check()
