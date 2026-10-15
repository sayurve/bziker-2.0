# Gender head style comparison — draft choice

Profile В. Root requested the same drawing style for male/female and authorized a shared native male face/head as a candidate. This report does not activate that candidate or approve new female bodies.

Actually viewed through view_image:

- `verification/gender-native-run0-four-directions-v27.png`: original D.run0 whole poses, both genders, four directions, same native scale.
- `verification/gender-native-versus-shared-heads-v27.png`: four columns down/right/up/left, fixed96×80view window at identical2×zoom; rows native male, native female, shared-head male proposal, shared-head female proposal.

The original female run0 face/hair clusters and eye shape differ from the male run0 reference. Her native no-overlay head includes long hair, while the current option0label means short. The shared candidate uses literally the same male head pixels for both genders/direction; byte equality is checked. It does not recolor, resize, stretch or fit the face. Selected hair0/6 remains the separate real hair customization responsibility, not baked into this style comparison.

Four directional native male alpha-head candidates plus old female comparison extractions are saved in `art/drafts/locomotion-v27/shared-head-style-proposal/`. `proposal-evidence.json` records sourceKey, exact source rect, atlas SHA, derived head SHA, mask origin and coarse eye/neck metadata. Male side masks/face/scalp authorities also have full provenance in `verification/locomotion-native-head-composition-v27.json`. These are derived raster parts and review metadata, not a claim of a complete editable/layered wardrobe system. Old female head extraction masks are for comparison only; they are not new accepted hair authority.

Female v1/v2 three-quarter body candidates are rejected for this integration: a shared head cannot repair an inconsistent torso camera or material rendering style. They were viewed but not installed in runtime or exported as accepted locomotion. Root is generating new female bodies by editing malev2poses while retaining all gait geometry, camera, shirt and shading style. Pending those sources, shared-head composition remains a proposal.

Planned female body uniform scale0.20 versus male0.2125 means body scale ratio0.941176, or5.88percent less. Since the head remains1:1native, the final full foot-to-crown height must be measured after composition; it is not automatically5.88percent shorter. No independent X/Y scaling is permitted.

Reproducible matrix command: bundled Node24.19.0 `node verification/gender-head-style-proposal-v27.mjs`, exit0. No production game source/data/PNG or original Bziker changed during this style comparison. New clips remain disabled pending root's native art review.
