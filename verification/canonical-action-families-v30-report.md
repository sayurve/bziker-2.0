# Канонические цельные семейства действий v30 — промежуточный freeze HAND/LOWER

Подключены HAND и LOWER-REACH, 2 модели ×4 направления ×4 кадра ×2 семейства =64 ссылки на позы. LOWER0 точно ссылается на HAND0, LOWER3 — на HAND1: 48 уникальных новых native тел, 96 runtime PNG (48×64 и96×128). Утверждение относится к новым полным телам; это не редактируемый послойный мастер и не одобрение всего гардероба.

## Художественное основание и происхождение

Root просмотрел восемь HAND контактов и два LOWER контакта. Receipts: `canonical-hand-art-review-v30.md`, `canonical-hand-root-receipt-v30.json`, `canonical-lower-reach-art-review-v30.md`, `canonical-lower-reach-root-receipt-v30.json`. Raw sheet, точные image_gen prompts и source paths сохранены в art/drafts/canonical-actions-v30. Мужской LOWER right B/C берутся из исходного v29 пилота; самостоятельные стоящие A/D пилота отвергнуты и не подключены.

Один заданный uniform scale, авторские foot-root/neck/palm, общий холст и anchor. Голова — точный alpha donor выбранного пола/ракурса, только целочисленный перенос. Никакого bbox fit, XY stretch или перестановки полос конечностей. Проверка source alpha>=128 до растеризации обнаруживает clipping; 16 новых B/C полностью помещаются. На 16 новых B/C вручную отмечены pelvis по фактической границе coat/pants; source передаёт pelvis в customization, координаты проверены по opaque body. Точки ладоней проверены по реальным непрозрачным пикселям; исправлены три первоначальные метки на тёмном контуре/пустом фоне без изменения PNG.

Установщик сначала валидирует review, все модели/кадры, metadata, SHA и фактически декодирует все байты. Только после полной проверки пишет артефакты; invalid anchor и missing later PNG оставляют прежние файлы нетронутыми. PNG копируются побайтно, повторно не растеризуются; exact shared pose ресурсы дедуплицированы. Existing sparse seated compatibility сохранена; C/L и actor-sprite не изменены этой интеграцией.

## Runtime scope

Стоящие eat/drink/smoke/throw используют HAND; pickup/pet/feed/water/putdown используют LOWER; carry/holding используют общую chest/hold стойку. Конечный actionProgress выбирает тело и его hand из одного кадра. Телефон стоя остаётся точным статичным C idle; сидящий телефон остаётся сидящим. Run с мусором продолжает L, не становится статичным HAND. UP chest/mouth используют behind-body, осознанно скрытые ладони обозначены occluded; не выдумывается видимая кисть. Root отдельно подключил старт полёта мусора к HAND release hand.

Future normal API door/leash покрыты HAND; crouch — настоящий LOWER squat. Jump/sleep/wave не имеют нового соответствующего тела и остаются явным legacy fallback. Фактический world.js:381 передаёт timed8 +pet, pose idle/sit/phone/smoke; world.py:1125 допускает activity phone/sit/stand, переход sit/stand мгновенный, клипа перехода пока нет. Legacy explicit animationId/sourceAction архивы сохранены. Legacy walk пока прежний. SEATED/WATER новое wholebody семейство ещё ожидается; существующее сидение и вода пока legacy-body compatibility.

## Проверки и оставшееся

- `canonical-family-integrated-v30-green.log`:21/21 PASS (RED→GREEN consumer, прогресс/phase, draft gates, behind-body реальные пиксели, phone/seated, установка, source alpha и exact donor).
- `canonical-family-pelvis-v30-green.log`:13/13 PASS после добавления pelvis/forwarding.
- `canonical-family-production-v30-green.log`:3/3 PASS:64 production references/96 PNG реально декодированы и preload, shared bodies/head/attachments точны, actual customization render.
- `canonical-family-source-regressions-v30.log`:58/58 PASS — source/head/hair/phone/motion/water regressions. Полный suite и браузер выполняет root.
- Actual runtime drawSourceAvatarCanvas контакты: `canonical-families-{male,female}-{default,custom}-runtime-v30.png`; просмотрены оба default и female custom через view_image.

Подтверждён новый garb discontinuity: outfit6 желтая куртка в LOWER B перекрашена частично, LOWER C остаётся серой из-за старого fixed garment row ROI. Передано владельцу actor-sprite; гардероб не объявлен принятым. Native тела и лица сами по себе одобрены. Физический телефон и браузер в этой подзадаче не проверялись.

## Контрольные SHA256

- `game/web/source-actors.js`: `0015926d8e97e893a410c3a9a3cb1ce5a9584e8da3ce46962301e4f777c00d13`
- `game/web/interaction-actors-data.js`: `763c8dbb3f172dd658b091cdfc003f221eeb14bb9cfb8cc32a5dd47489e9d592`
- `game/web/canonical-actors-data.js`: `1a5b8a8dd84fd7714c36a88858dd9147c0cbd53c105356d220988883daa25233`
- `game/web/locomotion-actors-data.js`: `8b8985bba1a668c2d8fdcbbe4563d3b41726f658883bdb7557771968d24cfe48`
- `game/web/actor-sprite.js`: `3e3f06a1b01ac0ebe6c7a67568dfcb9ce1783a7cf753f5c141860c2ccabfb527`
