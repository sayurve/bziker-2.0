# Бзикер 2.0 Implementation Plan

> Реализация в текущем диалоге; пользователь поручил выполнить работы самостоятельно. Дизайн — ARCHITECTURE.md и предыдущий ответ о послойных персонажах.

**Goal:** создать переносимый рабочий проект и применимые навыки с реализованным единым контроллером поз и одежды.

**Architecture:** существующая серверная игра сохраняется в `game/`. Новый модуль персонажа проверяет модель/позы/слои до загрузки, один раз выбирает фазу и атомарно применяет её ко всем слоям; старые полные позы имеют явный режим совместимости. Черновые изображения не проходят в production как одобренные.

**Tech Stack:** Phaser 4.2.1, JavaScript ESM, Python 3, JSON, отдельные PNG.

## Текущий план v32 — ограниченный результат static H7 выбранной женщины

План v30/v31 ниже — неизменённая история. Для v32 исходное maleH7/skin3 предположение отвергнуто фактическим UI и отдельной QA-копией: **femaleH7/white6/skin7/lime8/shirtStyle2**, [точные параметры](../verification/static-hair-v32/actual-selected-avatar.json), [UI](../verification/static-hair-v32/actual-selected-female-h7.txt). Другие причёски в этом визуальном проходе не выбирались; профиль пользователя не менялся. QA8798 — отдельная `/tmp`-копия; основная 8797 перезагружена на a637 и [просмотрена root](../verification/static-hair-v32/main-latest-game.jpg). После QA временные вкладка/сервер 8798 закрыты;8797 продолжает работать. Свод — [FINAL-RESULT](../verification/static-hair-v32/FINAL-RESULT.md), [JSON](../verification/static-hair-v32/FINAL-RESULT.json).

- [x] Сохранить 72 isolated-* как **женский baseline до female-исправления**, не как финальный after. Не стирать первый неуспешный full: [initial-full-result](../verification/static-hair-v32/initial-full-result.json), Node954/952PASS/2FAIL в [initial-full-node](../verification/static-hair-v32/initial-full-node.log).
- [x] Применить к H7 обеих моделей собственную постоянную C-голову/волосы по направлению, сохранить настоящие L-корни/тело/конечности. Исправить реальный authored face-polygon пиксель без ослабления RGBA; другие стили сохраняют прежнюю L authority. [Native отчёт](../verification/static-head-female-v32-report.md); sourcea637 в [финальном freeze](../verification/static-hair-v32/final-run-freeze.json).
- [x] Стабилизировать renderer texture canvas `93fabca…` и camera pixel-опору `44254ed…` без texture churn от дробной позиции. Не называть синтетический allocation-тест измерением FPS устройства. [Диагностика/план](STATIC_HAIR_V32.md).
- [x] Сохранить для body-prop fallback исходный L `sourceHead||head`, не новый rendered C bbox. Actual native regression проверяет 32 moving-trash позы и истинную ладонь female DOWN1; [финальные 26/26](../verification/static-head-held-prop-v32-green.log). Голова a637 не меняется относительно UI-съёмки 0826; UI-кадры не переименовывать в новую after-fix проверку предмета.
- [x] Получить root+independent VIEW четырёх полных женских контактов из 72 реальных UI-снимков: 53 moving/19 transition-idle; [обзор](../verification/static-hair-v32/independent-ui-review.md), [receipt](../verification/static-hair-v32/independent-ui-review.json). Не заявлять индивидуальный просмотр 72 полных viewport или непрерывное отсутствие вибрации. [actual-female-gait.webp](../verification/static-hair-v32/actual-female-gait.webp) — анимированный контакт 26 кадров 560×380 из sampled screenshots, не GPU-видео.
- [x] Подтвердить свежий финальный a637 full **13 tools +353 Python +959 Node PASS, 0 fail/skip**, `2026-10-15T17: 33: 09.849036Z`; [результат](../verification/project-full.json), [команда](../verification/static-hair-v32/final-current-full-command.log), [точные SHA](../verification/static-hair-v32/final-run-freeze.json). Прежние v31 числа не объявлять v32 результатом.
- [ ] Отдельно подтвердить актуальный UI телефона этой женщины, если такой сценарий требуется: четыре gait-контакта его не доказывают. Физический телефон не проверен.
- [ ] Отдельно решить постановку/анатомию LEFT при необходимости нового рисунка: исходный L torso silhouette не перерисован, полноценный anatomy fix не заявлен.
- [ ] Сохранить открытые layered master/полный гардероб, непроверенные иные причёски и архивные sleep/jump/wave. Ограниченный static-H7 результат не закрывает всю игру/все настройки внешности.

## История v30/v31 — прежний мужской H7

