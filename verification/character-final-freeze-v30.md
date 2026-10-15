# Character final runtime freeze v30

This report is limited to **ONE selected avatar**: male H7 tail / white hair6 / dark skin3 / lime shirt8 / shirtStyle2 / outfit0 / headwear0, other defaults. Root is continuing actual UI review of this same figure. No new hairstyle, palette or gender visual acceptance is added here.

## Current SHA256

| Runtime file | SHA256 |
| --- | --- |
| `game/web/source-actors.js` | `a101e25573dd30747c40477e738ce5eb40857f7881cff9a7c48338f4795cb071` |
| `game/web/actor-sprite.js` | `be8e935642374699951146083fbef4ec1ad690a7de8a06ae2153f34dc9b4271b` |
| `game/web/avatar.js` | `d95537f37d3e2e4404a233f5a4c3f5c555a90b6e7c8153323d53559f09220422` |
| `game/web/canonical-actors-data.js` | `d24ca352e05bf07c32b21ffe6775a53be6feebe3c047b61069245fccfef3a7eb` |
| `game/web/locomotion-actors-data.js` | `ca80688f968f0fa059d584e5eac3a6bd035bec515498e4d06bfbd6176a7e8b73` |
| `game/web/interaction-actors-data.js` | `34a771f62dc4ad38f5efd79788dd681b2ffe1a79751f4d4ce27faa23657cffa6` |
| `game/web/action-effects.js` | `a0b50650eb50dc71e63ffd55ecd9f764045fed2689de546736d65bf95de3861b` |
| `game/web/world.js` | `a94b566cde2bede8e931bfcbfd10886312d96f1bfb7cd9bd9cb96dde403a692b` |
| `game/web/source-city.js` | `c62fab72533f4cde0492e4b23ac2d4b70e357ec4470d1c3dfde47f8b25199520` |

All nine runtime files were read before and after this report-only update. Runtime/tests/assets were not changed, and no new raster or browser/style/gender review was run by this reconciliation.

## Exact scope and evidence

The walk fix introduced at `c73e4d0…`, retained in current `a101e255…`, selects the **same approved whole-pose locomotion sequence for ordinary walk and run**. The caller controls speed and distance cadence. This is reuse of the approved run artwork, **not new walk art**. Explicit archive animationId/sourceAction retains original source clips.

The current [one-avatar audit](h7-focused-v30/review.md) and [audit JSON](h7-focused-v30/audit.json) record the earlier `c73e4d0…` source and unchanged current actor/C/L/A material-data hashes:1,164 requested states deduplicated into292 snapshots,256 canonical plus36 explicitly historical specials. Complete native figures were viewed in21 contact sheets. For the canonical subset: fine UI/world differences0, residual coloured authored scalp0, opaque canvas-edge cases0, protected face RGBA changes0, source-body alpha losses below authored neck+2fine0, detached large head/body graph cases0. Those measurements have the exact masks/thresholds and limits documented in the linked audit. They do not certify every internal source-art pixel or every hairstyle/outfit.

The narrow LEFT H7 correction removes exactly5 disconnected retained scalp pixels. The actual native before/after regression keeps every other12,283 pixel RGBA exact. [Comparison](hair-tint-v30/h7-left-islands-before-after.png); [RED](hair-tint-v30/h7-island-red.log); [GREEN2/2](hair-tint-v30/h7-island-green.log). The existing targeted regression log at that earlier source snapshot records [53/53 PASS](hair-tint-v30/h7-targeted-green.log); it was read, not rerun for this report update.

Archived **sleep/jump/wave are visually unapproved**. They still use old source bodies; the sleep compatibility clip can show a floating selected cap. Their archive contacts remain in the focused audit. No claim of complete visual quality for all public archive actions is made.


## Subsequent finite-contact and throw-envelope freeze

Earlier source `e8b28698…` / world `66c1cb90…` added narrow consumer corrections after the256-pose material audit. [Pet contact](pet-contact-v31-report.md) registers the existing whole animal head socket beneath the actual selected human palm and selects one shared finite reaction phase. Original body artwork and actor/C/L/A material data remain unchanged; this is not a new animation clock or new hairstyle. Its existing technical regression is95/95 PASS, separately scoped from one-avatar visual acceptance.

The native source bin slot exposed a genuine actor-texture clipping defect:25 real paper pixels at the opening were clipped to0 by old bounds. [Throw bounds](throw-bounds-v31-report.md) now use a constant conservative envelope of the same existing actionFlight path. The actual-canvas RED2→GREEN11/11 and [independent post-fix native review](bin-slot-independent-v31-after-bounds-fix/review.json) preserve25/25 paper pixels for BOTH current bins in the same maleH7 preset. This is native-renderer proof; the final18 frame actual-game contact was subsequently viewed by root and the independent reviewer, as recorded below.

Root viewed fresh actual-game [pet14](avatar-one-v31/retake-contact-pet.png), [pick24](avatar-one-v31/retake-contact-pick.png) and [throw16](avatar-one-v31/retake-contact-throw.png) contacts of this same avatar before the final bounds correction. Root captured [18 final bounded-throw screenshots](avatar-one-v31/frozen-throw-captures.json) and built [the final contact](avatar-one-v31/frozen-contact-throw.png); both this18 frame contact and the fresh four-direction clear-route retake were subsequently viewed by root and the independent reviewer; see receipts below. These records do not expand scope to another hairstyle/gender or imply complete physical-phone/boat acceptance.

