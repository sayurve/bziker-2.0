# Reviewed whole-pose locomotion override

Profile В. Infrastructure only: no new artwork is activated, production manifest `actors:{}`. Root owns image generation and visual acceptance. Source hair/customization functions and APIs are untouched. World continues selecting run as requested; clock/world motion code is unchanged.

## Runtime contract

`game/web/locomotion-actors-data.js` exports `locomotionActorsData={version:1,actors:{}}`. Each future actor entry has `status`, `artReview:{checked,evidence}`, aggregate `images`/`detail_images` and `run:{right:SEQ,left:SEQ,...}`. A sequence uses the existing source shape: four full coarse48×64 frames, anchor24,63, sprite_size48×64, explicit image pages, optional fine96×128 `detail.factor:2` per frame and authored coarse head metadata. Each coarse/fine pose can remain its own PNG; no atlas is required.

Selection applies only inside the existing locomotion branch when `running` or `action:'run'` is requested, before the legacy run lookup. Absent actor/direction, draft, missing review, empty evidence or incomplete/malformed four-pose export leaves the existing source clip intact. `allowDraft` cannot activate this production path. Explicit source animation IDs, ordinary walk, idle, held props, seated and phone adapters keep their existing behavior. Native phase remains0,0,1,1,2,2,3,3 from the shared accepted-distance clock; origin/canvas/anchor are unchanged.

`loadSourceActor` additionally decodes the aggregate coarse/fine pages only for approved reviewed entries. Normal original/canonical resources remain included. An approval gate is not an image quality judgment: root must visually accept the actual poses before populating approved data.

## RED → GREEN evidence

With the new empty module but no override implementation, the six new tests produced3PASS/3FAIL: approved run still selected07_Бег_Справа, approved gait did not select the supplement, approved coarse pages were not loaded. After the implementation, **6/6 PASS**. Tests use explicitly marked in-process fixtures made from existing native poses, not production art approvals. They verify both genders, phase indices, coarse/fine dimensions and anchor, missing/draft/malformed fallback, retained explicit/phone/seated adapters,60/120/240Hz accepted-distance motion and resets, actual approved-only image loader calls and byte-identical fine rendered pixels/custom recoloring versus the original fixture poses.

Targeted command:

```sh
node --test game/tests/locomotion-override-v27.test.mjs game/tests/source-actors-v17.test.mjs game/tests/source-motion-audit-regression.test.mjs game/tests/canonical-idle-runtime.test.mjs game/tests/source-head-v17.test.mjs game/tests/walk-cycle-v10.test.mjs game/tests/world-gait-continuity.test.mjs
```

Bundled Node24.19.0, exit0, **41/41 PASS**. Actual log: `verification/locomotion-override-targeted-v27.log`.

## HTTP routes

Exactly two new module aliases: `/locomotion-actors-data.js`, `/web/locomotion-actors-data.js`. One constrained new asset subdirectory: `/assets/locomotion-v27/` with the existing filename/extension allowlist. Traversal, nested paths, unrelated directories and JSON remain404.

`test_locomotion_assets_http.py` initially failed404 on the new alias. After the route change, it passes actual unauthenticated HTTP byte/MIME checks from an isolated temporary web root, using a copied real native PNG for transport proof. Existing `test_canonical_assets_http.py` and `test_static_dependency_v24.py` also pass. Python3/3 targeted tests PASS; no user database is used.

## Head registration proposal, not implemented

The generated male-right2×2sheet supplied by root was viewed through view_image. Contacts0/2 now show different near-arm positions and passing1/3 exists, but head identity/size drifts. Proposed export: one uniform body scale for the complete four-pose set, authored root/ground anchors and neck attachment per pose; one actual alpha head extraction per direction placed by neck translation, preserving eyes/ears/face pixels. Optional coarse metadata `neckAnchor`, `eyeLine`, `earAnchor`, `scalpPolygon` can travel inside the existing head object without changing customization function signatures. No rectangular neck/arm strip, independent limb warp or per-frame bounding-box fit. Any derived head/body composition remains whole-pose compatibility art, not an editable master or approved layered wardrobe. Coordination with the hair agent and root is required before this separate artwork operation.

Current scope status: runtime wiring ready; new production locomotion artwork remains absent/unapproved and disabled. Browser/full regression and actual new-art phase acceptance remain root's later checks.
