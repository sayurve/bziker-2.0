from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import json,hashlib
B=Path(__file__).resolve().parent
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',13)
def sheet(files,name,title,cols=7):
 w,h=160,220
 im=Image.new('RGB',(cols*w,40+((len(files)+cols-1)//cols)*h),'#26313a');d=ImageDraw.Draw(im);d.text((8,10),title,font=font,fill='white');records=[]
 for i,p in enumerate(files):
  s=Image.open(p).convert('RGB');cx,cy=s.width//2,s.height//2;box=(cx-80,cy-95,cx+80,cy+100)
  x,y=(i%cols)*w,40+(i//cols)*h;im.paste(s.crop(box),(x,y+20));d.text((x+3,y),p.stem.replace('final-',''),font=font,fill='white');records.append({'file':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'crop':box})
 im.save(B/name);(B/name).with_suffix('.json').write_text(json.dumps({'status':'awaiting visual review','files':records},indent=2)+'\n')
for dr in ['down','right','up','left']:
 sheet(sorted(B.glob('final-run-'+dr+'-*.jpg'))+[B/('final-idle-'+dr+'.jpg')],'final-contact-'+dr+'.png','ACTUAL GAME / ONE male H7 white6 dark3 lime8 / held keys + idle')
for action in ['eat']:
 sheet(sorted(B.glob('final-'+action+'-*.jpg')),'final-contact-'+action+'.png','ACTUAL GAME / same saved avatar / '+action)
print('Created 5 contact sheets from actual gameplay screenshots.')
