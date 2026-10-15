# Locomotion / standing compatibility v27 — финальный независимый обзор

Профиль В. Исходный соседний Bziker не менялся. Браузер и полный suite выполняет root; здесь actual native PNG decoding, реальные sourceActorFrame/loadSourceActor/drawSourceAvatarCanvas и целевые regressions. Это whole-pose compatibility и производные alpha head/body, не полный editable character master и не одобренный весь гардероб.

## Что установлено и просмотрено

В runtime установлены2 approved модели ×4 направления idle и run.32 полных run poses имеют64 отдельных coarse48×64/fine96×128 PNG;8 idle poses —16 PNG. Общий source canvas48×64/anchor24,63 и fine96×128/anchor48,126. Разрешение canvas, anchor и uniform transform не меняются по фазам. Все40 фактических опорных boot bounds заканчиваются наfiney125. Production data прошли проверку status approved + checked evidence; empty/draft/unreviewed/malformed fixtures по-прежнему fallback и не грузятся.

Просмотрены через view_image: male-v2/female-v3 native composed side contacts, общий `locomotion-gender-native-head-contact-v27.png`, native front/back двух полов, отвергнутый старый female standing contact и новый `standing-idle-shared-head-v2-v27.png`. Root отдельно визуально одобрил новые side, front/back и standing composites с ограниченным scope, свидетельства — `locomotion-side-art-review-v27.md`, `locomotion-frontback-art-review-v27.md`, `canonical-shared-head-art-review-v27.md`.

Read-only actual runtime proof — `locomotion-runtime-idle-run-hair-v27.png`: same2xzoom, оба пола/4 направления, idle/run0, H0 и выбранный female H6. JSON `locomotion-final-runtime-audit-v27.json` содержит80 уникальных реально decoded PNG requests, ids, anchors, metadata, raster extents и source hashes. H0 в UI называется «Короткая» и теперь буквально использует общий короткий native male alpha-head обоих полов. Старые female длинные волосы не baked в этот H0. H6 «Длинные» — настоящий выбираемый overlay; одинаковый hair API сохранён. Customization quality всех12 вариантов отдельно проверяет hair agent; данный просмотр не одобряет все его варианты автоматически.

## Происхождение и метод

Side malev2 sheets: original generation `exec-c3b67b16-3bed-4d5a-b526-d7e78449847d.png` right, `exec-af38f610-e54c-4144-8bc2-708c1c66f78c.png` left. Femalev3 EDIT matching sheets: `exec-7590471c-16ab-4eaf-a991-9179dd86b0fa.png` right, `exec-1631a5a5-a87d-475d-aef1-8b098b09d907.png` left. Их byte-identical preserved sheets/master cells и sourcePath/SHA стоят в `art/drafts/locomotion-v27/{male-*-v2,female-*-v3}/export-spec-and-evidence.json`. Мужские exact prompt-info отсутствуют; это явно записанный provenance gap, текст не выдуман. Female exact prompts сохранены root рядом.

Экспорт side — один body scale male.2125/female.20, authored sourceRoot/neck, без bbox fitting, XY stretch, mirrored phases, limb-strip movement. Near/far pants/shoe masks пересекаются с реальным source alpha, сохраняют всю alpha и меняют только RGB глубины существующих целых конечностей. A near leg front/C back, B near support/D near raised; near arms opposite A/C. Никакие clocks конечностей не переставлены.

Male front/back и female down — реальные D native run bodies; source atlas/rect и body/head registration сохранены в `*-frontback-shared-head/evidence.json` и generated L provenance. Female up заменён настоящим новым image_gen EDIT native male4poses: raw `female-up-v2/sheet.png`, exact prompt-info, реальные1086×1448/cells543×724, один authored body scale .170. Четыре sourceRoot/neck записаны вручную; alpha/limb geometry и lower-body RGBA после uniform export сохраняются. Свидетельство последней приёмки — `female-up-v2-art-review-v27.md`. Detached flesh кистей защищены при удалении connected hair material. Старый короткий female native rear body больше не используется в runtime run.

Idle female — реальные root image_gen EDIT мужских standing masters, raw и exact prompts в `art/drafts/canonical-idle-v27/`; male — прежние `canonical-idle-v2/male-idle-*.png`. На модель один fine body scale .10625/.100; source roots/neck явно записаны. Новый female-left actual boot contact авторски зарегистрирован уrawy1229. Результат male111/112/112/111px, female107/108/108/107: везде ровно4px ниже, собственная narrower waist, обе ноги на земле и руки вниз. Source PNG сохранены без правок. Производные и полный provenance — `standing-idle-shared-head-v2/evidence.json` и C sequences.

