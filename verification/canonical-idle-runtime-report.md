# Canonical whole-pose idle runtime integration

The source selector now imports the converter-owned `canonicalActorsData` module.
For an actor, canonical images are preloaded and idle selected only when the actor
has `status: approved`, `artReview.checked: true`, and a nonempty evidence array
containing nonblank strings. Draft/unreviewed/missing actor records use the original
source fallback and are not preloaded.

The canonical selector is after every supported action, movement, seated/phone
and held-litter branch. It changes idle only. The `canonical-idle-*` sequence ID
does not enter the old `На_месте` standingProportions workaround. Head-only and
anonymous generic previews automatically share the new canonical idle selector;
female remains the old source when absent from canonical actors. Existing three
motion fixes and walk/run selection are preserved.

Owned file changes:

- `game/web/source-actors.js`: import, approval gate, approved image decoding, idle lookup.
- `game/server.py`: only root and `/web/` aliases for canonical-actors-data.js.
- `game/tests/canonical-idle-runtime.test.mjs`: isolated contract regression tests.

No canonical PNG/data/converter, artwork approval, movement-controller or clock
files were changed by this runtime subtask.

## Executed contract checks

```text
node --test game/tests/canonical-idle-runtime.test.mjs
```

Bundled Node v24.19.0: **5 fixture tests passed, 0 failed, exit 0**.
`canonical-idle-runtime-red.txt` records initial three missing-feature failures;
`canonical-idle-approval-red.txt` records the missing approval gate failure;
`canonical-idle-runtime-fixture-green.txt` contains the passing output.

These tests execute the actual source module in isolation with a converter-shaped
manifest and inert image handles. The color functions are stubbed only in this
contract fixture to avoid the actor-sprite/action-effects circular import before
the converter-owned real data module exists. No image fixture is written or
claimed production artwork. Tests cover four male idle views, absent female,
coarse/detail preloading, retained original resources, all action bypasses,
head/generic selection and every approval rejection condition.

## Native validation dependency

The converter module and all eight native PNGs now exist and were inspected.
All four fine exports were viewed with view_image: complete front/left/right/back
figures, compact run-canonical proportions, genuine alpha. This subtask did not
assign art approval. Root completed the art review and recompiled the actor as approved, with checked artReview and recorded evidence.

Two additional native tests decode all eight real exports, check actual dimensions,
transparent margins and character pixels, per-pose metadata, and actual preload/
selection scope. The earlier draft phase was excluded from preload and selection and passed
**63/63** targeted tests (`canonical-idle-draft-native-green.txt`). In the later
approved phase, actual preload includes all eight canonical PNGs and the four
canonical idle poses are selected. Female remains the prior source fallback.

The combined command is:

```text
node --test game/tests/source-motion-audit-regression.test.mjs game/tests/walk-cycle-v10.test.mjs game/tests/pet-motion-v12.test.mjs game/tests/actor-motion-v25.test.mjs game/tests/source-actors-v17.test.mjs game/tests/world-v5.test.mjs game/tests/water.test.mjs game/tests/source-head-v17.test.mjs game/tests/canonical-idle-runtime.test.mjs
```

## Approved-mode feature fix and final regression

The first approved-mode run found two stale source-head coordinate assertions, and
a separate quality run found two assertions requiring idle pixels to equal a run
frame. Those assertions encoded the retired donor-head workaround. Native idle now
retains every selected idle PNG pixel; run remains separately preserved byte for
pixel. Long-hair checks now verify visible selected strands, purple material and
ground contact in both independently authored poses rather than identical pixel
locations between poses.

An additional real regression was reproduced: the old portrait chin (head.top+18)
clipped the lower rows of the canonical eyes. RED evidence is in
`canonical-head-feature-red.txt` (native eye at coarse 19,25 was removed). Measured
first neck/collar rows were down31, left30, right29, up30. Root added these authored
`head.portraitChin` landmarks to the converter output. Runtime sourceHeadGrid now
uses that optional landmark and loops through max(head.bottom,chin); the original
fallback default and 40px portrait canvas are unchanged. sourceCrop.bottom records
the effective crop edge.

New native regressions inspect complete pupil/sclera pixels in front and both side
views, compare native face pixels to the chosen actual source atlas, verify eye
removal in face-free previews and absence of shoulders/torso. Before/after QA PNGs
were viewed: `canonical-head-review.png` and `canonical-head-review-after.png`.
The latter is reproducible with `render-canonical-head-preview.mjs`.

Fresh final command from project root:

```text
node --test game/tests/actor-*.test.mjs game/tests/avatar-*.test.mjs game/tests/source-actors-v17.test.mjs game/tests/source-head-v17.test.mjs game/tests/source-motion-audit-regression.test.mjs game/tests/walk-cycle-v10.test.mjs game/tests/pet-motion-v12.test.mjs game/tests/world-v5.test.mjs game/tests/water.test.mjs game/tests/profile-builder.test.mjs game/tests/canonical-idle-runtime.test.mjs game/tests/character-lab.test.mjs
```

Bundled Node v24.19.0: **118 passed, 0 failed, exit 0**, complete log
`canonical-idle-approved-native-green.txt`. Existing Python static dependency check
also passed, exit0 (`canonical-idle-static-green.txt`). This is the targeted actor,
portrait, customization, motion and related world regression, not a whole-game or
browser acceptance claim. Browser and physical phone were not used by this subtask.

Additional owned test updates are `source-head-v17.test.mjs` and
`actor-quality-v23.test.mjs`; the source fix is confined to portrait cropping. Root
owns the canonical master PNGs/data/converter/status and the nested PNG route.
Walking/run selection, world movement, controller, clock and earlier motion fixes
were not changed by this canonical integration follow-up.

Root added the specific nested `/assets/canonical-idle-v2/*.png` route; this
subtask changed only the two canonical module aliases. The old unrestricted asset
policy was not broadened by this runtime subtask.
