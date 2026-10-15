# Независимый read-only review: floor action highlight и fine-face guard

Профиль В. Runtime и tests этим reviewer не изменялись. Сохранены только отдельный диагностический script, его результаты и этот отчёт. Оригинальный Bziker не затрагивался. Рассмотренный final actorSprite SHA256 `685e6d9a77feb1d746b689c3072b5373dbe33667d3d0108b6e0773bcc9100531`; phaser-scene-paint.js `64406bcfe1e5f68a96eb88928a68c12ecd8b3d8855d0e92f7623db69e08ce61a`.

## Результат review

Actionable defects в проверенном patch/scope не обнаружены. Это узкая независимая проверка, не полный suite и не художественное одобрение каждого элемента гардероба. Full regression и реальные browser UI82male+82female ведёт root. Физический телефон недоступен, проверка на устройстве не выполнена.

## Floor interaction outline

Production depth -80000 находится выше ground -100000/water -99999/floor props -90000+, ниже actor/furniture objects >=1000 и foreground800000+. Поэтому рамка остаётся частью пола и не рисуется через голову персонажа. Позиция/размер/штрих рамки, scene revision и действующая source geometry не менялись. `PhaserWorldRenderer.paint()` применяет `.setDepth(depth)` при каждом вызове даже для cached texture, поэтому изменение не зависит от нового paint revision.

Новый `action-highlight-depth-v27.test.mjs` содержателен: вызывает настоящий paintWorldFrame, rasterizes dashed outline и actor, композитит их по production depth и проверяет два противоположных условия: перекрытый face pixel сохраняет цвет актёра, а exposed dashed pixel остаётся видимым. Это не assertion одной константы config. Root RED-log показывает фактическое прежнее overwrite белым RGBA250,248,242,255; GREEN сохраняет actor18,52,171,255. Ограничение unit test: синтетический solid actor используется как depth-проба, не как художественный PNG. Реальный browser repro hair-crossing выполнял root.

Независимый запуск:
`node --test game/tests/action-highlight-depth-v27.test.mjs game/tests/phaser-renderer.test.mjs`
**7/7 PASS**, exit0, лог `action-highlight-independent-review-v27.log`. Проверены также cached pose revisions/reduced motion и clan art redraw.

## Fine-face / raincoat / body guard

Fine geometry transfer теперь применяется вне opaque source face material. Для реального лица сохраняются fine source pixels, затем разрешённый skin tint выполняется до face skip branch; защитный guard не возвращает исходный светлый цвет поверх выбранного оттенка кожи. Dark/neutral face outline больше не проваливается в garment tint. Raincoat stripe начинается не выше native bodyTop/ceil(neckAnchor.y) и требует реальную серую sourcecloth. Native hair classification не пользуется старым generic fallback `hair && y<36`; при authored neck hair material ограничен neckAnchor.y, поэтому тёплый body outline больше не красится как волосы. Legacy metadata без neck сохраняет прежний fallback. Однократный source skin perimeter вокруг authored facePolygon не расширяется повторным flood по волосам.

Независимый actual renderer probe `review-fine-face-guard-v27.mjs` использует текущие approved PNG и настоящие sourceActorFrame/loadSourceActor/drawSourceAvatarCanvas: оба пола,4 направления, idle+все4run phases; skin0/3, hair0/1/2/6/11, outfits0/6. Source anatomy probe берёт реальные opaque authored face pixels, rear ears отдельно по native flesh. Он сравнивает render с тем же выбранным skin tint, а не принудительно с нетонированным source.

Final stable hash во время probe совпал до/после:
-549060 faceRGBA comparisons,0 differences;
-537600 lower-leg pixel comparisons при смене волос,0 differences;
-299146 выбранных purple-hair comparisons с raincoat и без,0 differences;
-18010 positive skin-tint changes: кожа действительно меняется, её настройка не отключена guard.

JSON `fine-face-guard-independent-review-v27.json`, log `fine-face-guard-independent-review-v27.log`. Это счётчики сопоставлений по комбинациям, не число уникальных pixels.

Независимый узкий suite:
`node --test game/tests/head-items-native-v28.test.mjs game/tests/hairstyle-native-v27.test.mjs`
**14/14 PASS**, exit0, лог `hair-guard-independent-targeted-v27.log`. Он сохраняет historical original-source flesh/ear probes через explicit animationId и отдельно проверяет все12 hairstyles на current approved face polygons, реальные глаза, rear neck alpha, alpha safety edge, rear/side glasses, beast ears, coat alpha islands, badge depth, фактический fine jaw/body outline и raincoat mouth pixel. Hair-colour regression сравнивает полные body/hands ниже authored neck обоих полов во всех4directions×4runphases.

## Контракт metadata

Read-only проверены все40 C/L frames: head bbox integer, ordered и в48×64, eye/neck landmarks finite и вcanvas, eyeLine соответствует eyeAnchor.y.50 nonempty face/scalp polygons содержат740 finite in-canvas points. Up не получает выдуманный face polygon: задние ears проверяются отдельно. Fine96×128 factor2 остаётся единым; head metadata не меняет геометрию ног или source transforms. C SHA `9744e32229dd06b998aeb5811871c812188cdc6e7002c97f9ca3632435cfe415`, L SHA `3736a50b9fc041baf97137212d3ab486bc7f134e7aaf1c6cc22437ab2f2d3007` сохранены.

Ordinary legacy walk и другие source actions остаются прежними рисунками, как уже явно зафиксировано scope locomotion compatibility. Приёмка всех legacy actions или всей новой layered wardrobe здесь не заявляется.
