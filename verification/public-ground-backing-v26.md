# Public interior ground backing

Profile В. Scope: only public-interior ground callback in `game/web/world.js`, regression in `game/tests/world-lifecycle.test.mjs`, this report. City/base callbacks, camera, plans, map and PNGs unchanged.

## Reproduction and fix

Phaser submits512×512 visible ground tiles at world coordinates, including negative y or y beyond the room canvas. `drawInteriorGround` paints only0..room width/height. The remainder of an interior tile was transparent, exposing the pale Phaser background in the browser.

The actual public-interior callback now accepts `(ctx,tile)` and fills the complete tile rectangle with opaque `#171a1c` before drawing the original room ground and background details. Drawing order and all room contents remain intact. The context's paint style is saved/restored around this backing fill.

## RED → GREEN

New test mounts the actual world with the real railway room and386×792 canvas. Its renderer intercepts the real submitted ground painters and executes them on native @napi-rs/canvas tiles with the same translation as Phaser's paint path. Source room PNGs are loaded locally. It samples both ends outside the room canvas, requires real opaque `[23,26,28,255]` pixels, and separately requires more than10 distinct native floor colors inside the floor so an all-dark canvas cannot pass.

Before fix: **1/1 FAIL**, exit1, world coordinate9,-503 produced transparent `[0,0,0,0]`. After fix: **PASS**, including more than20 samples each above and below the room canvas.

```sh
/Users/sapp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test game/tests/world-lifecycle.test.mjs game/tests/world-gait-continuity.test.mjs game/tests/interior-spawn-framing-v26.test.mjs game/tests/interior-human-scale-v23.test.mjs game/tests/wood-floor-scale-v26.test.mjs
```

Exit0, **107/107 PASS**. Actual mountWorld lifecycle, city/base interactions, motion, public framing, native floor scale and the new backing pixels pass. Root owns the final railway browser capture and full regression; they are not claimed by this report.

Frozen SHA256:

- `game/web/world.js`: `c8f6947e4e555b260d77d0a6a86d649598300e8d43fe0ebf9861d8f7b34d38d0`
- `game/tests/world-lifecycle.test.mjs`: `9c3f827dd22dd1b1f84002e3b6f24cf225f34a2c1191711a2fb1a7368251f843`
- Camera unchanged: `c76b48e237d64806cc90e2156cb3e7e4d7e0549e808dd60dd938e5ff20fd5efb`
- Map unchanged: `0e4da5e3d9ea54fa8039eddfa0ff99983a55da99da94baa216849f7231314547`

Implementation frozen after this passing run.
