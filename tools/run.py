#!/usr/bin/env python3
"""Start this project's game without depending on the original folder."""
import argparse
import os
from pathlib import Path
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
def main():
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument('--port',type=int,default=8796)
 p.add_argument('--demo',action='store_true',help='Local account-login mode; binds 127.0.0.1')
 p.add_argument('--db',type=Path,default=ROOT/'data/bziker.db')
 args=p.parse_args()
 if not 1<=args.port<=65535:p.error('port must be between 1 and 65535')
 db=args.db.expanduser().resolve();db.parent.mkdir(parents=True,exist_ok=True)
 env=os.environ.copy();env['HOST']='127.0.0.1'
 if args.demo:env['AUTH_MODE']='demo'
 elif env.get('AUTH_MODE')!='telegram':p.error('Use --demo for local work, or configure AUTH_MODE=telegram; see game/DEPLOYMENT.md')
 print(f'Игра: http://127.0.0.1:{args.port}/\nСтенд персонажа: http://127.0.0.1:{args.port}/character-lab',flush=True)
 return subprocess.call([sys.executable,'server.py','--port',str(args.port),'--db',str(db)],cwd=ROOT/'game',env=env)
if __name__=='__main__':sys.exit(main())