Голова каждого направления — одна настоящая alpha часть native male D.run0, сохранённая1:1 во всех idle/run кадрах обоих полов. Generated/native прежняя голова удаляется alpha mask с curved neck boundary, donor прикладывается integer neck translation. Реальные opaque RGBA лица/волос не масштабируются. Половинные coarse eye/neck landmarks сохраняют точность fine; coarse head bbox округлён наружу до integer rows/columns, что необходимо существующему portrait crop loop. Это metadata, не нормализация рисунка.

Воспроизводящие scripts сохранены в verification: `export-locomotion-draft-v27.mjs`, `shade-locomotion-material-draft-v27.mjs`, `compose-locomotion-native-head-draft-v27.mjs`, `compose-female-native-frontback-candidate-v27.mjs`, `export-standing-shared-head-v27.mjs`; установщики `install-reviewed-locomotion-v27.mjs`, `install-reviewed-standing-idle-v27.mjs` читают сохранённые реальные PNG и метаданные.

## Выполненные проверки

`locomotion-final-targeted-v27.log`:47/47 Node PASS после female rear-body repair, включая saved RED→GREEN height/hop regression. В том числе реальные decoded PNG размеры/alpha/ground,4 разные authored poses, exact opaque donor RGBA на обоих полах во всех idle/run направлениях/фазах, actual lower-body RGBA/geometry preservation, integer crop bounds, approved/fallback/preload gates, portraits/face-free, движение60/120/240Hz, remote1sec polls, stop/arrival/teleport/scene transfer. Новые production и shared-idle tests имеют сохранённые RED logs до установки и GREEN после.

`locomotion-final-manifest-v27.json`:80/80 текущих approved PNG реально decoded через loadSourceActor; размеры и declared SHA256 каждого совпадают. Дополнительная матрица после финального UP не переснималась по поручению root.

`locomotion-assets-http-v27.log`:1/1 Python PASS — alias JS, truePNG bytes/MIME и закрытый unrelated/traversal path. Отдельно historical additional50 tests дали48PASS и2 stale fixed native-hair pixel probes; их передали hair agent для сохранения original source fixture через explicit animationId и проверки current approved head по metadata. Runtime actor-sprite этим агентом не менялся. Root выполняет final fullNode после hair freeze.

## Закрытый rear-body дефект и граница приёмки

Независимый actual runtime обзор подтвердил female native rear run height102–103px против нового femaleidle108 и male-uprun115. Headtop при старте опускался на5–6finepx. Это была реальная короткая исходная rear body, не clock reset или bbox resizing. Root отклонил такой переход и создал настоящий image_gen EDIT четырёх male rear poses с более узкой женской body; источник, промпт, прозрачный reference и4full PNG сохранены. Новая female-up-v2 даёт110px во всех4 фазах, supporty125, одна headRGBA. Теперь женщина на5pxнижеmale115, а при старте head поднимается на2px относительноidle108. Старое неприемлемое body не маскируется сдвигом головы или neck stretch; оно заменено реальным новым рисунком. Root просмотрел final native contact и одобрил ограниченный run-up scope. Height regression RED→GREEN сохранён.

Обычный legacy walk и другие source actions сохраняют прежние рисунки и не получили shared-head/style approval. World использует настоящий run; бег на ходьбу не заменён. Готовность всех legacy действий/всего wardrobe/физического телефона не заявляется. Все12 hair variants и браузерный итог дополнительно проверяют hair agent/root; здесь исходные80PNG, actual renderer contact и перечисленные47 targeted tests.

## Freeze hashes

- source-actors.js: `e335bd0224fc2cc01f6dd8f1c646c55bf98252066854cddcab018e46b0f3bdb8`
- canonical-actors-data.js: `9744e32229dd06b998aeb5811871c812188cdc6e7002c97f9ca3632435cfe415`
- locomotion-actors-data.js: `3736a50b9fc041baf97137212d3ab486bc7f134e7aaf1c6cc22437ab2f2d3007`
- actor-sprite.js (hair agent): `685e6d9a77feb1d746b689c3072b5373dbe33667d3d0108b6e0773bcc9100531`

These hashes are the reviewed read-only baseline; later approved art iteration must record new hashes.


Для воспроизводимости финального состояния install order: side/native frontback `install-reviewed-locomotion-v27.mjs`, standing `install-reviewed-standing-idle-v27.mjs`, затем narrow final rear replacement `install-reviewed-female-up-v2-v27.mjs`. Последний шаг обязателен: initial native rear candidate сохранён только как исторический draft/review evidence. Hair agent current hash в manifest указан отдельно; этот агент actor-sprite.js не менял.

Последний hair-agent freeze: actor-sprite.js685e6d9… независимо проверен после ранее снятых runtime contacts:14/14 hair/head-items и отдельный face/skin/raincoat/legs probe PASS, см. `depth-face-guard-independent-review-v27.md`. Runtime contact/JSON с более ранними hashes являются явно историческим raster evidence; current80PNG manifest повторно decoded и записан с текущим685e6d9hash, без новой матрицы.
