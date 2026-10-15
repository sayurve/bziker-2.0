"""Copy approved interface assets without altering their pixels or source files."""
import hashlib
import json
import shutil
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(os.environ.get('BZIKER_SOURCE_DIR',str(Path(__file__).resolve().parents[1]/'source-reference'))) / '09_Интерфейс_игры'
FILES = {
    'font.ttf': '12_Загрузка_и_вход/assets/Пиксельный_шрифт.ttf',
    'font-license.txt': '12_Загрузка_и_вход/assets/Лицензия_шрифта.txt',
    'city.png': '12_Загрузка_и_вход/assets/Город.png',
    'mascot.png': '12_Загрузка_и_вход/assets/Бзик_приветствие.png',
    'hands-male.png': '10_Телебзи/Телебзи_Мужские_руки.png',
    'hands-female.png': '10_Телебзи/Телебзи_Женские_руки.png',
    'phone.png': '10_Телебзи/Телебзи_без_рук.png',
    'minimap.png': '03_Миникарта/01_Рамка.png',
    'location.png': '04_Локация/01_Подложка_без_текста.png',
    'online.png': '01_Кнопки/Онлайн/01_Обычная.png',
    'counter.png': '08_Монеты_и_счётчики/03_Подложка_счётчика.png',
    'coin.png': '08_Монеты_и_счётчики/01_Монета_золотая.png',
    'joystick-base.png': '02_Джойстик/01_Основание.png',
    'joystick-knob.png': '02_Джойстик/02_Ручка.png',
}
for kind, folder in [('hand', 'Взаимодействие'), ('inventory', 'Инвентарь'), ('phone-button', 'Телефон')]:
    for state, filename in [('normal', '01_Обычная.png'), ('pressed', '02_Нажатая.png'), ('selected', '03_Выбранная.png'), ('disabled', '04_Недоступная.png')]:
        FILES[f'{kind}-{state}.png'] = f'01_Кнопки/{folder}/{filename}'


def main():
    records = []
    for suffix, relative in FILES.items():
        source = SOURCE / relative
        target = ROOT / 'assets' / f'design-ui-{suffix}'
        shutil.copyfile(source, target)
        raw = target.read_bytes()
        records.append({'path': str(target.relative_to(ROOT)), 'source': relative, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()})
    manifest = {'source_root': str(SOURCE), 'approved_only': True, 'operation': 'byte-for-byte copy', 'files': records}
    (ROOT / 'assets/design-ui-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'copied': len(records), 'bytes': sum(x['bytes'] for x in records)}))


if __name__ == '__main__':
    main()