Сводный ограниченный итог: [FINAL-RESULT](../verification/avatar-one-v31/FINAL-RESULT.md), [JSON](../verification/avatar-one-v31/FINAL-RESULT.json); остальные причёски/архивные действия и layered master им не одобряются.

Актуальный freeze a94/a101 завершает узкую правку proper pickup; более ранние результаты ниже сохранены с их версиями.

- [x] Подходить к реальной бумаге обычным L через проверенный свободный путь и серверное подтверждение прибытия до action; синхронизировать ground/held prop на контакте `.43`. Авторитетные collected IDs остаются собственными аккаунту/дню. Старые GET/move/action не возвращают вчерашнюю бумагу: [pickup stance](../verification/pickup-stance-v31-report.md), [независимый отчёт](../verification/pickup-independent-review-v31.md), [resolution](../verification/pickup-independent-resolution-v31.json).105/105 целевых, независимые 7/7 mount+5/5 server PASS.
- [x] Просмотреть root+independent четыре направления clear-route+DOWN recheck: 61 снимок/54 moving; финальные 18 bounded-throw и before+12 proper-pickup, 11 последующего throw. Сохранить точный scope/ограничения [gait](../verification/avatar-one-v31/independent-frozen-gait-inventory-review.json), [throw](../verification/avatar-one-v31/independent-frozen-throw-review.json), [pickup](../verification/avatar-one-v31/independent-pickup-stance-review.json); ordering-only guard проверен отдельно от UI-клипа.
- [x] Подтвердить реальный инвентарь rod1/trash1 после подбора и [rod1/trash0 после выбрасывания](../verification/avatar-one-v31/pickup-stance-final-inventory.jpg), перезагрузить текущий ONE H7 и просмотреть [последний дневной игровой кадр](../verification/avatar-one-v31/latest-game-one-preset.jpg). Новые стили/гендеры этим не принимать.
- [x] Подтвердить текущий полный прогон **13 tools +353 Python +941 Node PASS, 0 fail/skip**, timestamp `2026-10-15T16: 51: 37.520373Z`; [результат](../verification/project-full.json), [команда](../verification/avatar-one-v31-final-current-command.log), [handoff156](../verification/avatar-one-v31-latest-handoff.log), external/live-db false. Предыдущие суммы не переписывать как этот результат.


Этот раздел уточняет текущий scope; все прежние задачи и результаты ниже сохранены как история. Пользователь требует сначала закончить один образ: **male H7 «Хвост» / hairColor6 белый / skin3 / shirtColor8 лаймовый / shirtStyle2 / outfit0 / headwear0**, остальные defaults. Новые причёски/гендеры в текущую визуальную приёмку не включать.

- [x] Сохранить совместимые цельные C/L/A-позы и собственную идентичность выбранного персонажа при переходах idle, locomotion, standing/seated phone, HAND/LOWER/SEATED/WATER; UI и мир используют общий fine-рендер. Это compatibility raster, не готовый layered master. Контракт и SHA — [freeze v30](../verification/character-final-freeze-v30.md).
- [x] Исправить исходные неокрашенные fringe/temple/nape и LEFT dust этого H7; подтвердить точное сохранение остальных 12 283 пикселей. Существующий целевой регресс 53/53 PASS и 256 канонических native snapshots одного образа — [H7 review](../verification/h7-focused-v30/review.md). Не расширять эти результаты на все стили.
- [x] Устранить выбор старой фигуры обычной ходьбой: переиспользовать ту же одобренную L-последовательность, что и бег, с тактом вызывающей стороны. **Новый отдельный walk art не заявлять.**
- [x] Просмотреть в реальной игре выбранный H7 по [DOWN](../verification/avatar-one-v31/final-contact-down.png), [RIGHT](../verification/avatar-one-v31/final-contact-right.png), [UP](../verification/avatar-one-v31/final-contact-up.png), [LEFT](../verification/avatar-one-v31/final-contact-left.png) и [еде](../verification/avatar-one-v31/final-contact-eat.png), провести [независимое ревью снимков](../verification/avatar-one-v31/independent-ui-review.md). Сохранить ограничения: часть кадров уже idle после коллизии; начало/конец полного цикла еды этой записью не покрыты. Ограниченный фронтальный seated-drink пример не подтверждает все посадки и лодку.
- [x] Устранить ложный успех daily-repeat подбора: авторитетный `picked:false`, честное уведомление и отсутствие повторного action/sound forwarding. Технические 15/15 Python +9/9 actual-app PASS — [litter report](../verification/litter-result-v30-report.md); персонаж/дневные правила этим исправлением не менялись.
- [x] Подтвердить итоговый полный прогон замороженного world `66c1cb90…`: **13 tools +348 Python +934 Node PASS, 0 fail/skip**, timestamp `2026-10-15T16: 24: 04.635269Z`; [сохранённая история](../verification/character-final-freeze-v30.json), [команда](../verification/avatar-one-v31-final-frozen-command.log). [Handoff](../verification/avatar-one-v31-final-handoff.log): 156 маршрутов PASS, временная БД, external/live-db false. Это техническая проверка, не одобрение всей графики.
- [x] Исправить конечную синхронизацию человеческой ладони и исходной реакции питомца, получить реальные root-VIEWED [pet14](../verification/avatar-one-v31/retake-contact-pet.png), [pick24](../verification/avatar-one-v31/retake-contact-pick.png), [throw16](../verification/avatar-one-v31/retake-contact-throw.png) одного H7. Эти контакты сняты до следующего узкого bounds-фикса; [pet report](../verification/pet-contact-v31-report.md).
- [x] Исправить actual throw texture clipping стабильным envelope реальной траектории; RED2→GREEN11/11 и независимые 25/25 paper pixels у обоих bins — [throw report](../verification/throw-bounds-v31-report.md). Лицо/арт/масштаб этим не менять.
- [x] Завершить root+independent VIEW [18 финальных bounded-throw кадров](../verification/avatar-one-v31/frozen-throw-captures.json), [контакт](../verification/avatar-one-v31/frozen-contact-throw.png) и новый четырёхракурсный clear-route проход именно того же H7; завершение подтверждено отдельными receipts выше, а не только 934 тестами или предыдущими UI-кадрами. Конкретные ограничения независимого просмотра — [avatar-one-v31](../verification/avatar-one-v31/independent-ui-review.md).
- [ ] Отдельно подтвердить фактическую лодку/посадку и ещё не покрытые действия в браузере, затем физический телефон пользователя. Наличие WATER/SEATED ресурсов не является этим подтверждением.
- [ ] Сохранить архивные sleep/jump/wave как **визуально не одобренные**, пока не появятся настоящие согласованные тела/позы. Не выдавать старый body с новой головой или fallback HAND за завершённое новое действие.
- [ ] Завершить редактируемый layered master и реальные полные слои одежды/поз. Цельные compatibility-композиции и нынешняя ограниченная приёмка одного H7 этот пункт не закрывают; всей игры/всех волос/всего архива как готовых не заявлять.

