from PIL import Image
from pathlib import Path
import json
for folder in sorted(Path('art/drafts/canonical-actions-v30/hand').iterdir()):
 if not(folder/'sheet.png').exists():continue
 raw=Image.open(folder/'sheet.png').convert('RGBA');s=.181 if folder.name.startswith('male-')else .170;root=[288,666];o=[48-root[0]*s,126-root[1]*s];res=[]
 for n in range(4):
  a=raw.crop((n%2*543,n//2*724,n%2*543+543,n//2*724+724)).transform((96,128),Image.Transform.AFFINE,(1/s,0,-o[0]/s,0,1/s,-o[1]/s),Image.Resampling.NEAREST)
  pending=set()
  for y in range(45,110):
   for x in range(96):
    r,g,b,al=a.getpixel((x,y))
    if al>127 and r>=180 and r-g>40 and g-b>15:pending.add((x,y))
  comps=[]
  while pending:
   pt=pending.pop();q=[pt];c=[]
   while q:
    x,y=q.pop();c.append((x,y))
    for z in [(x-1,y),(x+1,y),(x,y-1),(x,y+1)]:
     if z in pending:pending.remove(z);q.append(z)
   if len(c)>=3:comps.append({'size':len(c),'box':[min(x for x,y in c),min(y for x,y in c),max(x for x,y in c),max(y for x,y in c)],'mean':[round(sum(x for x,y in c)/len(c),1),round(sum(y for x,y in c)/len(c),1)]})
  res.append({'pose':n,'components':comps})
 print(folder.name,json.dumps(res))
