"""Extract authored reusable pieces; preserve artwork and provenance."""
import hashlib,json
import os
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
SOURCE=Path(os.environ.get('BZIKER_SOURCE_DIR',str(Path(__file__).resolve().parents[1]/'source-reference')))
d=json.loads((ROOT/'docs/design-source-v17.json').read_text())
for id,path,box in [
 ('source-road-asphalt-tile','01_Окружение/Дороги/Широкая_дорога/основной.png',(200,250,400,380)),
 ('streetlight-classic','01_Окружение/Уличные_объекты/Фонари/варианты.png',(250,60,615,980)),
 ('welcome-source-sign','09_Интерфейс_игры/11_Вкладки_и_вход/Указатели/Приветственная_табличка/Приветствие_пиксельный_шрифт.png',None),
]:
 p=SOURCE/path;im=Image.open(p).convert('RGBA');bbox=box or im.getchannel('A').getbbox();im=im.crop(bbox)
 if max(im.size)>512:im=im.resize(tuple(round(v*512/max(im.size)) for v in im.size),Image.Resampling.NEAREST)
 name=f'design-{id}.png';im.save(ROOT/'assets'/name,optimize=True)
 d['assets'][id]={'url':'/assets/'+name,'width':im.width,'height':im.height,'source':path,'source_sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'source_bbox':list(bbox),'status':'saved','resampling':'nearest-neighbour'}
(ROOT/'web/design-data.js').write_text('export const designData='+json.dumps(d,ensure_ascii=False,separators=(',',':'))+';\n')
(ROOT/'docs/design-source-v17.json').write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
print('Imported road material, lamp and welcome sign')
