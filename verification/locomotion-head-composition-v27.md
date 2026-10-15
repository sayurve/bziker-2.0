# Native head + new whole-body locomotion composition — DRAFT

Profile В. Root accepted the male-right shaded body candidate's grounded four-phase ownership and authorized a derived alpha-head/body composition. This stage does not approve production artwork or activate any new clip.

## Agreed API and scope

Hair agent confirmed the unchanged `customizeSourceGrid(...,{facing,head})` and fine equivalent. Coarse head metadata can carry authored `eyeAnchor`, `eyeLine`, `neckAnchor`, `facePolygon`, `scalpPolygon`; fallback runtime eye detection is not misrepresented as authored geometry. This stage did not modify `source-actors.js`, `actor-sprite.js`, clocks, world, data modules or server.

The source head donor is exactly frame0 of the original `sourceActorsData` male `07_Бег_Справа` or `09_Бег_Слева`, as requested for the first run reference identity. Each96×128atlas crop yields one real alpha head extraction per direction. Its manually authored polygon follows the hair/ear/face and curved jaw/neck separation. It includes native eyes and ears, and is saved independently as `native-run0-alpha-head-fine.png`. Donor atlas SHA, sourceKey, frame rect and polygons are recorded.

Each new generated body has its own authored curved generated-head removal mask, intersected with actual alpha. Warm hair/skin fringe pixels just below that seam are included, preserving grey collar pixels rather than cutting a rectangular collar band. The complete arms and legs retain their image_gen-derived geometry; no limb strips are copied or shifted.

The same native head is then copied **1:1 with integer neck translation only**. Right head translations in fine pixels: A0,1; B-3,0; C0,1; D0,0. Left: A4,2; B0,2; C3,2; D0,2. Body scale remains the prior common0.2125; source donor face is never resized or warped. Coarse48×64files are the fixed2×downsample of the completed96×128composite, not a separate independently fitted face.

## Outputs and actual checks

Folders: `art/drafts/locomotion-v27/male-right-v2/native-head-composition/`, `male-left-v2/native-head-composition/`. Each preserves head layer, four generated-head alpha masks, four body-below-neck images, four complete coarse/fine pairs and `composition-evidence.json`. Unmodified originals and earlier uncomposed/shaded derivatives remain alongside them.

Reproducible command:

```sh
node verification/compose-locomotion-native-head-draft-v27.mjs
```

Bundled Node24.19.0, exit0. For all8composites every opaque donor head RGBA pixel is asserted identical after translation, with a positive copied-pixel count. Every body pixel at y>=70 in fine coordinates is asserted identical to its input; arms/hips/legs are not changed by this operation. Positive removed-generated-head counts prevent a vacuous overlay-only proof. The head extraction itself and exact authored boundaries remain subject to the separate visual review.

`verification/locomotion-male-v2-native-head-draft.png` was actually opened through view_image. It shows real96×128composites at2×nearest with cyan126ground, right above and left below. Full metadata is in `verification/locomotion-native-head-composition-v27.json`.

## Female-right v2 review

The supplied `exec-97a988b0-ba62-4456-9874-ff95539e6c85.png` was opened through view_image. The opposite leg depth shading in contact C is improved. Contact A/C arm ownership remains less clear than the new male side sheets in this agent's independent reading, so this report does not grant female body acceptance. No female export or head operation was performed yet.

## Status

Everything remains draft; `locomotionActorsData.actors` remains empty. These are explicitly **derived raster head/body compatibility layers**, with immutable image_gen masters retained. They are not an editable master, a complete new layered wardrobe or a claim that every game action now shares the new art. Root's native contact/neck/mask review is required before activation.
