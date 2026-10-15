# perform async readiness v27

Минимальное изменение app.js: существующий #app объявляет aria-busy=false при mount; accepted perform синхронноtrue; outer finally возвращаетfalse только после fn и существующего await routing cleanup. activePerformCount удерживаетtrue, если очередной permitted perform завершился раньше предыдущего routing cleanup. Это только честный DOM/ARIA cue: mutationBusy guard, mutationEpoch, error notice/sound, early worldControlLost return, existing route rejection и порядок игровых/экономических операций не изменены. Очередь новых mutations не добавляется. Новых JS modules/STATIC routes нет.

RED→GREEN actual app runtime tests в `perform-readiness-v27.test.mjs`: настоящие phone buttons появляются при pending worldView.setPhone, но ARIA остаётсяbusy; после resolve следующее phone приложение открывается. Также rejected fn, existing reentrancy guard, world-control earlyreturn, awaited route cleanup/overlapping accepted performs, route rejection и initial DOMfalse. Tests выполняют настоящий app.js через существующий minigame-runtime helper; алгоритм perform не копируется в test.

`perform-readiness-v27-red.log` содержит6 missing ARIA failures. `perform-initial-readiness-v27-red.log` — отдельный missing initial attribute failure. Combined final `perform-readiness-v27-green.log`:76/76PASS, exit0 (new7 + phone lifecycle/app routing/minigame lifecycle regressions). Никакой browser/device/fullsuite проверкой этот узкий Node запуск не объявляется; root выполняет реальные UI gates и full regression.

Stable browser gate: `document.querySelector('#app').getAttribute('aria-busy') === 'false'` перед зависимым нажатием. Initial false относится к отсутствию activeperform; появление целевой кнопки по-прежнему проверяется отдельно. Busy не означает readiness всех независимых фоновых polls.

Final app.js SHA256:8b7ad57fde7bfd33e4d9e674d254309427278e19b3853e190153dcb669fe214b.
