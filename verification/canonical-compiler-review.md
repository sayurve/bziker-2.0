# Независимая проверка canonical-idle compiler

Статус: подтверждённые ниже P1/P2 исправлены. Повторная проверка и текущие результаты — `canonical-compiler-fixes.md`, `canonical-compiler-review-after.json`. Ниже сохранён исходный review до исправления.

Проверены `game/scripts/build-canonical-idle.mjs`, `game/tests/canonical-export.test.mjs`, actual male/female specs, loader status gates и source runtime tests. Compiler/generated module/PNG в проекте не изменены. Воспроизведения выполнялись в `os.tmpdir()` с копиями оригинальных masters и удалением временной папки после проверки. Браузер и новая художественная приёмка здесь не выполнялись.

## Подтверждённые замечания

**P1 — ошибка сборки частично заменяет ресурсы действующего approved actor.** PNG пишутся внутри цикла направлений (build-canonical-idle.mjs:47), до проверки всех следующих исходников и до чтения старого module/provenance. Воспроизведение: успешная сборка в temp, затем down.sourceAnchor.x +=20 и up.sourceAnchor.y=1e6. Второй build бросает `Authored root lies outside master up`. Старый approved module остаётся byte-identical (`092fce…`), но male-down.png меняется с`e1f867…` на`ef0c99…`. Старые данные указывают уже на новый незавершённый набор. Аналогично module пишется раньше чтения существующего provenance JSON. Нужны предварительная подготовка/валидация всех исходников и существующих metadata плюс транзакционная установка подготовленного набора с восстановлением старого при ошибке записи. Regression должен сравнить bytes всех старых PNG, module и provenance после поздней ошибки.

**P2 — valid sourceAnchor не гарантирует, что весь персонаж попадает в холст.** Проверяется только нахождение точки опоры внутри master (строка39). Воспроизведение: male down.sourceAnchor.y -=200. Compiler успешно выдаёт approved export, хотя видимая нижняя часть пересекает границу coarse y64 и ботинки обрезаны. Вычислять alpha bounds допустимо для проверки (без подгонки/масштабирования): применить заданную uniform transform ко всем ненулевым alpha bounds и отклонить выход за48×64/96×128. Regression должен требовать отклонение полностью валидной внутри master опоры, которая обрезает фигуру, и сохранение действующих exports.

Доказательства: `verification/canonical-compiler-review.mjs`, `.json`, `.txt`. Скрипт самостоятельно воспроизводит оба случая и считает геометрию реальных8 masters. Во всех текущих реальных8 master projected alpha bounds остаются внутри96×128; текущая регистрация не требует автоматического fit.

## Что проверено успешно

- `canonical-export.test.mjs`:3/3 PASS (`canonical-compiler-tests.txt`). Проверки merge двух моделей и сохранения provenance действительно сравнивают первый actor до/после, а не просто число ключей.
- Общая native/motion/head/canonical целевая регрессия141/141 PASS (`world-gait-continuity-regression.txt`).
- Preload и выбор canonical idle используют один gate: approved + artReview.checked===true + непустые строковые evidence. Draft/unreviewed не скачиваются и остаются на legacy fallback. Реальный female draft сосуществует с male approved; production data не подменялись.
- Compiler берёт общий authored uniformScale, постоянные canvas/anchor и целое master image. Не применяет per-frame silhouette fit, отражение или перестановку частей тела. Hash исходников и output записывается; первый actor сохраняется при добавлении второго.

## Содержательность тестов

Положительный тест exports сейчас преимущественно проверяет возвращённые размеры/metadata, объявленные самим compiler, и единичность scale. Это подтверждает контракт, но не доказывает регистрацию реальных пикселей. Дополнить независимыми проверками: декодировать реальные PNG и сравнить размеры с фиксированными48×64/96×128; проверить полный ненулевой alpha внутри холста; отметить реальные head/ground landmarks по authored spec и проверить совпадение с заданным root без per-pose fit. Existing runtime test сравнивает decoded image dimensions с resource.width/height — дополнительно нужны фиксированные константы, чтобы одинаково неверные PNG+metadata не проходили.

Художественное соответствие, глаза/голова и отсутствие торса в portrait уже проверяются отдельными native pixel guards; это полезные feature-проверки, их следует сохранить отдельно от compiler unit tests.
