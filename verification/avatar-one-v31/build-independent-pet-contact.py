from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import json,hashlib
r=Path(__file__).resolve().parent;frames=[0,5,10,16,22,28,34,37];box=(260,385,495,585);tile=(352,300)
sheet=Image.new('RGB',(tile[0]*4,2*(tile[1]+24)+32),'#26313a');d=ImageDraw.Draw(sheet);font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',16);d.text((6,5),'ACTUAL UI / same ONE H7 / world pet / sample8 of38 / QA crop',font=font,fill='white');receipt=[]
for i,n in enumerate(frames):
 p=r/f'final-pet-{n:02}.jpg';s=Image.open(p).convert('RGB');x=i%4*tile[0];y=32+i//4*(tile[1]+24);sheet.paste(s.crop(box).resize(tile,Image.Resampling.NEAREST),(x,y+24));d.text((x+4,y+3),f'pet {n:02}',font=font,fill='white');receipt.append({'path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'sourceSize':s.size,'crop':box,'qaDisplaySize':tile})
p=r/'independent-pet-contact.png';sheet.save(p);(r/'independent-pet-contact.json').write_text(json.dumps({'status':'await-independent-visual-review','files':receipt,'contactSHA256':hashlib.sha256(p.read_bytes()).hexdigest(),'limits':'8selected actual screenshots of38; no runtime/art edits'},indent=2)+'\n');print(p)
