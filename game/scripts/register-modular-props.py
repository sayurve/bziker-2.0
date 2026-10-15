"""Register existing independent action artwork for the modular city."""
import hashlib
import json
import os
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(os.environ.get('BZIKER_SOURCE_DIR',str(Path(__file__).resolve().parents[1]/'source-reference')))
manifest = ROOT / 'docs/design-source-v17.json'
data = json.loads(manifest.read_text())
for identifier, relative, exported in [
    ('actor-prop-trash', '05_Взаимодействия/00_Исходники/Предметы/trash.png', 'design-actor-prop-trash.png'),
]:
    source, target = SOURCE / relative, ROOT / 'assets' / exported
    with Image.open(source) as original:
        source_box = original.convert('RGBA').getchannel('A').getbbox()
    with Image.open(target) as image:
        width, height = image.size
        box = image.convert('RGBA').getchannel('A').point(lambda a: 255 if a >= 128 else 0).getbbox()
    data['assets'][identifier] = {
        'url': '/assets/' + exported, 'width': width, 'height': height,
        'source': relative, 'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'solid_bbox': list(box), 'source_bbox': list(source_box),
        'status': 'saved', 'resampling': 'nearest-neighbour', 'representation': 'independent-action-prop',
    }
# These six existing sprites were generated in v17. Keep that origin explicit;
# they are not assets from the supplied Bziker directory or newly generated art.
supplement = json.loads((ROOT / 'assets/generated-environment-v17-manifest.json').read_text())
for item in supplement['assets']:
    b, r = item['contentBounds'], item['sheetRect']
    data['assets'][item['id']] = {
        'url': '/' + item['path'], 'width': item['width'], 'height': item['height'],
        'solid_bbox': [b['x'], b['y'], b['x'] + b['w'], b['y'] + b['h']],
        'source': supplement['sheet'], 'source_sha256': supplement['sheetSha256'],
        'source_bbox': [r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h']],
        'status': 'generated-supplemental-v17', 'native': False,
        'resampling': 'none', 'representation': 'generated-standalone-sprite',
        'provenance_manifest': 'assets/generated-environment-v17-manifest.json',
    }
urls = {record['url'] for item in data['assets'].values() for record in [item, *item.get('views', {}).values()]}
data['files'] = len(urls)
manifest.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
(ROOT / 'web/design-data.js').write_text('export const designData=' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
print(json.dumps({'registered': ['actor-prop-trash'], 'retained_generated_sprites': len(supplement['assets']), 'files': len(urls)}))
