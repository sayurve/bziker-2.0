from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import json,hashlib
r=Path(__file__).resolve().parent
files=[r/'final-sit.jpg']+[r/f'final-seated-drink-{n:02}.jpg' for n in [0,8,16,22,30,40,53]]
labels=['reference: SEATED neutral']+[f'seated drink {n:02}' for n in [0,8,16,22,30,40,53]]
box=(474,369,730,609);tile=(384,360);sheet=Image.new('RGB',(tile[0]*4,2*(tile[1]+24)+32),'#26313a');draw=ImageDraw.Draw(sheet);font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',16)
draw.text((6,5),'ACTUAL UI ONE H7 / SEATED reference + drink samples / QA crop only',font=font,fill='white');receipt=[]
for i,(p,label) in enumerate(zip(files,labels)):
 im=Image.open(p).convert('RGB');crop=im.crop(box).resize(tile,Image.Resampling.NEAREST);x=i%4*tile[0];y=32+i//4*(tile[1]+24);sheet.paste(crop,(x,y+24));draw.text((x+5,y+2),label,font=font,fill='white');receipt.append({'path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'crop':box,'qaDisplayScale':1.5})
out=r/'independent-seated-drink-contact.png';sheet.save(out)
(r/'independent-seated-drink-contact.json').write_text(json.dumps({'status':'await-independent-visual-review','purpose':'Screenshot QA only; no sprite/runtime art changed','files':receipt,'contactSHA256':hashlib.sha256(out.read_bytes()).hexdigest()},indent=2)+'\n')
print(out)
