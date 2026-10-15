"""Assemble actual UI captures for visual inspection; does not approve them."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json, hashlib

BASE = Path(__file__).resolve().parent
records = json.loads((BASE / 'completed-cases.json').read_text())
groups = {}
for r in records:
    groups.setdefault((r['gender'], r['part']), []).append(r)
for (gender, part), cases in groups.items():
    for start in range(0, len(cases), 6):
        subset = cases[start:start+6]
        sheet = Image.new('RGB', (800, 276*len(subset)+32), '#26313a')
        draw = ImageDraw.Draw(sheet)
        draw.font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',12)
        draw.text((8, 8), f'Actual UI / g{gender} {part} / post-movement facing, not full run-cycle proof', fill='white')
        evidence=[]
        for row, r in enumerate(subset):
            for col, direction in enumerate(['up','left','down','right']):
                name=f'g{gender}-{part}-{r["value"]:02d}-{direction}.jpg'
                src=BASE/name
                im=Image.open(src).convert('RGB')
                # Camera follows the avatar. Preserve the complete silhouette and nameplate.
                cx=im.width/2; cy=im.height/2
                box=(int(cx-70),int(cy-90),int(cx+70),int(cy+100))
                crop=im.crop(box).resize((182,247),Image.Resampling.NEAREST)
                x=col*200+9; y=row*276+32
                sheet.paste(crop,(x,y+18))
                draw.text((x,y),f'{r["value"]} {r["label"]} {direction}',fill='white')
                evidence.append({'source':name,'sha256':hashlib.sha256(src.read_bytes()).hexdigest(),'crop':box,'direction':direction,'value':r['value']})
        out=BASE/f'contact-g{gender}-{part}-{start//6:02d}.png'
        sheet.save(out)
        out.with_suffix('.json').write_text(json.dumps({'status':'awaiting-visual-review','contact':out.name,'records':evidence},ensure_ascii=False,indent=2)+'\n')
        print(out.name)
