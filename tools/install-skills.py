#!/usr/bin/env python3
"""Register this project's scoped skills; never overwrite another skill."""
import argparse
import json
import os
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
NAMES=('bziker-build-game','bziker-character-pipeline','bziker-game-qa')
def install(codex_home):
 directory=Path(codex_home).expanduser()/'skills';directory.mkdir(parents=True,exist_ok=True);result=[]
 for name in NAMES:
  source=ROOT/'.agents/skills'/name;target=directory/name
  if not (source/'SKILL.md').is_file():raise ValueError(f'Missing skill: {source}')
  if target.exists() or target.is_symlink():
   if not target.is_symlink() or target.resolve()!=source.resolve():raise ValueError(f'Existing unrelated skill retained: {target}')
  else:target.symlink_to(source,target_is_directory=True)
  result.append({'name':name,'path':str(target),'source':str(source)})
 return result
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--codex-home',type=Path,default=Path(os.environ.get('CODEX_HOME',Path.home()/'.codex')));args=p.parse_args()
 print(json.dumps(install(args.codex_home),ensure_ascii=False,indent=2))
if __name__=='__main__':main()
