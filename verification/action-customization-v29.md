# Human-action customization: v29 hair / alpha correction

Technical runtime freeze: `game/web/actor-sprite.js` SHA256 **b8e838a0d8de5260c1c72a7e0fbca7e014249a5ee91fd6ba00363fd00b5c1fa2**. Source API, source-actors, C/L/A data and original art were not edited by this agent. Root-owned pantsStyle2 block is byte-for-byte unchanged. `action-customization-v29/freeze.json` records exact hashes and metrics.

This approves only the evidenced code correction. **Legacy action body/style art is not approved. A canonical head graft does not establish a correct canonical full-body pose.** New action bodies must preserve the canonical model, proportions, palette, head/body ratio and authored pose, and receive their own visual review.

## Proven source-pixel failures

| Original source clip / frame | Native 96×128 witness | Failure / cause |
|---|---|---|
| female-carry-right / 2 | (64,66)=[222,128,88,255] | Hair replacement removed genuine face flesh. No white-eye seed and no authored face polygon produced an empty face mask. |
| female-mug-standing-left / 4 | (54,40)=[236,160,114,255] | Hair removed actual face/ear. A white cup at (22,52), outside actual head.left=26, was incorrectly accepted as an eye within the expanded search ROI. |
| male-pet-back / 2 | selected H6 white (27,68)=[255,255,255,255] | Coarse shirt/outfit transfer ran after hair drawing and replaced lower strands with garment/skin colors. |
| male-pickup-right / 2 | (36,83)=[65,59,60,255] | Existing gray jacket alpha was erased because the search ROI extended outside actual head.left=40 into a bent sleeve. |
| male-pickup-left / 2 | (57,83)=[65,61,65,255] | The same actual sleeve defect also occurs inside imprecise legacy head bounds; a bbox-only guard is insufficient. |
| male-pickup-front / 2 | (38,93)=[120,81,61,255], (39,93)=[190,122,81,255], (58,93)=[201,144,107,255] | Dark hands touching the source head were assigned to the warm crown component and tinted as hair. |
| male-pickup-front / 2 | (32,70)=[71,40,32,255] | Retained natural scalp was overwritten by a coarse t-shirt edit after registration correction; source hair needs the same priority as selected strands. |

Coordinates refer to the original uncomposited source pixels, not a newly generated face. `game/tests/action-customization-v29.test.mjs` explicitly decodes original fine/coarse PNG frames and exercises the production customization functions so future canonical action exports do not invalidate historical pixel probes. Canonical standing phone remains a real integrated renderer test.

## Correction

- Legacy faces independently retain genuine lower-head flesh and surrounding native eye/lip/ear outlines, including closed/black-eye poses. RGB detection does not synthesize a replacement head. A legacy pose without authored or detected registration keeps existing alpha rather than clearing an unknown hidden face/neck region.
- White-eye candidate centers must lie inside actual source head bounds. Side fallback registration uses the direction-specific expected eye position, not the general head center. No head/body resizing or independent X/Y transform is introduced.
- Hair clearing and overlay respect real source flesh components, including raised hands outside the head. Rear nape protection follows authored neckAnchor when available.
- Existing neutral garment components are identified by connectivity to original cloth below the head and retain their real dark contour. Hair clearing cannot erase these components or classify them as tintable natural hair. Selected independent strands may still cover clothing naturally; no unknown body pixels are painted.
- Selected/tinted hair AND retained natural source hair precede coarse wardrobe transfer. Garments cannot cut the lower strands off, recolor their lower half, or overwrite a bent head with fixed shirt geometry.
- A warm source component touching both a crouched head and dark hands is separated at the body boundary. Genuine body flesh midtones seed its own source-only anatomical mask, preserving existing hand shadows and outlines instead of tinting them as crown hair.

## Verification

`action-customization-v29/red.log`: replay of saved initial 685e6 mask, **6 FAIL / 3 PASS**, on the original literal source witnesses. `drink-red.log`, `cloth-red.log`, `cloth-inside-red.log`, `dark-hand-red.log`, `natural-scalp-red.log` retain intermediate genuine RED discoveries. The scalp-priority failure arose after the correct registration changes exposed retained source hair; it is separately evidenced in natural-scalp-red.log. The final initial-mask replay uses the same 9 action tests as the final correction.

`action-customization-v29/targeted-green.log`: **23/23 PASS** — 9 action/source pixel checks, 6 native hair checks, 8 head-item/garment checks. Coverage includes both current models, all idle/walk/run directions and phases, 12 hairstyles, current authored face RGBA, safety edges, nape, glasses, ears, coat, raincoat, exact body/hands under hair tint. The parent runs the full project regression after integration.

`action-customization-v29/after.json`: **5,544 actual render requests / 3,528 diagnostic rows / 123 selected source clips**, stable before/after hashes. It covers 2 genders × 4 requested directions × 21 action selections, all 12 styles in brown/white, and 9 garment changes for H6. Representative action progress .5 / source time .25; it is not exhaustive over the complete 3,753 imported human frames. `actualFacing` records actions constrained to a source direction rather than inventing missing directions.

The stronger neutral-source alpha scan (opaque original source r>=45, RGB spread<=8, near the head/neck) had 63 candidate cases before connected-cloth protection and **0** in the stable final run. Raised-hand color-change candidates: **0**. These are measured scans, not a guarantee that every artistic alpha defect is absent.

Remaining long-strand RGB differences: **0 for all nine tested garments except beast outfit5 (1,764 crown ear-overlay pixels)**. The initial 12 non-beast residuals were investigated rather than dismissed: 10 were actual dark-hand misclassification and 2 were retained-source scalp overwritten by a t-shirt. Both now have literal source regressions and measure 0 in the stable final run. RGB-only “warm pixel” totals also include eyes, brows and body shadows, so are not used as automatic art approval.

## Viewed actual evidence and remaining art gaps

`action-customization-v29/witnesses-before.png` / `witnesses-after.png`: raw fine PNG, actual default bitmap, brown hair, white hair, white hair with clothing. Seven rows cover the sleeve/face/strand cases plus talk, phone and inventory/raincoat. They were rendered and viewed; JSON siblings include source detail rect/path/SHA256. Before replays the saved old mask against the same current source data. The initial baseline.json keeps the initial older C/L/source hashes separately.

`action-customization-v29/all-actions-{male,female}-{down,right,up,left}.png`: **2,016 actual white-hair renders** in eight contacts; stable hashes and selected frame metadata are in all-action-contacts.json. The full contacts exposed the false cup-eye and true gray sleeve defects, which were then reproduced with literal RED tests and corrected. Visual review also still shows old female source forehead/hair regions and different action-body proportions in inventory/equip/drink/door/other legacy actions. These are unresolved canonical source/body art gaps, not evidence that the code correction is a complete visual finish.

Some initial talk “neutral holes” (e.g. x21,y59) are old hair ends rather than proven shoulder pixels. A blanket below-head alpha guard was tried, visually rejected because it retained collar-like old hair spikes, and removed. Missing body under long source hair requires a real authored under-hair/body master; preserving or deleting old strands cannot establish that missing layer.

Standing and seated phone use the core agent’s stable canonical bases plus separate phone prop. Other legacy body/style mismatches remain until correctly drawn canonical action poses pass visual review. No browser/physical-phone or complete-game approval is claimed here.
