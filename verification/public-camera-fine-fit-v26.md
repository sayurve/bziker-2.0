# Public camera: fine height-fit quantization

Scope: `game/web/world-camera.js`, `game/tests/interior-spawn-framing-v26.test.mjs`, this report. Plans, map, PNGs and browser captures unchanged. Profile В. Root owns the fresh11-room browser pass and full regression.

## Confirmed reproduction

The browser's actual canvas386×792 leaves678pixels above the114 controls reserve. Current physical envelopes: clans/terrace682world, casino702world. Ideal height fits are678/682=0.9941348974 and678/702=0.9658119658. At DPR1 the former0.5 zoom quantum rounded both fits to0.5. The same terrace camera jumped0.5→1 for one additional viewport pixel at the next threshold, despite unchanged geometry and saved position.

New RED tests used all11 actual rooms at386×792, DPR1/2, requiring at least85percent of the allowed fit while strictly fitting the physical envelope. A second test sweeps actual clans/terrace/casino heights784..808, DPR1/2, checking monotonic scale, strict height fit and maximum adjacent change1/(8×DPR). Both failed before the fix: clans scale0.5 versus available0.9941348974, and terrace adjacent jump0.5→1. Existing4 tests passed. Exit1,4PASS/2FAIL.

## Change and result

Public fit now rounds down in steps1/(8×DPR). Minimum0.5 and bounded panning remain; requested city zoom is still an upper bound. Saved/world coordinates, framing envelope and physical pixel origin rounding are unchanged. NEAREST renderer setting is unchanged; origin snapping does not require half-pixel zoom increments.

Actual386×792 output for clans/terrace/casino: DPR1 scale0.875, DPR2 scale0.9375. DPR1 profile and clothes remain1. These public-room differences now follow the real physical height budget rather than a coarse0.5 rounding gap. Below the minimum fit, the existing0.5-plus-pan policy still applies; strict full-height assertions cover viewports whose envelope can fit above that minimum.

## Verification

```sh
/Users/sapp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test game/tests/interior-spawn-framing-v26.test.mjs game/tests/interior-camera-v25.test.mjs game/tests/world-camera-v12.test.mjs game/tests/world-lifecycle.test.mjs game/tests/world-gait-continuity.test.mjs game/tests/public-v25-interior-shell.test.mjs game/tests/wood-floor-scale-v26.test.mjs
```

Exit0, **107/107 PASS**, including both new regression cases, all11 room height/fixture envelopes, physical origin rounding, tiny viewport minimum/pan, exact pre-change city/base values and actual mountWorld motion/room transitions. No browser quality claim is inferred from these tests. No full suite rerun by this agent; root will perform it after fresh screenshots.

Frozen SHA256:

- `game/web/world-camera.js`: `c76b48e237d64806cc90e2156cb3e7e4d7e0549e808dd60dd938e5ff20fd5efb`
- `game/tests/interior-spawn-framing-v26.test.mjs`: `d87cbd25932e30525d935543d6f7cc91a2a7fd31e4dfef00066e1008d57831d4`
- Map unchanged: `0e4da5e3d9ea54fa8039eddfa0ff99983a55da99da94baa216849f7231314547`

Camera implementation frozen after this run.
