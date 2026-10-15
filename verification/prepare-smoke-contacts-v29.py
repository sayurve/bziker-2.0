import json, collections
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
root=Path('.');mat=root/'materials/Bziker'; out=root/'art/drafts/action-identity-v29/daily';out.mkdir(parents=True,exist_ok=True)
cat=json.loads((mat/'06_Повседневные_действия/каталог.json').read_text()); inv=json.loads((root/'verification/world-action-inventory-v29.json').read_text());ids=collections.defaultdict(list)
for f in inv['frames']:
 if '-smoke-' in f['id']: ids[f['id']].append(f)
allgroups=[]
for e in cat['entries']:
 if e['id'] not in ids:continue
 m=json.loads((mat/e['metadata']).read_text()); first={}
 for i,n in enumerate(e['timeline']):first.setdefault(n,(i,m['sprite_states'][i]))
 groups=collections.defaultdict(list)
 for f in ids[e['id']]:
  i,s=first[f['frameIndex']];groups[(s['pose'],s['phase'])].append((f,s,i))
 canvas=Image.new('RGB',(848,5*288+40),'#202a36');draw=ImageDraw.Draw(canvas);draw.text((8,8),e['id'],fill='white')
 for n,((pose,phase),items) in enumerate(groups.items()):
  f,s,i=items[0];r=f['rect']['detail'];im=Image.open(root/'game'/r['path']).convert('RGBA').crop((r['x'],r['y'],r['x']+96,r['y']+128));im.save(out/f"{e['id']}-{pose}-{phase}.png")
  x=n%4*212+10;y=n//4*288+40;canvas.paste(im.resize((192,256),Image.Resampling.NEAREST),(x,y),im.resize((192,256),Image.Resampling.NEAREST));draw.text((x,y+258),f'{pose}/{phase} frame {f["frameIndex"]}',fill='white');draw.text((x,y+271),f'{len(items)} variants; head {f["head"]}',fill='#bbc5ce')
  allgroups.append(dict(sequenceId=e['id'],pose=pose,phase=phase,frames=[f['frameIndex']for f,_,_ in items],representative=f,metadataState=s,sourceTimelineIndex=i))
 canvas.save(out/f"{e['id']}-families.png")
(out/'family-inventory.json').write_text(json.dumps(allgroups,ensure_ascii=False,indent=2));print(len(allgroups),'groups',sum(len(g['frames'])for g in allgroups),'frames')
