# Узкий кандидат исправления юбки и QA-кошелёк

Согласована изолированная граница с hair-агентом: только `if(a.pantsStyle===2)` внутри customize(). Production `actor-sprite.js` этим агентом **не редактировался**. Подготовлен `pants-style2.patch`; SHA базового файла — в patch-base-sha256.txt. После чужих hair-изменений проверять контекст единственного блока, не заменять весь файл сохранённой QA-копией.

Диагноз: старый `44+(y-44)%6` переносит в юбку альфа-пропуски и яркие клетки рубашки. Кандидат выбирает существующие тёмные клетки брюк, продолжает единую поверхность ближайшими native shades, меняет только garment rows44..53, сохраняет обнаруженные кисти/контур волос; ноги ниже подола и обувь не перемещаются. Силуэт шириной следует реальной опоре талии и расширяется к подолу. Это кодовая адаптация настоящей палитры, а не новая художественно одобренная модель юбки.

`continuity.test.mjs` получает настоящие исходные PNG через sourceActorFrame; 40 samples:2пола×4направления×(idle+4walkphases). Проверяет непрерывность центральной ткани, отсутствие ярких полос из рубашки, точное сохранение всех строк выше44/обуви59+ и видимой кожи рук. Старый код: **RED**, exit1; изолированный кандидат: **3/3 GREEN**, exit0. Снимок before-after.png отрисован настоящими source-actors/avatar функциями, временные QA-копии отличаются только этим pants-блоком. Вся таблица просмотрена. Подключать candidate.mjs вместо production запрещённой командой не предлагается: это только тестовый стенд.

После применения патча root выполняет:

```sh
node --test verification/customization-audit/skirt/continuity.test.mjs
node verification/customization-audit/render-options.mjs final
```

У первой команды без `BZIKER_SKIRT_CANDIDATE` используется настоящий production actor-sprite. Нужен Node с доступным @napi-rs/canvas. Комбинированный финальный результат и браузер здесь не заявлены.

## Одноразовая fixture валюты

`verification/fund-qa-wallet.py` принимает только существующую автономную SQLite в системной временной папке с именем `bziker-...-qa.sqlite3`, явным account ID и точным именем профиля. Не создаёт схему, не выдаёт inventory/ownership, не добавляет endpoint. Использует существующий economy.change_balance внутри BEGIN IMMEDIATE и ledger reference `testfixtures:qa-fund:<fixture-key>`. Повтор того же ключа с той же суммой не начисляет снова; другая сумма для того же ключа откатывается.

```sh
PYTHONDONTWRITEBYTECODE=1 python3 verification/fund-qa-wallet.py \
  --database /tmp/bziker-locations-v26-qa.sqlite3 \
  --account-id QA_ACCOUNT_ID \
  --expected-name 'ТОЧНЫЙ QA НИК' \
  --coins 1000 \
  --fixture-key paid-outfits-v27
```

Заменить QA_ACCOUNT_ID/имя на действительный disposable account; это не команда для data/bziker.db. Не передавать ledger/reference в production. Все шесть outfit стоят в сумме900Бзинге:100+140+180+120+200+160. Полученные fixture-coins позволяют root купить их обычным магазинным UI с настоящим серверным списанием и ownership; скрипт костюмы не открывает. Пополнение реальной пользовательской БД этим агентом не выполнялось.

`test_fund_qa.py`: **7/7 PASS**, exit0. Проверены идемпотентность, конфликт ключа с откатом, точное имя, отсутствие автоматического создания БД, отказы для не-QA/prod пути, symlink/hardlink, некорректных сумм; inventory не изменяется. Свидетельство — ../funding-tests.log. Тесты используют только собственные временные fixtures.
