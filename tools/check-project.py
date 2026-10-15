#!/usr/bin/env python3
"""Run reproducible project checks. Art readiness is reported separately."""
import argparse
from datetime import datetime,timezone
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
def find_node():
 explicit=os.environ.get('BZIKER_NODE')
 if explicit:return explicit
 bundled=Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node'
 return str(bundled) if bundled.is_file() else shutil.which('node')
def check_skills():
 result=[]
 for name in ('bziker-build-game','bziker-character-pipeline','bziker-game-qa'):
  folder=ROOT/'.agents/skills'/name;text=(folder/'SKILL.md').read_text()
  front=text.split('---',2)[1] if text.startswith('---\n') else ''
  if f'name: {name}\n' not in front or 'description:' not in front or '[TODO' in text:raise ValueError('Invalid skill '+name)
  ui=(folder/'agents/openai.yaml').read_text()
  if '$'+name not in ui:raise ValueError('Missing explicit activation prompt '+name)
  result.append(name)
 return result
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--quick',action='store_true');p.add_argument('--full',action='store_true');p.add_argument('--materials',action='store_true');args=p.parse_args()
 node=find_node()
 if not node:p.error('Node >=22 required for checks; install game/package.json dependencies with npm ci')
 report={'checkedAt':datetime.now(timezone.utc).isoformat(),'steps':[],'passed':True,'scope':'technical validation; not an artistic approval'}
 (ROOT/'verification').mkdir(exist_ok=True)
 try:report['skills']=check_skills()
 except (ValueError,OSError) as e:report['passed']=False;report['skillError']=str(e)
 commands=[('tools-tests',[sys.executable,'-m','unittest','discover','-s','tests','-v'],ROOT)]
 if args.full:
  commands += [('game-python',[sys.executable,'-m','unittest','discover','-s','tests'],ROOT/'game'),('game-node',[node,'scripts/test-node.mjs'],ROOT/'game')]
 else:
  tests=sorted((ROOT/'game/tests').glob('character-system*.test.mjs'))
  commands += [('character-system',[node,'--test',*[str(v) for v in tests]],ROOT/'game')]
 if args.materials:commands.append(('materials',[sys.executable,'tools/verify-materials.py','--dest',str(ROOT)],ROOT))
 for name,command,cwd in commands:
  log=ROOT/'verification'/f'{name}-latest.log'
  print(f'Проверка {name}…',flush=True)
  with log.open('w') as output:r=subprocess.run(command,cwd=cwd,stdout=output,stderr=subprocess.STDOUT)
  report['steps'].append({'name':name,'exitCode':r.returncode,'log':str(log.relative_to(ROOT))});report['passed'] &= r.returncode==0
  print(f'{name}: '+('PASS' if r.returncode==0 else 'FAIL'),flush=True)
 approved=list((ROOT/'art/approved').rglob('*.json'));drafts=list((ROOT/'art/drafts').rglob('*.png'))
 report['art']={'approvedDefinitionFiles':len(approved),'draftPngFiles':len(drafts),'ready':False,'note':'Artwork needs editable layered masters and visual approval; copied legacy-composite art is compatibility only.'}
 path=ROOT/'verification'/('project-full.json' if args.full else 'project-quick.json');path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
 print(path);return 0 if report['passed'] else 1
if __name__=='__main__':sys.exit(main())
