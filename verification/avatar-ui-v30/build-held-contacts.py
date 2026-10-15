"""Contact sheets from concurrent native held-key screenshots, not synthetic poses."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import json,hashlib
BASE=Path(__file__).resolve().parent
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',13)
for prefix,count in [('run-held',4),('hair-bug-run',3),('hair-fixed-run',3)]:
    if not (BASE/f'{prefix}-down-0.jpg').exists():continue
    sheet=Image.new('RGB',(800,276*count+32),'#26313a');d=ImageDraw.Draw(sheet);d.font=font
    d.text((8,8),prefix+' / actual held-key capture order; first capture can precede keydown',fill='white')
    records=[]
    for col,direction in enumerate(['down','right','up','left']):
        for row in range(count):
            src=BASE/f'{prefix}-{direction}-{row}.jpg';im=Image.open(src).convert('RGB');cx=im.width/2;cy=im.height/2
            box=(int(cx-70),int(cy-90),int(cx+70),int(cy+100));crop=im.crop(box).resize((182,247),Image.Resampling.NEAREST)
            x=col*200+9;y=row*276+32;sheet.paste(crop,(x,y+18));d.text((x,y),f'{direction} capture {row}',fill='white')
            records.append({'file':src.name,'sha256':hashlib.sha256(src.read_bytes()).hexdigest(),'crop':box,'direction':direction,'captureOrder':row})
    out=BASE/f'{prefix}-contact.png';sheet.save(out);out.with_suffix('.json').write_text(json.dumps({'status':'awaiting visual review','records':records},indent=2)+'\n');print(out.name)