## Ограничения

Исходный Bziker не менять. Только отдельная папка `Bzikert 2.0`. Без пользовательской БД и секретов. Проверка изображения не ограничивается успешной загрузкой. Смена одежды не меняет масштаб, положение, физику или фазу. Не создавать несуществующие графические результаты в отчётах.

## Задачи

- [x] Скопировать проверенную запускаемую игру в новую папку.
- [x] Перенести материалы и черновики с индексом происхождения и контрольными суммами: 331189 файлов библиотеки, 20 файлов черновиков; SHA-256 проверены с оригиналом и отдельно без него.
- [x] Создать три проектных навыка: сборка игры, подготовка персонажей, проверка качества; валидировать и провести независимую сценарную проверку. Навыки зарегистрированы в локальном Codex.
- [x] Реализовать валидатор модели и одежды, единый контроллер фаз, атомарный адаптер Phaser и загрузчик PNG; регрессионные тесты атомарности, направления, остановки, смены одежды и перехода сцен.
- [x] Подключить общий такт движения к действующей игре/животным и сделать лабораторию CharacterController/PhaserCharacterView в настоящем Phaser. Полный новый wardrobe-renderer в городе ожидает реально одобренные послойные ресурсы.
- [x] Добавить переносимые команды запуска и общей проверки, инструкции передачи и явный список незавершённого арта.
- [x] Проверить исходные тесты игры, новые модули, браузер и окно шириной 390 px; провести независимое ревью и исправить найденные ошибки. Физический телефон отдельно не проверен.
- [ ] Нарисовать и художественно проверить редактируемые послойные мастера, настоящие комплекты одежды и все их действия; после этого подключить их к обычному городу. Отдельные неодобренные генерации и legacy-composite этот пункт не закрывают.

## Контракт модулей

`game/web/character-system/definition.js`: `validateCharacterDefinition(value)` возвращает проверенное определение или бросает ошибку; `validateOutfit(definition, outfit)` требует полное покрытие всех поз модели и совместимость модели. Холст/якорь/слои/позы/attachment points явные.

`game/web/character-system/controller.js`: контроллер выбирает один `{action,direction,frameIndex,poseKey}`; `setOutfit` сначала проверяет весь набор, сохраняет фазу; `setState` не перезапускает тот же clip каждый update; `advance` поддерживает время и пройденную дистанцию.

`game/web/character-system/phaser-view.js`: применяет snapshot одной транзакцией к набору Phaser Image в Container; все изображения имеют общую опору, индивидуальные clocks отсутствуют; release уничтожает только принадлежащие view GameObject.

