# Hair native raster fix v27 — part 1, freeze

> Исторический снимок до замены C/L canonical heads. Текущая версия и снятые upstream ограничения H0 описаны в [headwear-native-v28.md](headwear-native-v28.md); старые контакты сохранены как BEFORE, не как текущий runtime.

**Статус: проверено исправление runtime; художественная приёмка всех причёсок остаётся открытой.** Новый женский арт не одобрен. Браузерную приёмку ведёт root отдельно.

## Зафиксированная версия

`game/web/actor-sprite.js` SHA256 `fa6e52aaf04bf8930e7e24a008ab3225da57dc1017c474eae032530eb2f79fa1`.

Этот снимок включает отдельный узкий `pantsStyle===2` patch, применённый root после первого hair freeze. Hair-agent этот блок не менял. `source-actors.js`, исходные PNG и hair/custom JS datasets этим исправлением не редактировались. Изменены hair/native функции в `actor-sprite.js`, добавлен `game/tests/hairstyle-native-v27.test.mjs`; в `actor-motion-v25.test.mjs` уточнена диагностическая координата и исправлена ложная классификация задних бликов волос как кожи.

## Подтверждённая причина и исправление

До исправления coarse hair-geometry копировалась в каждый fine 2×2 блок до проверки настоящих пикселей лица. Это удаляло реальную кожу: male idle/down/bob `(47,35) #ea8a66`, female run/right/bob `(75,40) #f89a68`. Новый hair shape применяется непосредственно к fine-сетке; coarse shape переносит одежду и головные аксессуары отдельно. Маска лица, глаз, ушей и тёмных теней строится из fine-источника, может получать явный `head.facePolygon`. Нейтральные глаза и настоящие контуры не превращаются в цвет волос.

Hair layer регистрируется по native eye landmarks; явные `head.eyeAnchor`, `eyeLine`, `hairScale` поддерживаются без смены API. При отсутствии ручных landmarks используется fallback по настоящим белкам глаз и связанным тёплым компонентам. Это **не авторская polygon-разметка**. `neckAnchor` и `scalpPolygon`, согласованные с motion-agent для будущего head/body draft, сейчас inert metadata.

Отдельный uniform scalar ограничен единицей исходной нормализованной 48px design-space шкалы; один cap применяется ко всем стилям, направлениям и фазам. Никакого X/Y stretch, изменения лица, тела или foot anchor. Ранее ширина всей wavy причёски принималась за ширину scalp, давая до 1.5× и обрезание. RED: male/up/walk0/bob — непрозрачный `(37,0)`; после исправления безопасные верхняя и боковые границы прозрачны во всей матрице. Нет per-frame bbox-fit. Неполный native `head.top` пропускал отдельные старые пиксели контура над новой причёской; область удаления начинается с canvas y0 при сохранённой fine face authority.

В legacy long/wavy UP маске вырезался центр затылка, словно переднее лицо. Hair-only coverage восстановлено из сохранённых коричневых `normalizedPixels` того же источника до начала серой куртки; long сохраняет заданное исходными данными удлинение. Новая растровая графика не рисовалась и не генерировалась.

## Проверки

- Полный `node game/scripts/test-node.mjs`: **817/817 PASS**, 30.78 s; журнал [node-full-817.log](hairstyle-final-v27/node-full-817.log).
- Пять новых тестов: genuine fine skin; все яркие eye pixels; измеренные male rear/female side ears; непрерывность native lower nape; прозрачная safety edge для 1152 сочетаний. Последний тест сначала дал настоящий RED, см. [edge-red.log](hairstyle-final-v27/edge-red.log), затем GREEN в полном журнале.
- Существующие проверки: mouth/chin/neck shadows, поднятые кисти во всех 32 беговых кадрах, neutral eyes при смене кожи, foot anchor, native texture identity, одежда и движения — в полном PASS.
- Старый v25 RGB-критерий называл female/up `(68,39) [210,127,82]` кожей, хотя это блик задних волос, без видимого лица. Rear case заменён на явные настоящие ear samples в новом тесте; фронтальные и боковые flesh guards сохранены.

Actual renderer sweep: **2304 запроса** =12 стилей×2 пола×4 направления×idle/walk/run×4 фазы×2 цвета (коричневый/белый). Idle-фазы повторяют существующую pose0, не изображают четыре новых авторских кадра. В каждой записи есть реальный clip/frame/head и raster bounds. [metrics.json](hairstyle-final-v27/metrics.json), [summary.json](hairstyle-final-v27/summary.json) сохраняют стабильные hashes до/после sweep. Всего 12 full sheets и8 head sheets.

До: 477/792 уникальных выбранных brown вариантов имели RGB strong-flesh deletion candidates, 731/792 — новую внутреннюю прозрачность. После точные числа в [comparison.json](hairstyle-final-v27/comparison.json). Это диагностические кандидаты, **не количество повреждённых лиц и не artistic PASS**: RGB захватывает блики волос, а внутренние пустоты бывают частью хвоста/прядей. Genuine anatomy доказывают отдельные pixel fixtures и просмотр. В конечной матрице нет касаний верхней и боковых границ холста.

Контакты: `hairstyle-audit-v27/` — неизменённый BEFORE; `hairstyle-after-v27/` — промежуточный part1, включая выявленный edge FAIL; **`hairstyle-final-v27/` — текущая версия**. Для сравнения полов при одном scale2: [genders-same-scale.png](hairstyle-final-v27/genders-same-scale.png), native actor96×128, без индивидуальной подгонки. Просмотрены final heads обоих полов по четырём направлениям и общий contact. Это демонстрация текущих разных native heads, не уже подключённого shared-head proposal.

Повторение из корня проекта: `NODE_PATH="$PWD/game/node_modules" node verification/audit-hairstyles-final-v27.mjs`; `NODE_PATH="$PWD/game/node_modules" node verification/hairstyle-gender-contact-v27.mjs`; `node game/scripts/test-node.mjs`.

## Открыто, не выдавать за готовый арт

1. Female `hairStyle0` сохраняет исходные длинные natural hair, хотя каталог называет0 «Короткая». Этот семантический конфликт не закрыт подменой исходника. Shared canonical head proposal ведёт motion-agent, требует отдельной визуальной приёмки двух полов и четырёх направлений.
2. Под длинными female UP волосами исходник не содержит скрытую шею/воротник. Полное удаление волос создавало разрыв. Нижний native nape сохранён как compatibility fringe и перекрашивается; на коротких задних стилях он заметен. Это предотвращает alpha-дырку, но **не правильный законченный короткий женский затылок**. Нужен reviewed base head/neck/body layer; готовый женский арт не заявлен.
3. Legacy long/wavy strands и фактическая форма причёсок требуют художественного и браузерного просмотра; ресурсные метрики не заменяют его. Произвольные новые action poses, новые wholepose overrides и физический телефон этим sweep не приняты. Автоматических `approved` или публикации нет.
