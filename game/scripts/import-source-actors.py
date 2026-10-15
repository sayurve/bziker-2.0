#!/usr/bin/env python3
"""Compile the approved actor artwork into small, transparent runtime pages.

No videos, source sheets or rendered scene films are shipped. Each image is an
entire supplied pose; the importer never assembles a face or invents a limb.
The source ground anchor is retained and root motion is deliberately omitted.
"""
import argparse
import hashlib
import json
import math
from collections import OrderedDict
import os
from pathlib import Path
from PIL import Image

DEFAULT_SOURCE = Path(os.environ.get('BZIKER_SOURCE_DIR',str(Path(__file__).resolve().parents[1]/'source-reference')))
APP = Path(__file__).resolve().parents[1]
NEAREST = Image.Resampling.NEAREST


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def material_layout(image):
    """Only metadata: find the authored hair region, without changing pixels."""
    points = []
    for y in range(min(43, image.height)):
        for x in range(image.width):
            r, g, b, a = image.getpixel((x, y))
            if a and r > g * 1.15 and g > b * 1.06 and r - g < 75:
                points.append((x, y))
    if not points:
        return {'top': 4, 'bottom': 24, 'left': 12, 'right': 35}
    top = min(y for _, y in points)
    # The scalp is the top brown component; food/objects lower down are excluded.
    points = [(x, y) for x, y in points if y < top + 21]
    return {'top': top, 'bottom': min(42, max(y for _, y in points) + 2),
            'left': min(x for x, _ in points), 'right': max(x for x, _ in points)}


def normalized(image, actor, anchor=(128, 224), effect=False, fixed_scale=None, detail=1):
    human = actor.startswith('human-')
    width, height = (48, 64) if human else (64, 64)
    target = (24, 63) if human else (32, 63)
    scale = .32 if actor == 'human-male' else .305 if human else .245
    bounds = image.getbbox()
    # A lying pose is wider; reduce the entire pose only when necessary rather
    # than clipping the supplied feet/head at the cell edge.
    if fixed_scale is not None:
        scale = fixed_scale
    elif bounds and not effect:
        l, t, r, b = bounds
        scale = min(scale, (target[0] - 1) / max(1, anchor[0] - l),
                    (width - target[0] - 1) / max(1, r - anchor[0]),
                    (target[1] - 1) / max(1, anchor[1] - t))
    width, height = width * detail, height * detail
    target = (target[0] * detail, target[1] * detail)
    scale *= detail
    out = Image.new('RGBA', (width, height))
    size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    small = image.resize(size, NEAREST)
    origin = (round(target[0] - anchor[0] * scale), round(target[1] - anchor[1] * scale))
    out.paste(small, origin)
    point = lambda p: [round(origin[0] + p[0] * scale), round(origin[1] + p[1] * scale)]
    return out, point, scale


def largest_component(image):
    """Discard the neighboring sprite's spill at a nonuniform source cell seam."""
    alpha = image.getchannel('A')
    points = {(x, y) for y in range(image.height) for x in range(image.width) if alpha.getpixel((x, y)) > 16}
    biggest = []
    while points:
        first = points.pop()
        queue, component = [first], [first]
        while queue:
            x, y = queue.pop()
            for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)]:
                p = (x + dx, y + dy)
                if p in points:
                    points.remove(p)
                    queue.append(p)
                    component.append(p)
        if len(component) > len(biggest):
            biggest = component
    mask = Image.new('L', image.size)
    for p in biggest:
        mask.putpixel(p, alpha.getpixel(p))
    result = image.copy()
    result.putalpha(mask)
    return result


