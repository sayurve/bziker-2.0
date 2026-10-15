# Shared side-wall registration

Scope: only `Room.fit_visual_shell` side-surface generation in `game/scripts/build-modular-interiors.py`, `game/tests/public-v25-interior-shell.test.mjs`, new actualpixel test `game/tests/interior-side-cutaway-v26.test.mjs` and verification. No world/camera/runtime/PNG changes. Root owns map regeneration and other layout contracts.

## Confirmed source geometry

Source PNGs were viewed individually: clothing left/right, station left, hub left; all10 family-side references were numerically sampled. These are diagonal perspective sections from composed scenes, not orthogonal walls for a rectangular physical floor. Clothing-left inner rear columnx532 has opaque alpha>=128 at native y5..259; the outer front corner reaches approximatelyy495. Station-left innerx97 y49..267 differs from bbox bottom371. Hub-left innerx638 y31..266 differs from bbox bottom676.

The former method scales measured upright to176 but anchors the complete perspective bbox bottom atrear floor top+2. That lifts the actual inner rear ground far above the rear wall's ground. Translating that corner down would leave the other diagonal ground edge outside the physical rectangular wall. Stretching or repeating the section cannot resolve the mismatch without changing the source view or navigation.

## Implemented choice

Use the already existing genuine native material cutaways for both physical side boundaries,18world wide fromfloor top throughdepth+20. Remove only the inconsistent full perspective side PNG surfaces. Keep original native rear panels at176bodyheight, native aspect, material tiles and frontcutaway. Nothing is stretched to room depth or copied as a giant wall. Gameplay fields unchanged by fit: new Python deepcompare checks bounds/spawn/exit/door/solids/seats/props/action/counter/staff.

`public-v25-interior-shell` now explicitly requires two real native flat-texture side planes at exactlyL/R and full physical depth, instead of demanding a detached perspective PNG. Native rear176body is still measured from source metadata/crop, all retained PNG aspects checked. New pixel tests independently render actual native surfaces and detect pixels outside the allowed physical rear/floor/side/front envelope, plus continuous real pixels atboth side boundaries/rear corners. This is not an empty list passing a loop.

RED on old generated map:1/2 new pixel tests, with21856escaped pixels for railway; perimeter itself alreadycontinuous, confirming full side panels were detached decoration rather than the actual physical boundary. `side-wall-cutaway-red.txt`.

Candidate afterfix: `community-interiors-candidate/contact.png`, viewed via view_image. Before is `community-before-sidefix.png`. Final integrated map validation awaits root freeze/regeneration and is recorded below.

## Separate camera observation

`community-camera-geometry.mjs/.json/.txt` uses actual worldCamera/interiorCameraBounds APIs with the sidefix geometry. Fixtures stay within the176rear body (ceilingfixturetop=top-170). Spawn can still crop that wall because the usable viewport above controls is smaller than room+rearwall. At1204×650,dpr1,zoom1.25 clans scale1 crops fixturetop81.56world; at1204×800 rounded zoom becomes2, cropping274.56world. This is pure geometry, not a claimed actual browsercanvas size. Root subsequently authorized a separate camera correction in world-camera.js. Public height-fit cap, bounded minimum0.5 and fixture/cutaway bounds are implemented and tested; city/private-base exact outputs remain unchanged. See community-interior-plan-report.md and interior-spawn-framing logs. The historical measurements above explain the RED case, not the final camera result.

## Final integrated verification

Root regenerated the production map. Re-read actual `game/web/interiors-map.json`: **0** perspective left/right surfaces. New actualpixel tests **2/2 PASS** within the fresh **21/21 Node PASS** targeted run (`community-final-integrated-node.txt`); actual perimeter/rear and public camera framing tests also pass. Python **5/5 PASS**, including the deep comparison that fit never moves gameplay fields and actualmap BFS33/33. Logs: `community-final-integrated-python.txt`, `community-integrated-bfs.json`.

Fresh productionmap renders `community-interiors-integrated/contact.png`, `clans-spawn-390.png` and `arena-spawn-1204.png` were viewed via view_image. Detached side PNG geometry is absent; real material cutaways follow the physical boundary. Rear176 and fixture tops remain above controls at both tested viewport sizes. This is native renderer proof, not a claim of browser or physicalphone testing; root owns those checks and the full suite.
