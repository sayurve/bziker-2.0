"""Record opaque artwork bounds without changing any saved source pixels."""
import json
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
manifest=ROOT/'docs/design-source-v17.json'
data=json.loads(manifest.read_text())
cache={}
def measure(record):
    path=ROOT/record['url'].lstrip('/')
    if record['url'] not in cache:
        with Image.open(path).convert('RGBA') as image:
            cache[record['url']]=list(image.getchannel('A').point(lambda alpha:255 if alpha>=128 else 0).getbbox() or (0,0,*image.size))
    record['solid_bbox']=cache[record['url']]
for asset in data['assets'].values():
    measure(asset)
    for view in asset.get('views',{}).values():measure(view)
(ROOT/'web/design-data.js').write_text('export const designData='+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n')
manifest.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'measured_pngs':len(cache),'asset_count':len(data['assets'])}))