def compile_pack(source, app):
    assets = app / 'assets'
    assets.mkdir(exist_ok=True)
    result = {'version': 17, 'source': 'Bziker', 'rootMotion': False,
              'actors': {}, 'daily': {}, 'gestures': {}, 'scenarios': {},
              'water': {}, 'props': {}, 'composites': {}, 'coverage': {}}
    opened = OrderedDict()
    def image(path):
        key = str(path)
        if key not in opened:
            opened[key] = Image.open(path).convert('RGBA')
            if len(opened) > 8:
                opened.popitem(last=False)
        else:
            opened.move_to_end(key)
        return opened[key]

    def pack(stem, frames, actor, metadata=None, effect=False, group_size=None):
        cells, detail_cells = [], []
        metadata = metadata or [{} for _ in frames]
        group_size = group_size or len(frames)
        group_scales = [min(normalized(f, actor, effect=effect)[2] for f in frames[start:start + group_size])
                        for start in range(0, len(frames), group_size)]
        for i, (raw, meta) in enumerate(zip(frames, metadata)):
            scale = group_scales[i // group_size]
            cell, point, scale = normalized(raw, actor, effect=effect, fixed_scale=scale)
            info = {'head': material_layout(cell)} if actor.startswith('human-') and not effect else {}
            info['sourceScale'] = scale
            for k in ['hand', 'second_hand', 'pelvis', 'mouth']:
                if k in meta:
                    info[k] = point(meta[k])
            cells.append((cell, info))
            if actor.startswith('human-') and not effect:
                detailed, _, _ = normalized(raw, actor, effect=effect, fixed_scale=scale, detail=2)
                detail_cells.append(detailed)
        w, h = cells[0][0].size
        columns, capacity = 8, 128
        pages, rects = [], []
        for start in range(0, len(cells), capacity):
            batch = cells[start:start + capacity]
            page = Image.new('RGBA', (columns * w, math.ceil(len(batch) / columns) * h))
            page_id = len(pages)
            filename = f'design-actor-{stem}-{page_id + 1}.png'
            for i, (cell, info) in enumerate(batch):
                x, y = i % columns * w, i // columns * h
                page.paste(cell, (x, y))
                rects.append({'page': page_id, 'x': x, 'y': y, 'w': w, 'h': h, **info})
            page.save(assets / filename, optimize=True)
            pages.append({'path': 'assets/' + filename, 'width': page.width, 'height': page.height})
        detail_pages = []
        if detail_cells:
            dw, dh = w * 2, h * 2
            for start in range(0, len(detail_cells), capacity):
                batch = detail_cells[start:start + capacity]
                page = Image.new('RGBA', (columns * dw, math.ceil(len(batch) / columns) * dh))
                filename = f'design-actor-detail-{stem}-{len(detail_pages) + 1}.png'
                for i, cell in enumerate(batch):
                    x, y = i % columns * dw, i // columns * dh
                    page.paste(cell, (x, y))
                    rects[start + i]['detail'] = {'path': 'assets/' + filename, 'x': x, 'y': y, 'w': dw, 'h': dh, 'factor': 2}
                page.save(assets / filename, optimize=True)
                detail_pages.append({'path': 'assets/' + filename, 'width': page.width, 'height': page.height})
        return {'images': pages, 'detail_images': detail_pages, 'frames': rects, 'anchor': [w // 2, 63], 'sprite_size': [w, h]}

    base = read(source / '04_Анимации/каталог.json')
    for actor in base['actors']:
        src = (source / '04_Анимации' / actor['atlas']).resolve()
        sheet = image(src)
        frames = [sheet.crop((r['x'], r['y'], r['x'] + 256, r['y'] + 256))
                  for action in actor['actions'] for r in action['rects']]
        atlas = pack('base-' + actor['id'], frames, actor['id'], group_size=4)
        actions = {}
        for i, action in enumerate(actor['actions']):
            actions[action['name']] = {**{k: action[k] for k in ['name', 'label', 'duration', 'loop', 'timeline']},
                                      'fps': 12, 'frames': atlas['frames'][i * 4:i * 4 + 4],
                                      'sourceKey': actor['catalog'] + '#' + action['name']}
        result['actors'][actor['id']] = {**{k: actor[k] for k in ['id', 'kind', 'label']},
                                        'atlas': atlas['images'][0]['path'],
                                        'size': [atlas['images'][0]['width'], atlas['images'][0]['height']],
                                        'images': atlas['images'], 'detail_images': atlas['detail_images'], 'anchor': atlas['anchor'],
                                        'sprite_size': atlas['sprite_size'], 'actions': actions}

    daily = read(source / '06_Повседневные_действия/каталог.json')
    for entry in daily['entries']:
        actor = 'human-' + entry['actor']
        sheets = [image(source / page['path']) for page in entry['images']]
        frames = [sheets[r['page']].crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h'])) for r in entry['frames']]
        record = {k: entry[k] for k in ['id', 'actor', 'mode', 'label', 'context', 'direction', 'duration',
                                       'parts', 'movement_policy', 'events', 'fps', 'timeline']}
        record.update(pack('daily-' + entry['id'], frames, actor))
        record.update(sourceKey='06_Повседневные_действия/каталог.json#' + entry['id'], embeddedProps=True)
        effect = entry.get('effects')
        if effect:
            sheets = [image(source / page['path']) for page in effect['images']]
            frames = [sheets[r['page']].crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h'])) for r in effect['frames']]
            record['effects'] = {**pack('effect-' + entry['id'], frames, actor, effect=True),
                                 'fps': effect['fps'], 'duration': entry['duration'], 'timeline': effect['timeline'], 'blend': effect['blend']}
        result['daily'][entry['id']] = record

    scenes = read(source / '05_Взаимодействия/сцены.json')
    for actor in scenes['actors']:
        frames, meta, order = [], [], []
        for gesture, action in actor['gestures'].items():
            for direction, sequence in action['directions'].items():
                key = actor['id'] + '-' + gesture + '-' + direction
                order.append((key, gesture, direction, sequence, len(frames)))
                for f in sequence['frames']:
                    frames.append(image(source / f['png']))
                    meta.append(f)
        atlas = pack('gestures-' + actor['id'], frames, 'human-' + actor['id'], meta, group_size=4)
        for key, gesture, direction, sequence, start in order:
            result['gestures'][key] = {'id': key, 'actor': actor['id'], 'mode': gesture, 'direction': direction,
                                      'context': 'seated' if gesture == 'seated' else 'standing',
                                      'duration': sequence['duration'], 'fps': sequence['fps'],
                                      'timeline': sequence['phase_order'], 'cancelTimeline': sequence['cancellation_phase_order'],
                                      'frames': atlas['frames'][start:start + len(sequence['frames'])],
                                      'images': atlas['images'], 'anchor': atlas['anchor'], 'sprite_size': atlas['sprite_size'],
                                      'sourceKey': '05_Взаимодействия/сцены.json#' + key}
        # This is the source scene player's own seated-food composition:
        # align the upper pose by its pelvis and retain the authored seat legs.
        # Compile once, rather than moving body parts every browser frame.
        for direction in ['front', 'right', 'back', 'left']:
            seated = actor['gestures']['seated']['directions'][direction]['frames'][1]
            seat = image(source / seated['png'])
            split = round(seated['pelvis'][1])
            frames, metas = [], []
            for f in actor['gestures']['eat']['directions'][direction]['frames']:
                raw = image(source / f['png'])
                shift = round(split - f['pelvis'][1])
                combined = Image.new('RGBA', (256, 256))
                combined.paste(seat.crop((0, split, 256, 256)), (0, split))
                upper = Image.new('RGBA', (256, 256))
                upper.paste(raw, (0, shift))
                combined.paste(upper.crop((0, 0, 256, split + 1)), (0, 0))
                frames.append(combined)
                metas.append({**f, 'hand': [f['hand'][0], f['hand'][1] + shift], 'pelvis': seated['pelvis']})
            key = actor['id'] + '-eat-seated-' + direction
            atlas = pack('composite-' + key, frames, 'human-' + actor['id'], metas)
            result['composites'][key] = {**atlas, 'id': key, 'actor': actor['id'], 'mode': 'eat',
                                         'context': 'seated', 'direction': direction, 'fps': 12, 'duration': 2,
                                         'timeline': [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3],
                                         'sourceKey': '05_Взаимодействия/сцены.json#' + actor['id'] + '-seat-eat-' + direction}

    # Preserve every supplied scenario key, timing and event. Runtime adapters
    # select its actor-only pose, never the full scene (which has props/roads).
    for scenario in scenes['scenarios']:
        result['scenarios'][scenario['id']] = {k: v for k, v in scenario.items() if k not in ['dest']}
        result['scenarios'][scenario['id']]['sourceKey'] = '05_Взаимодействия/сцены.json#' + scenario['id']

    props = [(key, obj) for key, obj in scenes['objects'].items() if 'Предметы' in obj.get('path', '')]
    sizes = {'cigarette': (8, 3), 'phone': (7, 10), 'trash': (8, 7), 'sandwich': (8, 6), 'mug': (7, 8)}
    for key, obj in props:
        raw = image(source / obj['path'])
        raw = raw.crop(raw.getbbox())
        w, h = sizes.get(key, (11, 11))
        raw.thumbnail((w, h), NEAREST)
        filename = 'design-actor-prop-' + key + '.png'
        raw.save(assets / filename, optimize=True)
        result['props'][key] = {'path': 'assets/' + filename, 'size': list(raw.size), 'sourceKey': obj['path']}

    # Female water poses are already isolated and annotated by the source pack.
    female = scenes['female_water']
    atlas = pack('water-female', [image(source / f['png']) for f in female['poses']], 'human-female', female['poses'])
    result['water']['female-water'] = {**atlas, 'id': 'female-water', 'actor': 'female', 'context': 'seated',
                                      'fps': 12, 'duration': 16 / 3, 'timeline': list(range(16)),
                                      'sourceKey': female['atlas'], 'direction': 'right'}
    # The male water sheets are actor-only sheets. Crop exact cells; normalize
    # all with one common scale and ground anchor instead of per-frame fitting.
    for key, src_key, cols, rows in [('male-fishing', 'seated-fishing-pocket-12', 4, 3),
                                     ('male-boat', 'boat-entry-driver-12', 4, 3),
                                     ('male-fish-pocket', 'fish-held-pocket-8', 4, 2)]:
        raw = image(source / scenes['water_assets'][src_key])
        cw, ch = raw.width // cols, raw.height // rows
        if key == 'male-boat':
            cells = []
            for i in range(cols * rows):
                b = scenes['water_bounds']['entry-' + str(i)]
                cells.append(raw.crop((b['x'] - 2, b['y'] - 2, b['x'] + b['w'] + 2, b['y'] + b['h'] + 2)))
        else:
            cells = [largest_component(raw.crop((i % cols * cw, max(0, i // cols * ch - 24),
                                                 (i % cols + 1) * cw, min(raw.height, (i // cols + 1) * ch + 24))))
                     for i in range(cols * rows)]
        boxes = [c.getbbox() for c in cells]
        tallest = max(b[3] - b[1] for b in boxes)
        shrink = min(180 / tallest, 220 / max(b[2] - b[0] for b in boxes))
        native = []
        for cell, bounds in zip(cells, boxes):
            crop = cell.crop(bounds)
            crop = crop.resize((round(crop.width * shrink), round(crop.height * shrink)), NEAREST)
            normalized_cell = Image.new('RGBA', (256, 256))
            normalized_cell.paste(crop, (128 - crop.width // 2, 224 - crop.height))
            native.append(normalized_cell)
        atlas = pack('water-' + key, native, 'human-male')
        result['water'][key] = {**atlas, 'id': key, 'actor': 'male', 'context': 'seated', 'fps': 12,
                                'duration': len(native) / 3, 'timeline': list(range(len(native))),
                                'sourceKey': scenes['water_assets'][src_key], 'direction': 'right', 'embeddedProps': True}

    requested = {
        'idle': ['01_На_месте'], 'walk-four-directions': ['Ходьба'], 'run-four-directions': ['Бег'],
        'sit-stand': ['-sit-', '-seated-', '-stand-'], 'crouch': ['Приседает'], 'sleep': ['Сон'],
        'jump-takeoff': ['Прыжок'], 'greet': ['Приветствие'], 'phone-standing-seated-walking': ['-phone-', '-walk-phone-'],
        'call': ['-call-'], 'inventory-equip': ['-inventory-', '-equip-'], 'eat': ['-eat-'],
        'drink-standing-seated-walking': ['-water-', '-soda-', '-beer-', '-mug-', '-walk-drink-'],
        'smoke-standing-seated-walking': ['-smoke-', '-walk-smoke-'], 'pickup-hold-trash': ['-pickup-', '-carry-', '-pocket-'],
        'throw-trash': ['-bin-', '-give-'], 'pet-feed-water-walk-animals': ['-pet-', '-bowl-'],
        'door-counter-buy': ['-door-', '-counter-'], 'give-receive-talk-handshake': ['-give-', '-receive-', '-talk-', '-handshake-'],
        'water-plants': ['-plant-'], 'fish-catch-store': ['male-fishing', 'male-fish-pocket', 'female-water'],
        'boat-entry-driver': ['male-boat', 'female-water'],
    }
    keys = [(v['sourceKey'], k) for k, v in result['daily'].items()] + [(v['sourceKey'], k) for k, v in result['gestures'].items()]
    keys += [(v['sourceKey'], k) for k, v in result['scenarios'].items()] + [(v['sourceKey'], k) for k, v in result['water'].items()]
    keys += [(v['sourceKey'], k) for a in result['actors'].values() for k, v in a['actions'].items()]
    result['coverage'] = {'source_motion_revision': base.get('motion_revision'), 'root_motion_applied': False,
                          'base_actors': len(result['actors']), 'base_actions': sum(len(a['actions']) for a in result['actors'].values()),
                          'daily_cycles': len(result['daily']), 'gesture_sequences': len(result['gestures']),
                          'scenario_keys': len(result['scenarios']),
                          'requested': [{'action': action, 'sourceKeys': sorted(set(source_key for source_key, key in keys if any(t in key for t in tokens)))} for action, tokens in requested.items()],
                          'water_source_directions': ['right'],
                          'integration': 'Existing world actions select adapters; every original key is available via animationId. Source root motion is not sent to the server.'}
    for row in result['coverage']['requested']:
        if not row['sourceKeys']:
            raise ValueError('Uncovered requested animation: ' + row['action'])
    output = 'export const sourceActorsData=' + json.dumps(result, ensure_ascii=False, separators=(',', ':')) + ';\n'
    (app / 'web/source-actors-data.js').write_text('// Generated by scripts/import-source-actors.py; edit the importer.\n' + output, encoding='utf-8')
    (assets / 'design-actor-coverage.json').write_text(json.dumps(result['coverage'], ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    pages = list(assets.glob('design-actor-*.png'))
    print(json.dumps({'actors': len(result['actors']), 'base_actions': result['coverage']['base_actions'],
                      'daily': len(result['daily']), 'gestures': len(result['gestures']), 'scenarios': len(result['scenarios']),
                      'png_pages': len(pages), 'png_bytes': sum(p.stat().st_size for p in pages),
                      'manifest_bytes': len(output.encode())}, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, default=DEFAULT_SOURCE)
    parser.add_argument('--app', type=Path, default=APP)
    args = parser.parse_args()
    compile_pack(args.source, args.app)
