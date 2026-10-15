# Community interiors: arena, results, clans, terrace

ПрофильВ. Реализация отдельного `game/scripts/interior_plans/community.py` и собственных Python/Node tests. Основной generator/map/world не редактировались на этапе планировок; root подключил общий API и сгенерировал map. Отдельное последующее разрешение: изменён только side-registration блок `Room.fit_visual_shell` и соответствующие tests. Original Bziker, raw PNG, canonical actor data, existing feature endpoints не изменены. Браузер ведёт root.

## Материалы и диагноз

Просмотрены сохранённые полные PNG `ТЦ_Бзик_хаб/Интерьер/основной.png` и `Бар_Пивковый_туз/Интерьер/основной.png`, реальные native side panels и актуальные renders. Прочитаны hub/bar prompts и промпты native table/sofa/wood office chair. Происхождение: `materials/Bziker/01_Окружение/Здания/…`; рабочие sprite aliases проверены по `design-data.js`, фактическим файлам и renderer.

Полная схема Room изучена: поверхности, material regions, physical solids, staff feet, counter/action, seats/approaches, details, featureIDs, circulation. Старые arena/results содержали один и тот же набор5 props и0seats на1444×520world. Референс hub задаёт собранные задние игровые ниши, центральную ось и периферийные группы; это не основание накладывать целый PNG на комнату. У clans/terrace отдельных complete-room исходников нет: используются реальные самостоятельные clan furniture PNG, а не полный bar screenshot.

## Реализованные помещения

- **arena:** service/statue со старым `games`, две rear battle dioramas, две реальные двухместные spectator sofas, растения, lights/entry details.7props,4seats, playable1062.1×340.
- **results:** отдельный native computer terminal со старым `results`, trophy/hologram/archive, две gallery sofas; battle diorama clone исключён.8props,4seats, playable934.7×280. Содержимое рейтинга открывает существующий UI; статичная мебель не выдаётся за новый live leaderboard.
- **clans:** reception со старым `clans`, рабочий terminal+seat, management hologram, archive, conference table с4chairs, waiting sofa.13props,7seats, playable927.7×440.
- **terrace:** creative work/discussion groups на двух wooden tables с8 настоящими wood office chairs, reading bookcase и двухместная sofa; старый `messages`.15props,10seats, playable909.6×440. Это рабочие группы для обсуждения идей, без вымышленных dining/cooking действий.

Один80-unit actor canvas, native sprite aspect, общий central corridor120. Все сиденья получают real directional front/down или back/up PNG и собственные approaches; props, seats и solids связаны через настоящий Room API. `build(s)` очищает только content, сохраняет shell и возвращаетFalse для чужих roomIDs. `FLOOR_HEIGHTS` задаёт roomID значения500/440/540/540. Station plan не переписывался.

## Проверка интегрированной карты

`community-plans-green.txt`:5/5 Python PASS, включаяactual map, full radius14 BFS и deep comparison всего gameplay до/после shared visual fit. `community-integrated-bfs.json`:33/33targets (clans9,arena6,results6,terrace12), clear spawn/exit/service/seat approaches.

`community-plans-node.txt`:14/14PASS. Новые3 Node scenarios проверяют реальные service featureIDs, выбор каждого seat из его approach и исключение занятого места, сохранение position/facing/bench_id и настоящего seated phone clip для обоих полов. Дополнительно source furniture/native views/bindings.

`community-interior-regression-python.txt`:4/4PASS из`game/` — действительные серверные seats/phone timer, support collisions, room ownership и сохранение профиля для всех11комнат. Первоначальный ошибочный запуск из project root исправлен; актуальный лог — успешный запуск изgame.

Actual candidate и integrated PNG получены через `drawInteriorGround`, `interiorObjects`, `drawAvatar`, `interiorSeatedActor` и реальные PNG, без замены на схемы. Файл `render-community-interiors.mjs` читает фактический map; в каждой комнате4actors (spawn/service,2seated,второйсphone). `community-interiors-integrated/contact.png` просмотрен черезview_image, также отдельно clans/terrace. Эти renders до последующего side-wall исправления сохранены как baseline; финальный sidefix render будет указан ниже.

Старые shared tests с depth>=500, seats=[] и frozen fullcontents больше не соответствуют новым явно порученным layouts; их общий пересмотр ведётroot. Проверка маршрутной функциональности не заменяется просто новым количеством props.

## Арт и масштаб

Изменена компоновка существующих ресурсов. Новая raster art не создавалась. Coupledseat/phone логика и размеры подтверждены, но старые legacy seated/daily artwork не объявляются заново нарисованными в новом idle стиле. Подтверждённый ранее дефект картины/старого арта этой задачей не исправлялся. Layered wardrobe, художественная полнота всех действий, физический телефон и весь browser coverage этим отчётом не подтверждаются.

## Follow-up: public spawn framing

Root отдельно разрешил `game/web/world-camera.js`. Публичные комнаты сvalidsceneBounds теперь ограничивают прежнийrequestedscale высотой реальнойвидимойоболочки над114pxcontrols. Дискретизация вниз к1/(2*dpr), низкое окно сохраняетminimum0.5 и pan. Город/частнаябаза безsceneBounds получают прежние точные значения. Bounds дополнены настоящими wall_cutawayregions и authoredvisualfixturebounds; координаты мира и props/seat physics не меняются.

`interior-spawn-framing-red.txt`:2/4FAIL на старой камере — реальные11rooms обрезают верх, fixture/cutaway extents не входятвframe. `interior-spawn-framing-green.txt`:12/12PASS (дофинальногоsidefixregen), actual11rooms×390×798/1204×880×DPR1/2, roof/fixture envelope надcontrols, boundedtinyviewportpan и зафиксированные city/baseoutputs. Видимость проверяет вертикальную область; на узком экране сохраняется горизонтальное перемещение по широкой комнате.

Lifecycle reload test раньше жёсткотребовалscale>=1. При новомявномminimum0.5 он теперьпроверяет actualenvelope надcontrols иminimum0.5; roomidentity и отправка movement request сохранены.

## Финальная проверка после общей регенерации

Повторно прочитан фактический `game/web/interiors-map.json`:0полных left/right perspective surfaces. Свежий целевой запуск — **21/21 Node PASS** (`community-final-integrated-node.txt`) и **5/5 Python PASS** (`community-final-integrated-python.txt`). В него входят actualpixel perimeter, native rear176, public framing всех11rooms, прежние city/basecamera outputs, community service/seat/phone bindings и BFS. Полный suite параллельно проверяетroot; здесь он повторно не запускался.

Обновлённый `community-integrated-bfs.json`: **33/33targets**, всеclear, radius14/step6:clans9/9,arena6/6,results6/6,terrace12/12.

Свежие `community-interiors-integrated/contact.png`, `clans-spawn-390.png` и `arena-spawn-1204.png` фактически просмотрены черезview_image. Задние стены иfixtures видимы по высоте над114pxрезервомcontrols; боковые cutaway совпадают с прямоугольной физической границей, оторванных perspectiveпанелей нет. В390pxviewport широкаякомната закономерно остаётся с горизонтальнымpan. Этоactual renderer Canvas projection из текущейкарты; настоящий браузер и полныйsuite находятся в отдельной проверкеroot. Послеfreeze в этой финальнойпроверке runtime/generator/map не изменялись.
