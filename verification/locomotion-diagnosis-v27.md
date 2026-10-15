# Locomotion diagnosis v27 — read-only proposal

Profile В. Runtime source is unchanged in this diagnostic stage. Original Bziker is untouched. Native contacts are actual atlas pixels, not newly generated art or body-part strips. Both contacts were opened through view_image.

## Actual path

`world.js` drawAvatar passes `running:walking`, so ordinary accepted world motion uses `Бег` in every direction, for both genders. `advanceWalkCycle` accumulates accepted distance modulo128 and emits8 clock samples; sourceActorFrame maps them to native frame indices0,0,1,1,2,2,3,3. At world speed172 this advances a distinct pose every32world units (~186ms), full4-pose cycle~744ms. Source authored run timeline holds2ticks at12fps, a distinct pose~167ms; walk holds3ticks (~250ms). This is a distance clock, not the video's elapsed timeline.

A deterministic3-second, straight172world/s probe at30/60/120/240Hz produces0→1→2→3 repeatedly with no unexpected reset; all16 source clips contain4distinct frame records. Existing actual mountWorld continuity tests cover slow accepted input, one-second remote samples, stop, teleport, room change and unchanged arrival. There is no reproduced phase-skipping/reset regression here.

## Pixels and anatomy

Artifacts: `locomotion-native-male-v27.png`, `locomotion-native-female-v27.png`, `locomotion-native-metrics-v27.json`; reproducible `locomotion-native-audit-v27.mjs` uses native96×128 fine atlas crops with no fit or transforms and cyan ground126. Fixed actor anchor24,63; sourceScale0.32male/0.305female is identical across all walk/run phases, so per-frame X/Y stretch is absent in these base clips.

The side walk clips have four variations of a wide contact stride, without a clear narrow passing-leg phase. The female run-right clip visibly keeps the front/right-screen shoe at y125 in all4poses while the rear/left-screen shoe is y118,116,112,119. Run-left is the opposite-screen equivalent. This is compatible with the reported hopping/one-sided gait; replaying those four poses cannot create the absent opposite half-stride. Male run-right has a wider contact→bent sequence, but also lacks a convincing opposite side half-cycle in the source artwork. Front/back clips contain more alternating visual leg movement; four distinct hashes alone do not validate anatomy.

Whole-body top varies by at most3fine pixels across these run phases (maleleft top12,9,11,10); lowest opaque shoe stays y124/125. The native art itself is largely grounded by its lowest shoe, while leg shape cycles through a lunge/bent pose. Head extrema are metadata/pixel observations, not a claim that head position must be perfectly fixed in a natural gait.

## Search of primary saved material

Viewed primary male/female `02_Персонажи/.../Анимации/00_Исходники/Лист_циклов.png`, primary `02_Ракурсы_и_действия.png`, male `03_Бег_4_направления.png`, and the additional native `06_Повседневные_действия/00_Исходники/Слои/{Мужчина,Женщина}/Ходьба_right.png`. Catalogs/source_sheet/source_cells/phase_mirrors and importer were inspected. The atlas/compiler copies the existing supplied whole poses; source raw256 anchors128,224 map to48×64 anchor24,63 with group scale, no source root track applied. The daily lower-body strips repeat the same wide-stride phases and do not supply a missing passing/opposite phase. The primary overview sheets have one movement pose per direction rather than an additional full cycle. No fully correct alternative saved side walk was found in these sources.

## Proposed minimal implementation

1. Correct the world selection bug: ordinary walking must choose the existing grounded walk clip, not implicitly opt into running. Keep an explicit running input for an actual run action. This removes the unrequested run/bent-pose hopping from ordinary movement, but cannot honestly be called a complete gait artwork fix.
2. Preserve the current accepted-distance clock and stop/teleport/scene semantics. There is no evidence requiring a second clock or changing frame order blindly.
3. For a complete alternating gait, author and review full in-place whole-pose contact/passing/opposite-contact/passing frames in each direction, using the approved large-head identity. Use fixed canvas/anchor/scale and authored landmarks; no mirror, limb strips, bbox fit or synthetic whole-image bob. A valid new set can be connected through source selection after actual visual review.
4. Meaningful regressions: actualworld ordinary motion selects walk, explicit run selects run, distance maps to all authored poses without reset; real pixel contact/passing witnesses and opposite-support checks must be based on the approved new artwork. Do not turn the current4 unique images into an anatomical PASS.

Awaiting root's implementation scope decision; source-actors.js/customization/world code unchanged by this diagnostic stage. Hair/customization investigation is owned separately and must preserve per-frame provenance.

## Clock validation in this stage

Command: `node --test game/tests/walk-cycle-v10.test.mjs game/tests/world-gait-continuity.test.mjs` with bundled Node24.19.0. Exit0,9/9PASS, including actual mountWorld low-stick and1-second peer sampling at60/120/240Hz. This confirms clock continuity, not anatomical gait correctness.

Both original `Анимации/00_Исходники/промпт_циклов.txt` explicitly request first contact, passing, opposite contact and opposite passing with reversed legs and opposite arms. Their rendered sideframes do not fulfill that complete phase brief; the prompt itself is not evidence of artwork quality.
