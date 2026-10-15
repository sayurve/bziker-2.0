# Wood floor scale — v26

Profile В. Scope: `game/scripts/build-modular-interiors.py` Room constructor, regenerated `game/web/interiors-map.json`, new `game/tests/wood-floor-scale-v26.test.mjs`, this report. PNGs, browser artifacts, docs, original Bziker and other source modules were not modified.

## Evidence and change

The native1254×1254 board/parquet flat textures both declare `tile_world_size:[192,192]` in `game/web/design-data.js`. Their source prompts and whole-floor references were reviewed in `materials/Bziker/01_Окружение/Здания/Клановые_базы/Отделка/01_Полы/{01_Доска,02_Паркет}/`. The board source has eight horizontal rows; sampled opaque dark seams include native y155..160,309..317,465..473,621..630,779..787,936..944,1092..1100. Row spacing is approximately156.7native pixels.

The Room constructor overrode the native scale with320×320 for every material. The actual renderer downsamples the entire flat swatch into that world-sized tile. Thus wood elements were320/192=1.6667 times the metadata scale: approximately40world per board row versus24world, against the80-high actor canvas. The browser screenshots previously reviewed were `verification/locations-v26/terrace-browser-wide.png` and `shop-furniture-browser-wide.png`. Source references contain no dimensional human ruler; this restores the recorded material scale rather than claiming a physical centimetre calibration.

Room now copies board/parquet tile dimensions from their asset metadata. All other material types keep320×320. Regenerated rooms changed: messages/bar→192×192, terrace→192×192, shop-furniture→192×192. Other eight rooms remain320×320. The constructor copies the list, rather than hardcoding192 or sharing mutable metadata with room state.

## RED → GREEN

Before implementation, all **3/3 new tests failed** (exit1): actual map still320, native pixels did not repeat at192world, constructor ignored a probe metadata size160×224. After implementation and regeneration, **3/3 PASS** (exit0).

Tests assert the real native texture metadata, actual public map assignments, unchanged actor80 and other materials320; draw the real native floor surfaces and compare100 nonuniform pixel samples per room after192world shifts in both axes; and invoke the actual Python generator against temporary in-process metadata160×224, proving authored dimensions are read rather than mirrored as another192 constant. No PNG fixture or production image was generated.

Commands from project root:

```sh
python3 game/scripts/build-modular-interiors.py
/Users/sapp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test game/tests/wood-floor-scale-v26.test.mjs game/tests/interior-side-cutaway-v26.test.mjs game/tests/public-v25-interior-shell.test.mjs game/tests/interior-spawn-framing-v26.test.mjs game/tests/world-camera-v12.test.mjs game/tests/interior-camera-v25.test.mjs game/tests/community-interior-plans.test.mjs
python3 -m unittest discover -s game/tests -p test_community_interior_plans.py -v
```

Generator exit0, targeted Node **24/24 PASS**, Python **5/5 PASS**. These cover native surfaces/perimeter, all11 public room vertical framing, unchanged city/base outputs, existing actions/seats/phone and community radius14 routes. Root will restart servers, take fresh browser screenshots and run the full regression separately. This report does not claim those later checks.

## Change isolation and freeze

Before-map SHA256: `e401e32db9d360464f07fbf00f6fe0c97f90d8e2fcff9b365e4f882a3cec023b`.

Independent normalized JSON comparison removes only each room's `floor_material.tile_world_size`, sorts keys and serializes UTF-8. The **same** SHA256 before and after is `a0d9402debec6dac6ff4928958a6b43caca7ada42b6b9ab1cc682800eadbad1f`. Hence every remaining map field is identical, including geometry, furniture, actors, seats, lights, material colors, walls and features. Exact tile values for all11 rooms were also checked explicitly.

Frozen source/data/test SHA256:

- `game/scripts/build-modular-interiors.py`: `13313eeb70e4ebaf5244b654378c0e8a6c2a2adffc6039e07fb9e7fdcf8bd873`
- `game/web/interiors-map.json`: `0e4da5e3d9ea54fa8039eddfa0ff99983a55da99da94baa216849f7231314547`
- `game/tests/wood-floor-scale-v26.test.mjs`: `731a3d70a293b455bfd302c2027ab3eb1cdb757b9314309e6126b65ef3b58110`

Implementation frozen after these passing checks; no further generation or edits planned by this agent.
