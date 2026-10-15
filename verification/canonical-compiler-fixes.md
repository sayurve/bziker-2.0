# Canonical compiler: два исправления

Изменены только `game/scripts/build-canonical-idle.mjs`, `game/tests/canonical-export.test.mjs` и diagnostic/report в `verification/`. Реальные master PNG, generated module, production exports, manifests/artReview не изменялись. Сборки для проверки выполнялись только во временных каталогах. Original Bziker не изменялся. Браузерную проверку выполняет root отдельно.

## Итог

1. PNG, module и provenance сначала полностью подготавливаются в памяти. Все четыре исходника, authored anchors, coverage, head metadata и существующие module/provenance проходят проверку до установки файлов. Затем весь набор bytes и резервные копии записываются в отдельный staging-каталог. Ошибка установки возвращает заменённые старые файлы и удаляет новые файлы незавершённой модели. Staging удаляется после успешной операции или успешного отката. При невозможности отката compiler сообщает AggregateError и сохраняет резервные копии. Гарантия относится к обработанным ошибкам вызова, не к аварийному завершению процесса посреди нескольких файловых rename.

2. Перед экспортом измеряются bounds только исходных пикселей с alpha>=128. Они проходят через заданные authored scale/anchor; выход за фиксированный canvas отклоняется. Измерение используется исключительно для reject: оно не подгоняет картинку, не меняет масштаб/опору, не обрезает/нормализует исходник. Pixel alpha127 вне canvas не вызывает reject, alpha128 вызывает. Общая uniformScale, coarse48×64/fine96×128 и опора24,63/48,126 сохранены.

Merge двух моделей сохранён; проверяются прежний actor, его provenance и PNG bytes после добавления второго. Никаких новых статусов approval не установлено.

## RED → GREEN

- `canonical-compiler-fixes-red.txt`:4 PASS /3 FAIL на исходном compiler. Провалы: прежние PNG менялись после поздней ошибки; clipping принимался; alpha128 clipping принимался.
- `canonical-compiler-fixes-green.txt`:8/8 PASS на исправленном compiler.
- `canonical-compiler-targeted.txt`:41/41 PASS — compiler, canonical runtime, head, customization/native quality, actor motion,3 прежних motion fixes и новый world gait continuity на60/120/240Гц.

Новые сценарии проверяют позднюю неверную опору, отсутствующий последний master, нераспознаваемый существующий module, испорченный provenance JSON, обрезанные стопы, точный alpha threshold. Ошибка файловой установки введена после первых PNG и перед последним metadata-файлом; сравниваются SHA256 всех установленных PNG/module/provenance. Для новой второй модели проверяется удаление незавершённых новых PNG и сохранение первого actor.

## Фактические native exports

Тест декодирует16 реальных экспортов (male/female,4 направления,coarse/fine) и сравнивает размеры с фиксированными48×64/96×128, а не только с возвращёнными metadata. Проверяются реальные прозрачные поля, наличие opaque персонажа, прозрачный внешний край и тёмные boot contacts непосредственно над фиксированной опорой: последняя opaque строка62/125 для anchor63/126. Raw PNG bytes до/после совпадают.

Повтор первоначального независимого probe: `node verification/canonical-compiler-review.mjs --after`; результат в `canonical-compiler-review-after.json/.txt`. `oldModuleRetained:true`, `oldPngRetained:true`, `clippedExportAccepted:false`, ошибка `Opaque master would clip the fixed canvas: down`. Geometry после исправления явно использует alpha>=128; все8 текущих opaque master bounds помещаются в96×128. Исторический baseline JSON сохраняет старое воспроизведение до исправления; результаты текущего threshold брать из `*-after`.

Это проверка compiler/runtime, не новая художественная приёмка и не подтверждение работы физического телефона. Статус арта и renderer clocks этим патчем не менялись.