The separate daily-repeat pickup no-op/notice fix is documented in [litter-result](litter-result-v30-report.md); app/economy hashes are recorded in JSON. The root [final handoff](avatar-one-v31-final-handoff.log) passed156 static routes with a temporary database and no external request/live-database mutation.

Earlier world66c1 full check:13 tools /348 Python /934 Node PASS at `2026-10-15T16:24:04.635269Z`; preserved as historical in JSON. The subsequent13/353/940 run also predates the final late-action guard and is not relabelled the current result.


## Current proper-pickup freeze and final verified result

Current world `a94b566c…` / source `a101e255…` implement the proper pickup stance and final late-action ordering guard. The actor, avatar, C/L/A and all character PNGs remain unchanged. [Pickup report](pickup-stance-v31-report.md): collision-checked short normal-L approach, server-accepted arrival before action, actual LOWER hand/ground contact at.43, own-account/day collected floor/nearest filtering. [Independent review](pickup-independent-review-v31.md) and [resolution](pickup-independent-resolution-v31.json) close the reproduced late previous-day action response bug:105/105 targeted,7/7 independent mount and5/5 server tests PASS. No style/body warp or new artwork is introduced.

Root and independent reviewer viewed [four-direction gait plus DOWN recheck](avatar-one-v31/independent-frozen-gait-inventory-review.json):61 screenshots /54 moving, and [final bounded throw18](avatar-one-v31/independent-frozen-throw-review.json). [Proper-pickup UI](avatar-one-v31/independent-pickup-stance-review.json) covers before+12 contact frames/full/reload/inventory and11 follow-up throw frames. The ordinary visual clip predates the final ordering-only guard; that guard's late-action behavior is independently checked on current a94. No unrecorded full cycle/all-action acceptance is inferred.

Root reloaded the current a94/a101 build at `127.0.0.1:8797`, tab3 marked Deliverable, same ONE H7/daylight, and viewed [latest screenshot](avatar-one-v31/latest-game-one-preset.jpg) and [one-preset proof](avatar-one-v31/one-preset-game-proof.png). Actual inventory showed rod1/trash1 after pickup and [rod1/trash0 after binning](avatar-one-v31/pickup-stance-final-inventory.jpg); [UI text](avatar-one-v31/pickup-stance-final-inventory.txt). These are attributed root UI observations, not a new browser run by this document writer.

**Final current full check:13 tools /353 Python /941 Node PASS,0 fail/skip**, root-confirmed at `2026-10-15T16:51:37.520373Z`; [project-full.json](project-full.json), [current command](avatar-one-v31-final-current-command.log). [Fresh handoff](avatar-one-v31-latest-handoff.log):156 routes PASS, temporary database, external requests/live-database mutation false. JSON records exact current runtime/log hashes and retains the earlier full result as history. Technical PASS is not all-art/all-hairstyle/game approval; archived sleep/jump/wave, layered master and current physical-phone/boat scope remain unaccepted.

Root’s narrow final handoff summary: [FINAL-RESULT](avatar-one-v31/FINAL-RESULT.md), [JSON](avatar-one-v31/FINAL-RESULT.json). The latest limited warn/error retrieval returned no entries ([console snapshot](avatar-one-v31/latest-game-console.json), limit30); it is not a guarantee for every past/future action.

## Existing resources and provenance

The JSON retains the earlier inventory of C8idle/16PNG, L32run/64PNG and A104family frame references/176uniquePNG (HAND32, LOWER32, SEATED32, WATER8). C/L/A module hashes match that recorded inventory. This read-only pass did not rehash or recount every PNG and did not re-review another gender. Resource presence/previous art receipts are not blanket wardrobe or visual approval. LOWER0/3 reuse HAND0/1; WATER boat holds the approved seated row pose, without claiming a new rowing loop. Whole-body raster compatibility is not a complete editable layered master.

Standing phone uses exact selected C idle; seated phone retains the SEATED neutral body. Native fine UI uses the same customized world bitmap and explicit head/face masks. Mouth items preserve approved foreground palm pixels; rear occlusion and six fingertip cigarette sockets remain unchanged. WATER equipment geometry is a separate effect-renderer concern; this body audit does not approve its current browser attachment.

Previously root-approved source-backed extraction repairs preserve literal existing neck/collar RGBA rather than paint bridges or stretch figures. Receipt paths and the earlier74-test source evidence are retained in JSON as historical evidence, not relabelled as tests of this new hash. Relevant receipts:

- [L run neck repair](run-neck-repair-art-review-v30.md).
- [C LEFT correction](c-left-neck-v30/root-approval-receipt.json).
- [C additional collar samples](c-extra-neck-v30/root-approval-receipt.json).
- [A combined16 correction](neck-retention-v30/combined-root-approval-receipt.json).

Root owns final full-suite results and actual same-avatar browser/physical-phone acceptance. This report does not claim full-game completion or completion of unapproved archive art.