Полный контракт data schema находится рядом с модулем и закрепляется тестами до подключения новых изображений. Лаборатория интегрирует legacy source pose через этот же единый snapshot, не выдумывая отсутствующие слои одежды. Город пока сохраняет существующий composite-renderer и использует общий безопасный такт дистанции.

## Свидетельства

`verification/project-full.json` и логи: 13 корневых, 328 Python- и 786 Node-тестов прошли. `verification/handoff-final.json`: 152 статических маршрута и запуск с временной БД прошли. Браузерные сценарии, исправление старта Phaser и границы проверки — `verification/browser-report.md`; независимое ревью — `verification/independent-review.md`; материалы — `verification/materials-report.md`.

Эти числа описывают предыдущие этапы. После перепланировки локаций: **13+344+806 PASS**,152 маршрута PASS; `verification/locations-v26-report.md`. После v28 idle/run и редактора: **13+345+840 PASS**,154 маршрута PASS; `verification/avatar-customization-v28-report.md`. Текущие v29 изменения лиц и взаимодействий требуют отдельного нового прогона; прежние логи их не подтверждают.


## Продолжение после аудита исходной папки

- [x] Сопоставить исходные карту и интерьерные материалы с реальными runtime-связями, отделить архивные референсы от предметов и действий. Отчёты: `verification/source-map-audit.md`, `verification/source-interior-audit.md`.
- [x] Исправить стыки существующего северного рельсового коридора, welcome approach и gazebo landmark; подтвердить связанными регрессионными проверками карты. После gazebo — 22 PASS в `source-map-gazebo-green.log`.
- [x] Исправить выявленные ошибки направления движения, перекраски волос/кожи/кистей и собственных часов питомца; 53 PASS в `source-motion-fixes-green.txt`.
- [x] Подключить настоящий имеющийся четырёхракурсный исходник кресла для `armchair`, сохранив физику/места и остальные подсистемы; целевые мебельные/интерьерные проверки — 30 PASS.
- [x] Экспортировать четыре новые мужские цельные idle-позы единым масштабом и авторскими root points, с ограниченной приёмкой compatibility scope. Layered-модель этим не создана.
- [x] Получить и независимо просмотреть четыре женских idle draft, сравнить raw/native с реальным женским run; записать FAIL в `verification/canonical-female-idle-art-review.md`.
- [x] Выполнить одну целевую image_gen итерацию женского down в отдельный `female-idle-down-v3.png`, сохранить исходные байты, промпт и metadata. Это только кандидат.
- [x] Довести женский idle/run compatibility-набор до общего с мужским стиля и согласованных пропорций; сравнить на одном масштабе и принять ограниченный scope настоящих поз. v27/v28: общая native alpha-голова, собственные более низкие/узкие женские тела, 80 отдельных runtime PNG; `verification/locomotion-final-review-v27.md`. Остальные legacy-действия и полный layered master этим не закрыты.
- [ ] Завершить настоящие редактируемые послойные мастера и полное покрытие одежды/действий; цельные compatibility idle не закрывают этот пункт.
- [ ] Отдельно решить графические пробелы TV/тумбы/кровати/торшера/ковра, статусы старой мебели и подтверждённый gap игровых object actions казино. Наличие рисунка рулетки не означает поручения реализовать новую мини-игру.
- [x] Проверить исторический этап полным регрессом и перечисленными браузерными сценариями idle↔run:13+328+786 PASS,152 HTTP-маршрута PASS; verification/rework-current.md. Это свидетельство соответствующего этапа, а не проверка всех последующих изменений.
- [ ] Подтвердить физический телефон и оставшийся художественный охват; технический PASS не заменяет их.

## Локации: компоновка и визуальные дефекты

- [x] Составить проверяемый список публичных комнат, наружных точек и исходных папок: `docs/LOCATIONS.md`, `verification/location-catalog.json`.
- [x] Перепланировать10 публичных комнат отдельными модулями; сохранить городские двери, сервисныеID и исходные места казино/бара. Повторно проверить вокзал.
- [x] Проверить реальные опоры, проходы и доступность мест серверным BFS; сохранить доказательства shops/community/casino-bar.
- [x] Исправить физическое соответствие боковых стен, светильники бара, коврик одежды, native-повтор деревянных полов, публичную камеру и фон за пределами комнаты.
- [x] Войти в каждую из11комнат черезUI; снять wide/mobile кадры. Выполнить дополнительную посадку/магазинный сценарий. Полный регресс13+344+806 и152маршрута PASS.
- [x] Декодировать3 выбранных видео целиком и просмотреть212образцов/10листов раскадровки; не выдавать их за просмотр всех роликов или неизвестного общего видеотура.
- [ ] Новые native-продуктовые гондолы/холодильники, недостающие мебельные ракурсы, общая художественная приёмка и полный layered-персонаж остаются открытыми.
