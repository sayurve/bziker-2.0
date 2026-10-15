# Actual selected female H7 — static locomotion head

The earlier male-only result is historical and did not fix the actual selected model. Root verified the editor/account avatar in the isolated QA clone: gender1,skin7,hairStyle7,hairColor6,shirtStyle2,shirtColor8,pantsStyle0,pantsColor1,accessory0,shoesColor0,outfit0,headwear0. This report uses that exact preset. No account/UI setting was changed by this agent.

Source now applies the same H7 stationary-head mechanism to each gender's own approved C donor. It does not substitute a male face for the female model. The approved source L frame still controls the four original body/arm/leg poses and roots; returned rendered head metadata uses the constant own-C head. Original source head metadata remains separately available for body customization. Other hairstyles keep their previous output.

Female-specific seam annotations are narrowly source-backed: RIGHT transparent destinations(38,65),(39,65),(40,65),(41,65),(38,66),(39,66),(40,66) take actual customized female C collar RGBA only when raw C is opaque and L output is transparent. LEFT phase0 endpoint(37,65), phase2 endpoint(36,65) are removed only when the actual source material is#1f0909, they are outside the new C mask, and still match the original customized source. These are old jaw residues after head relocation. No new skin/body pixels were invented, no rectangle/limb shift/warp, no PNG/data asset modification.

Female RED is preserved in `static-head-female-v32-red.log`: all4female directions failed exact static C pixel checks before the scope correction. Final static10/10 PASS in `static-head-female-v32-green.log`: all4directions for male skin3 historical and female skin7 actual; >1000actual head/hair pixels match own C for all4phases; authored head metadata agrees; exact original lower body/soles and positive exposed-hand pixels stay intact; all4body phases remain different; one connected head/body with no new residue islands. The unchanged-style check still covers both models, with H7 moved into the positive static tests rather than omitted.

Legacy hairstyle tests now select the actual own C face authority for H7 on both genders, L authority for other moving hairstyles. They still compare every visible eye pixel above the authored neck and all protected authored face RGBA over all12hairstyles/twohaircolours, with no numerical tolerance. Broad native/source/avatar/pickup/pet/throw run74/74 PASS (`static-head-female-v32-native-green.log`).

Actual production fine-canvas contact: `static-head-female-v32-contact.png`, generated and viewed after final correction, C idle plus L0..3 in all4directions. Head and H7 are fixed; the original torso/shoulder silhouettes remain authored as before. This does not claim that the LEFT torso has been redrawn upright or that a physical-phone review was performed. Root owns actual-game retake and full-suite acceptance.

Freeze source SHA256:0826a5e7b45f2bdd2a409dcbb148c7ba91b7ef70fb27ad47b68d7968d1491f75.
Static tests SHA256:4b64bc6142d3b5baa6ae636a103c2494ae3bc6bc5f78a57d4e1ffb7153e3b423.
Hairstyle authority tests SHA256:028d4222fceced25e876c6978d780a43e7473d348fa3f4e5474cca41c5fd36ed.

All C/L/A manifests and PNGs, actor-sprite.js, avatar.js, world.js and original Bziker unchanged in this correction. No additional stylesheet/account/mutation/art-generation scope.

## Final body-prop registration follow-up

Independent review found that moving trash still used raw L body pixels but took its fallback scan boundary from the new rendered C head. Female DOWNphase1 changed the fallback from the real coarse palm(35,44) to the opposite hand(12,45). The correction is one expression: drawProp uses `(frame.sourceHead||frame.head).bottom` for body-anatomy fallback, while rendered head authority remains C. Head pixels are unchanged from the0826contact.

New actual native drawImage regression compares moving H7 trash placement against the same unchanged L body with natural hairstyle over32poses (2genders×4directions×4phases). Female skin7 witness must draw the actual7×7PNG at destination[63,81,14,14], corresponding to coarse palm(35,44). RED preserved in `static-head-held-prop-v32-red.log`; final26/26 targeted PASS in `static-head-held-prop-v32-green.log` (11static/bodyprop +6nativeface/eye +2locomotion +7pickup). No additional visual/body/colour changes.

Final source SHA256 supersedes0826: a6377f7840eeb2da912266488105876d53d3e8533b47d8a31758bc3cc0366ef5.
Final static test SHA256: df52133f7c8442e961594551c25d7a3a844f082dc43e1509ed4443f872ae42fb.
Legacy authority test remains028d4222fceced25e876c6978d780a43e7473d348fa3f4e5474cca41c5fd36ed.
