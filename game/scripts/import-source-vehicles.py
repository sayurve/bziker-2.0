"""Append authored vehicle colours/sides and catalogue omissions to v17.

Only PNG artwork is compiled. Source reviews, videos and saved gameplay are
not changed; each direction retains the source's independent painting.
"""
import hashlib
import json
import os
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(os.environ.get('BZIKER_SOURCE_DIR',str(Path(__file__).resolve().parents[1]/'source-reference')))
MANIFEST = ROOT / 'docs/design-source-v17.json'
data = json.loads(MANIFEST.read_text())
assets = data['assets']
missing = data.setdefault('missing', [])
directions = ('front', 'right', 'back', 'left')


def export(path, limit, status, **metadata):
    source = SOURCE / path
    if not source.is_file():
        if path not in missing:
            missing.append(path)
        return None
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    with Image.open(source) as original:
        image = original.convert('RGBA')
    bbox = image.getchannel('A').getbbox() or (0, 0, *image.size)
    image = image.crop(bbox)
    scale = min(1, limit / max(image.size))
    if scale < 1:
        image = image.resize(tuple(max(1, round(n * scale)) for n in image.size), Image.Resampling.NEAREST)
    name = f'design-{digest[:20]}-{limit}.png'
    target = ROOT / 'assets' / name
    if not target.exists():
        image.save(target, optimize=True)
    return dict(url='/assets/' + name, width=image.width, height=image.height,
                source=path, source_sha256=digest, source_bbox=list(bbox),
                status=status, resampling='nearest-neighbour', **metadata)


# The base importer previously excluded all character assets, including the
# approved cashier. Only cats/dogs belong exclusively to the actor compiler.
catalog = json.loads((SOURCE / 'каталог.json').read_text())
supplemented = []
for item in catalog['assets']:
    path = item.get('primary', '')
    if item['id'] in assets or item.get('kind') in ('cat', 'dog') or not path.lower().endswith('.png'):
        continue
    value = export(path, 768, item.get('status', 'saved'), source_manifest='каталог.json')
    if value:
        assets[item['id']] = value
        supplemented.append(item['id'])

models = colors = views = 0
for manifest in sorted((SOURCE / '01_Окружение/Транспорт').rglob('состав.json')):
    item = json.loads(manifest.read_text())
    model_id = item.get('id')
    if not model_id or not item.get('colors'):
        continue
    model = assets.get(model_id)
    if not model:
        model = export(item['primary'], 768, item.get('status', 'draft'))
        if not model:
            continue
        assets[model_id] = model
    model['colors'] = {}
    model['source_manifest'] = manifest.relative_to(SOURCE).as_posix()
    models += 1
    for color in item['colors']:
        key = color['key']
        authored = {view['direction']: view for view in color.get('views', [])}
        sides = {}
        for direction in directions:
            if direction not in authored:
                continue
            source_view = authored[direction]
            side = export(source_view['primary'], 512, source_view.get('status', item.get('status', 'draft')),
                          direction=direction, color=key, model_id=model_id,
                          source_manifest=model['source_manifest'],
                          camera_elevation_degrees=source_view.get('camera_elevation_degrees', 20),
                          azimuth_degrees=source_view.get('azimuth_degrees'),
                          representation='vehicle-direction', interaction_status='visual_assets_only')
            if side:
                sides[direction] = side
                views += 1
        if not sides:
            continue
        identifier = model_id + '-' + key
        value = dict(sides.get('front', next(iter(sides.values()))), id=identifier,
                     label=item.get('name', model_id) + ' · ' + color.get('name', key),
                     color_hex=color.get('hex'), views=sides)
        assets[identifier] = value
        model['colors'][key] = value
        colors += 1


def png_urls(value):
    if isinstance(value, dict):
        if isinstance(value.get('url'), str) and value['url'].endswith('.png'):
            yield value['url']
        for nested in value.values():
            yield from png_urls(nested)
    elif isinstance(value, list):
        for nested in value:
            yield from png_urls(nested)


data['files'] = len(set(png_urls(assets)))
data.setdefault('rules', {})['independent_vehicle_sides'] = True
for target, content in [
    (MANIFEST, json.dumps(data, ensure_ascii=False, indent=2) + '\n'),
    (ROOT / 'web/design-data.js', 'export const designData=' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n'),
]:
    temporary = target.with_name(target.name + '.tmp')
    temporary.write_text(content)
    temporary.replace(target)
print(json.dumps(dict(vehicle_models=models, vehicle_colors=colors, vehicle_directional_pngs=views,
                      supplemented=supplemented, registry_assets=len(assets), png_files=data['files'], missing=missing),
                 ensure_ascii=False))
