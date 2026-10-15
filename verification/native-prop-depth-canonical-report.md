# Canonical idle / native lamp silhouette regression

Изменён только `game/tests/native-prop-depth-v19.test.mjs` и diagnostic/report в `verification/`. Ни игровой код, ни canonical/source art, ни original Bziker не менялись. Python повторно не запускался: патч затрагивает только JS-тест.

## Причина

`lamp silhouettes do not erase…` проверял `[222,54]` и `[222,56]` на изображении города1536×1024. После подключения более узкого canonical idle обе точки находятся на мостовой даже до foreground. Фактические RGBA до/после совпадают с исходным ground: `[191,173,145,255]` и `[225,201,169,255]`. Это устаревшие контрольные точки, не стирание персонажа лампой.

Реальная лампа `native-prop-native-lamp-north-1` имеет world bounds1075,215,45,110 и depth325. Legal player1120,290 стоит позади ground base и справа от силуэта. Внутри того же прямоугольного crop есть прозрачный pavement notch x222..223,y54..56. Три реальных opaque body/boot пикселя нового idle здесь:

- 223,54: actor/final `[43,37,39,255]`, ground `[224,195,164,255]`;
- 223,55: actor/final `[43,37,40,255]`, ground `[208,176,157,255]`;
- 223,56: actor/final `[14,10,12,255]`, ground `[218,191,165,255]`.

Во всех трёх точках lamp mask alpha0. Это строки выше foot shadow. Test теперь выбирает все реальные actor pixels внутри фиксированной authored pavement области, требует минимум3 witnesses, проверяет реальное пересечение crop, прозрачность lamp mask и **точное сохранение actor RGBA после foreground**. Проверка стирания не ослаблена.

Diagnostic `native-prop-depth-canonical-probe.mjs/.txt` отдельно заменяет силуэт ошибочной прямоугольной перерисовкой native ground: она стирает все3 witnesses. Следовательно обновлённый test продолжает ловить именно исходный класс дефекта.

## Проверки

RED: `native-prop-depth-canonical-red.txt` —8/9, падение на пустой старой точке.
GREEN: `native-prop-depth-canonical-green.txt` —9/9 PASS, включая остальные реальные depth cases лампы/машины/знака/поездов/платформ/моста.

Полный Node-регресс: `/Users/sapp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node game/scripts/test-node.mjs` из корня проекта — **784/784 PASS**, exit0,27.76с. Свежий лог: `verification/node-full-canonical-regression.txt`. Это полный Node-набор текущей сборки; Python/browser/физический телефон данным запуском не проверялись.
