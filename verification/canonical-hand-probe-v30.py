from PIL import Image,ImageDraw
from pathlib import Path
import json
meta=json.load(open('verification/canonical-master-heads-v30.json'));rows=[]
for name in ['male-down','male-right','male-up','male-left','female-down','female-right','female-up','female-left']:
 raw=Image.open(Path('art/drafts/canonical-actions-v30/hand')/name/'sheet.png').convert('RGBA');s=.181 if name.startswith('male-')else .170;root=[288,666];off=[48-root[0]*s,126-root[1]*s]
 sheet=Image.new('RGB',(6*216,360),'#dce5e1');q=ImageDraw.Draw(sheet);gender,dr=name.split('-');C=Image.open('game/'+meta['human-'+name]['detail']['path']).convert('RGBA');sheet.paste(C.resize((192,256),Image.Resampling.NEAREST),(4,40),C.resize((192,256),Image.Resampling.NEAREST));q.text((4,12),name+' Cidle',fill='#111111')
 for n in range(4):
  cell=raw.crop((n%2*543,n//2*724,n%2*543+543,n//2*724+724));native=cell.transform((96,128),Image.Transform.AFFINE,(1/s,0,-off[0]/s,0,1/s,-off[1]/s),Image.Resampling.NEAREST);im=native.resize((192,256),Image.Resampling.NEAREST);sheet.paste(im,(216*(n+1)+4,40),im);q.text((216*(n+1)+4,12),str(n)+' RAW s'+str(s),fill='#111111')
  for y in range(20,120,10):q.text((216*(n+1)+4,40+2*y),str(y),fill='#0055aa');q.line((216*(n+1)+25,40+2*y,216*(n+1)+196,40+2*y),fill='#bbd0c9')
 sheet.save('verification/canonical-hand-'+name+'-raw-probe-v30.png')
