# Native avatar fixture modernization v30

## RED evidence

`avatar-native-fixtures-v30-red.log` records the six requested unchanged files against the native pipeline:34 tests,12 passed,22 failed. These failures were actual missing-PNG/preload and outdated48×64/actorAtlas assumptions, not accepted loading placeholders. The full-suite evidence was also present in `game-node-latest.log`; the dedicated RED log preserves it independently of root's later full runs.

## Final changes and checks

Six owned files modernized: avatar-catalog, avatar-motion, avatar-rendering, avatar-v7, character-reference-v13, run-slideshow-v15. The new uniquely named `game/tests/helpers/character-core-native-fixture-v30.mjs` awaits actual C/L/A PNG preloading through the bundled@napi-rs/canvas runtime. Every render asserts readiness, factor2, and the equality of real96×128 canvas pixels with the preview grid. Transparent alpha is thresholded identically to native source decoding. A pending/empty grid cannot pass.

The six files retain34 tests. Comparisons now use actual approved native PNGs and saved customization rather than obsolete actor-atlas normalized pixel arrays. Full-pose expected PNGs are independently decoded and passed through the material customizer; source selection, pose order and whole-pose drawing are checked against those bytes. Four complete phases hold for two movement samples and wrap exactly. Side art remains independently authored, not mirrored. Every current frame has a96×128/factor2 detail image, a48×64 logical canvas, stable anatomical eye-to-neck scale, ground125 and transparent standalone padding.

Profile, catalogue, headgear and anonymous rendering retain option uniqueness, safe colors, exact SVG/canvas pixel geometry, complete face masking and neutral jury identity. Portrait/head/torso regions and scanline coordinates now account for factor2. Seated phone keeps the same directional head through fine row71 and the actual legs/boots below row101; the independent phone item may legitimately overlap the lap above that boundary. Native full-body painting is one texture draw with integer destination edges, preventing per-scanline scaling gaps.

Action tests now use actual actionProgress timelines, rather than an obsolete generic actionFrame clock that could not select new finite families. Mouth actions correctly have3 distinct approved poses; lower reach has4, with pet's authored repeated stroke cadence. Tests retain common ground, positive actual body/hand connectivity, safe envelopes, static seated phone, held-paper visibility, and translated canonical pupil/sclera RGBA. Bending legitimately translates the whole head: eye samples are compared after its authored eye-anchor translation, excluding only exact approved foreground palm pixels and a separately absent test prop. They are not reduced to an arbitrary hash/count or omitted.

`avatar-native-fixtures-v30-final-green.log`:51/51 PASS (34 modernized tests,2 new production-identity tests,15 source/override adapter regressions). A subsequent stricter full seated-head assertion also passed4/4 in `avatar-seated-complete-head-v30-green.log` and the corresponding v7 phone test in `avatar-v7-complete-seated-head-v30-green.log`.

## Two separately authorized production corrections

The retained malformed-direction test exposed a concrete bug: unknown facing selected legacy01_На_месте instead of canonical idle. A new actual-PNG test first failed, then passed after sourceActorFrame normalizes missing/malformed facing to down once at entry.

Ordinary walking also selected an old small-headed identity. With root's explicit authorization, ordinary walk/run now select the same approved L whole-pose sequence. Callers still control distance cadence and speed; this is shared approved locomotion, not newly authored dedicated walking art. Explicit animationId/sourceAction paths still select the original archive. Two narrow old `/Ходьба/` adapter assertions were updated in locomotion-override-v27 and source-actors-v17: they now require shared approved sequence identity, real legacy fallback for an absent reviewed direction, and exact explicit archive access.

`native-locomotion-identity-v30-red.log`:2/2 RED before the source corrections. `native-locomotion-identity-v30-green.log`:2/2 GREEN afterwards, using both models, all directions/eight samples and the actual H7-white/skin3/shirt8 bitmap. The final51-test run includes these cases.

Runtime freeze: source-actors.js c73e4d0fa823d8d4f72bcb1625cfff902e2bdb8ee3c86b14abe7ed1ac1b2c5ba; avatar.js d95537f37d3e2e4404a233f5a4c3f5c555a90b6e7c8153323d53559f09220422. Actor-sprite is the hair agent's separate freeze be8e935642374699951146083fbef4ec1ad690a7de8a06ae2153f34dc9b4271b. No C/L/A PNG or metadata bytes were changed in this task. Root owns full-suite and same-one-character actual-game acceptance; no new hairstyle visual matrix, publication or complete editable-art-master claim is made here.
