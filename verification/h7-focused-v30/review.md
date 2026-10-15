# Single selected avatar H7 review — v30

Scope fixed by the user: male, tail H7, white hair6, dark skin3, lime shirt8, shirtStyle2, outfit0, headwear0; other defaults. No further hairstyle exploration was performed. The former all-style sweeps are historical evidence, not this acceptance.

## Concrete correction

The five LEFT dark points `(46,15), (28,18), (28,19), (67,41), (64,49)` were retained canonical scalp, not face, clothing or selected hair pixels. Replacing their surrounding hair left four disconnected components (areas1,2,1,1). `applyNativeHair` now removes only tail/LEFT source-only scalp components of at most2 pixels that touch neither selected strands nor protected face/body. No other style has this cleanup branch.

Actual-renderer RED: `../hair-tint-v30/h7-island-red.log` failed on the four components. GREEN: `../hair-tint-v30/h7-island-green.log`,2/2 tests. The second test compares the current native raster to the frozen actual before-image: exactly those5 pixels become transparent; every other one of12,283 native pixels retains exact RGBA. The first covers34 current idle/run/phone/HAND/LOWER/SEATED snapshots and lower-leg invariance.

Viewed full figure comparison: `../hair-tint-v30/h7-left-islands-before-after.png`. No head, face or body resizing; no replacement body pixels or new painted art.

## Current actual renderer evidence

`../h7-focused-v30.mjs` exercised 1,164 requested states, deduplicated by actual sequence/frame/direction/context/props into 292 snapshots: 256 canonical and 36 explicitly historical specials. `audit.json` records every input alias/progress, actual path, metadata and before/after SHA. Native body rendering uses the production customBitmap; complete figures use production drawSourceAvatarCanvas, and UI parity uses production sourceAvatarRaster. All21 contact sheets were viewed; motion sheets were viewed again after core corrected walking.

The canonical subset contains idle, standing/seated phone, all4 walk/run phases, HAND and LOWER aliases, seated actions and the4 right-facing WATER body states. Walk and run share source sequence/phase, so their identical rasters deduplicate. WATER equipment drawn separately by action-effects is outside these body contacts; this report does not approve fishing-rod attachment/browser interaction.

Canonical current counters:

- Fine UI/world pixel difference:0 cases.
- Non-neutral residual colour inside authored scalp:0 cases.
- Opaque canvas-edge pixels:0 cases.
- Protected actual face RGBA changed by H7 versus natural same-preset body:0 cases.
- Opaque source body pixels lost below authored neck +2 fine pixels (excluding source hair):0 cases.
- More/less than one large (>40-pixel,8-connected) body component: 0 cases. This measures detached head/body, not every possible internal source-art gap.

In the viewed canonical figures, white fringe/temples/nape and the tail stay white, lime clothing remains lime across standing, bending, seated and water bodies; no additional visible shoulder/neck alpha gaps were observed. Mouth palms legitimately cover part of the face in the mouth frame. This is a review of one configured runtime avatar, not approval of every hairstyle/outfit combination.

## Additional source discrepancy and boundary

The audit found ordinary walk selecting the old head/body, visibly differing from idle/run. Core fixed the source consumer to use the reviewed whole-pose locomotion for both speeds; the current four motion contacts show the consistent selected head/hair. `world.js` already passes `running:walking` for world movement, so the old branch also affected compatibility/editor callers.

Historical `jump`, `sleep`, and `wave` still select old source bodies. Their contacts visibly differ; sleep has a floating selected hair cap. They are preserved in `archive-*.png` and are **not accepted as new canonical action art**. Nine historical LEFT UI/world differences and one historical edge case occur outside the canonical subset. Do not describe all public archive clips or every human action as visually complete. Core/root were notified; this patch does not replace unknown old bodies.

Current targeted regression set: `../hair-tint-v30/h7-targeted-green.log`, **53/53 PASS** on the current source/actor freeze (garment, face/hand, head items, hair/scalp authority and the two new H7 orphan regressions). Full Node/game/browser acceptance is owned by root.

## Frozen current inputs

- `game/web/source-actors.js`: `c73e4d0fa823d8d4f72bcb1625cfff902e2bdb8ee3c86b14abe7ed1ac1b2c5ba`
- `game/web/actor-sprite.js`: `be8e935642374699951146083fbef4ec1ad690a7de8a06ae2153f34dc9b4271b`
- `game/web/interaction-actors-data.js`: `34a771f62dc4ad38f5efd79788dd681b2ffe1a79751f4d4ce27faa23657cffa6`
- `game/web/canonical-actors-data.js`: `d24ca352e05bf07c32b21ffe6775a53be6feebe3c047b61069245fccfef3a7eb`
- `game/web/locomotion-actors-data.js`: `ca80688f968f0fa059d584e5eac3a6bd035bec515498e4d06bfbd6176a7e8b73`

Before/after hashes equal: `True`. The actor-sprite runtime is frozen at the SHA above. Root owns browser retakes and final integration tests. No browser approval, all-art approval or game completion is asserted.

Contacts:

- [motion-down-0.png](motion-down-0.png)
- [standing-down-0.png](standing-down-0.png)
- [standing-down-1.png](standing-down-1.png)
- [seated-down-0.png](seated-down-0.png)
- [archive-down-0.png](archive-down-0.png)
- [motion-right-0.png](motion-right-0.png)
- [standing-right-0.png](standing-right-0.png)
- [standing-right-1.png](standing-right-1.png)
- [seated-right-0.png](seated-right-0.png)
- [archive-right-0.png](archive-right-0.png)
- [motion-up-0.png](motion-up-0.png)
- [standing-up-0.png](standing-up-0.png)
- [standing-up-1.png](standing-up-1.png)
- [seated-up-0.png](seated-up-0.png)
- [archive-up-0.png](archive-up-0.png)
- [motion-left-0.png](motion-left-0.png)
- [standing-left-0.png](standing-left-0.png)
- [standing-left-1.png](standing-left-1.png)
- [seated-left-0.png](seated-left-0.png)
- [archive-left-0.png](archive-left-0.png)
- [water-right-0.png](water-right-0.png)
