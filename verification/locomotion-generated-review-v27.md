# Independent generated gait review v27

Read-only visual assessment of three root-generated1254×1254 transparent2×2sheets. All were opened through view_image; male-right was additionally extracted into four untrimmed627×627cells and each native cell was viewed separately. No production metadata, runtime PNGs or approval flags changed.

## Findings by sheet

- **Male-right** (`exec-a28f3dbe-f769-4e1b-a2c0-92b9e78ebe58.png`): contact0 has the prominent near sleeve extending back to the left-screen hand; contact2 visibly places that prominent near forearm forward across the chest. This is a useful improvement over the prior one-sided contact. However passing1 and passing3 both show a front/right-screen raised knee, rear/left-screen planted leg and prominent near arm down/back. They are too similar in ownership to establish the required opposite passing phase. The dark pants also make contact leg depth less certain than arm depth. **Not accepted as a complete anatomical cycle**. Head silhouette/size also drifts; no head acceptance.
- **Male-left** (`exec-a0e98852-4048-4651-8b08-b0d38b0ad240.png`): contacts0 and2 both retain a forward far/left-screen hand and back near/right-screen hand with similar sleeve overlap. Passing3 finally brings the prominent near arm across the chest, but contact2 does not demonstrate the required reversed ownership. Head and vertical registration drift between rows. **Not accepted**.
- **Female-right** (`exec-c4d8885e-d48d-41e5-bdd8-858fb782f7d0.png`): contacts0 and2 both put the prominent near forearm forward and show the same wide side-stride silhouette; opposite near/far leg support cannot be read reliably from either. Passing1 and3 change the screen position of the lifted shoe, but the torso/arm ownership does not establish a complete opposite half-cycle. Hair/head shape varies. **Not accepted**.

The visible screen side of a foot is not by itself the anatomical ownership of a limb. A valid review needs a traceable hip→knee→ankle chain and shoulder→elbow→hand overlap, consistent in contact and passing phases. Distinct hashes, four cells, opposite horizontal shoe positions or an instructive generation prompt cannot substitute for those visible relationships.

## Preserved draft, no invented prompt

`art/drafts/locomotion-v27/male-right/sheet.png` is a byte-for-byte copy of the image_gen result. `phase-{0,1,2,3}-master.png` are exact full627×627cell extractions with unchanged alpha, no bbox trimming, resizing, flip or pixel repaint. `prompt-info.json` records original path/SHA/dimensions and explicitly records exact prompt text as unavailable to this agent rather than inventing it.

`landmarks.json` contains manually authored root, pelvis, neck, eyes, ears, hands and shoe witness points in each fullcell coordinate space, with explicit approximate±3source-pixel precision and anatomical concerns. Proposed one uniform fine export scale0.2125 and target96×128/anchor48,126 are recorded; no per-frame fitting is specified. No runtime-sized PNG has been promoted, because the parent's condition “only if anatomy is correct” is not yet satisfied.

## Proposed next artwork correction

Use image_gen edit on male-right phase3 to depict the opposite passing ownership: prominent near forearm forward and the opposite leg passing, while retaining the approved identity. Re-review all four poses together afterward; do not infer that correcting one cell automatically approves the others.

Hair-agent coordination: existing `{facing,head}` API remains unchanged. For a later accepted export, optional coarse48×64 `head.eyeAnchor`, `eyeLine`, `neckAnchor`, `scalpPolygon` and face polygon including ears can travel in the current head object. A real alpha head extraction attached by authored neck translation may be considered separately, with one fixed body scale and an explicit derived-raster scope. No rectangular neck/arm stripe or limb warp is justified; no such operation was performed here.
