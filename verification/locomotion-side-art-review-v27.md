# Ограниченная приёмка бокового бега v27

Root просмотрел `locomotion-gender-native-head-contact-v27.png` и одобрил мужские v2 и женские v3 боковые whole-pose compatibility composites: реальная опора, различие четырёх authored фаз и сохранённое различие тел. Независимо просмотрены female-v3 и общий contact. Область приёмки: run-left и run-right двух моделей. Полный editable master/гардероб и прочие действия этим не одобряются.

Источники image_gen сохранены byte-for-byte в `art/drafts/locomotion-v27/{male-*-v2,female-*-v3}/sheet.png`; исходные generation paths/SHA256, authored roots/neck anchors, один body scale .2125/.20 и prompt-info сохранены рядом. Для каждой фазы сохранены полный master cell, отдельные fine96×128/coarse48×64 PNG, реальные alpha body/head и целых near/far pants/shoe material masks. Материальные теги изменяют RGB существующих пикселей, сохраняют alpha и геометрию; A/C и B/D не переставлены программно.

Голова каждого направления — один реальный male native D.run0 alpha donor с авторским криволинейным контуром. Её opaque RGBA сохраняются1:1 во всех фазах обоих полов, применяется только integer neck translation. Generated head удалён настоящей alpha mask с криволинейным neck boundary; прямоугольные полосы рук/шеи не перемещались. Отдельные body derivatives и метаданные находятся в native-head-composition. Это производные compatibility layers, не новый редактируемый мастер одежды.

Все16 видимых опорных подошв заканчиваются на fine y125 при фиксированном ground126. Мужская видимая высота112–115px; женская108–111px. Женское тело использует единый .20 scale против мужского .2125 (5.88% разницы body scale), но общая голова1:1, поэтому фактическая разница высоты около3–4%, а не заявленные для всего силуэта5.88%. Масштаб по bounding box/независимое X/Y растяжение не применяется.

Female front/back и standing idle рассматриваются отдельно; они не следуют из этой приёмки. Browser motion/customization проверяет root после установки.
