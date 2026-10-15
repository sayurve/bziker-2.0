# SEATED / WATER native source review v30

Created 10 whole-body sheets using the built-in image generator: 8 SEATED (two models, four authored directions, neutral/chest/mouth/reach) and 2 WATER (two models, right only, cast/hold/reel/row). All 10 original outputs remain byte-identical; prompts and `metadata-v30.json` sit beside each master under `art/drafts/canonical-actions-v30/{seated,water}/`. Actual size is 1086×1448; requested size was1536×2048. The original Bziker, runtime code, C/L and approved art were not changed by this work.

Each derived body uses the same128/724 uniform factor, authored source-isolation rectangles in empty sheet gaps and integer root translations. No silhouette fitting or per-axis stretch is used. Original isolated source PNGs, registered whole source frames, body-only frames, final96×128 fine frames and48×64 coarse frames are preserved individually. Head donors are the current male C head and the woman's own approved C head. Renderer alpha semantics are explicit: A≤127 becomes transparent; A>127 becomes opaque.

The independent checks in `canonical-seated-water-checks-v30.json` cover40frames: 0 clipped opaque source pixels, 0 clipped head pixels, 0 canvas edge ink, 0 canonical donor RGB/alpha mismatches outside authored hand foreground, 0 disconnected figures and 0 stray alpha islands. The source exporter originally retained a transformed clipping region, which altered28 crown pixels on two male-down poses; the donor comparison exposed this and `save/restore` corrected it. Real palm/raised-arm foreground polygons preserve actual source pixels and allow the gesture to overlap the canonical face.

A separate closed-alpha scan found small collar gaps missed by connectivity alone. The before/after8× comparison is `phone-action-audit/neck-gap-{before,after}-v30.png`. Authored source neck/collar domains and27 exact contour pixel coordinates retain existing source RGBA; nothing is painted or stretched. The final scan reports **0 erased opaque source pixels inside remaining enclosed transparent regions**. Thirteen frames retain existing source negative space at knees, fingers or small silhouette pixels. This metric is not a blanket artistic approval of every transparent component.

Both complete source contacts were inspected by the materials agent and root. Root explicitly accepted new body style, proportions, same canonical faces, genuine seated knee bends, female-UP's2fine-pixel neck variation and male-DOWN mouth's1fine-pixel variation as limited native-body review. Root additionally viewed the final8× collar preservation contact and reaffirmed limited native-source approval; the JSON receipt freezes all40 fine-frame hashes. Static phone must use SEATED neutral frame0, with no body animation.

Staged consumer metadata: `art/drafts/canonical-actions-v30/seated-water-staged-actors.json`. It supplies authored pelvis/hand/head metadata and WATER `rod_hand`, `water.rodHand`, `water.rodAngle`, and equipment `water.sourceScale=0.305`. The equipment factor belongs to the original rod geometry contract; it is not the body raster export scale. Runtime boat position, fishing equipment rotation/occlusion, seat attachment, customization and action timelines remain separate integration checks. The staged family status is approved for these exact reviewed native-source bytes. Runtime integration remains unapproved by this receipt.

Reproduction from project root, using the bundled Node that resolves `@napi-rs/canvas`:

```sh
NODE=/Users/sapp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node
"$NODE" verification/phone-action-audit/compose-seated-water-v30.mjs
"$NODE" verification/phone-action-audit/verify-stage-seated-water-v30.mjs
"$NODE" verification/phone-action-audit/scan-alpha-holes-v30.mjs
"$NODE" verification/phone-action-audit/export-isolated-source-and-neck-qa-v30.mjs
```
