"""Inspect actual saved-editor + held-input UI cases; no synthetic actor renders."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import hashlib,json
BASE=Path(__file__).resolve().parent
rows=json.loads((BASE/'completed.json').read_text())
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',12)
for gender in [0,1]:
 cases=[r for r in rows if r['gender']==gender]
 for start in range(0,len(cases),3):
  subset=cases[start:start+3];sheet=Image.new('RGB',(1120,len(subset)*216+32),'#26313a');draw=ImageDraw.Draw(sheet);draw.font=font
  draw.text((8,8),f'ACTUAL GAME / g{gender} / white hair, dark skin, lime shirt / held-input captures 1 and 2',fill='white');receipts=[]
  for yrow,r in enumerate(subset):
   for dcol,direction in enumerate(['down','right','up','left']):
    for phase in [1,2]:
     retake=f'g{gender}-white-h{r["hairStyle"]:02d}-{direction}-retake-{phase}.jpg'
     name=retake if (BASE/retake).exists() else f'g{gender}-white-h{r["hairStyle"]:02d}-{direction}-{phase}.jpg'
     path=BASE/name;im=Image.open(path).convert('RGB');cx=im.width/2;cy=im.height/2
     box=(int(cx-70),int(cy-90),int(cx+70),int(cy+100));x=(dcol*2+phase-1)*140;y=yrow*216+32
     sheet.paste(im.crop(box),(x,y+18));draw.text((x+3,y),f'H{r["hairStyle"]} {direction} {phase}',fill='white')
     receipts.append({'file':name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'crop':box,'direction':direction,'captureOrder':phase,'hairStyle':r['hairStyle']})
  out=BASE/f'contact-g{gender}-{start//3:02d}.png';sheet.save(out);out.with_suffix('.json').write_text(json.dumps({'status':'awaiting visual review','records':receipts},indent=2)+'\n');print(out.name)
