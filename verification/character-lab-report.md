# Standalone character compatibility laboratory

Date: 2026-10-15. Owned changes: `game/web/character-lab.html`,
`character-lab.js`, `character-lab.css`, the lab/character `STATIC` aliases in
`game/server.py`, and lab tests. Existing server API routes, source PNGs, source
actor implementation, original neighbouring Bziker, clock.js and asset-loader.js
were not changed by this subtask.

## Implemented scope

`/character-lab` is an account-free HTML entrypoint using the bundled real Phaser
engine. The browser source calls `loadSourceActor` and `drawSourceAvatarCanvas` with
browser canvas/image injection. It predraws existing complete poses into 408
96×128 CanvasTextures: two native gender models × three shirt palettes × 68 poses.
The 68 poses cover four directions for idle (one frame), walk (eight held source
phases), and run (eight held source phases). It does not cut the body into new
layers or create raster artwork. Models explicitly retain `mode: legacy-composite`,
`status: draft`, one `composite` layer, and lab-only `allowDraft: true`.

The exact displayed notice is:
“Совместимость: полные позы; новые слои одежды ещё не одобрены”.
Unsupported seated/hand-item actions are explicitly identified as absent. Native
model proportions remain in the existing renderer, while both share canvas and
anchor `(48,126)`. The view uses uniform scale 2 on a fixed 384×384 Phaser stage;
CSS preserves its square aspect while fitting phone width.

One CharacterController supplies pose/frame and one PhaserCharacterView applies
it. Play advances walk/run by 160 world units per second; single-step advances one
frame's distance. Stop resets idle and movement phase. Palettes replace whole
complete-pose sets through `setOutfit(outfit, view)` and preserve current phase,
anchor, position and scale. An invalid missing `walk/up/7` outfit is rejected before
view changes. Model, action, direction, palette, play/pause, step, stop and reduced
motion controls are present.

## Deterministic browser proof fields

`#lab-proof` exposes data attributes:
`ready`, `engine`, `model`, `gender`, `mode`, `status`, `poseKey`, `frame`, `phase`,
`outfit`, `anchor`, `origin`, `scale`, `layerCount`, `texture`, `playing`,
`swapPreserved`. The invalid-outfit button additionally sets `rejected` and
`unchanged`. Startup failure sets `ready=false` and `error` with a visible message.
The initial scene is paused. IDs: `lab-play`, `lab-step`, `lab-stop`, `lab-action`,
`lab-direction`, `lab-gender`, `lab-outfit`, `lab-reject`, `lab-reduced`.

## Executed verification

From project root:

```text
/Users/sapp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test game/tests/character-lab.test.mjs game/tests/character-system.test.mjs
```

Exit 0: **22 tests passed, 0 failed** (four lab tests and 18 core tests).
`character-lab-node-green.txt` contains the complete output.
Lab tests actually decode the bundled source PNGs with @napi-rs/canvas, verify all
408 images are nonempty and fixed-size, compare the native whole figure pixel for
pixel with the source renderer, verify source held phases and distinct authored
poses, differing green palette, and preserved shorter female native stature.
They also check complete manifests, distance stepping, invalid-outfit rollback,
standalone local-engine markup and absence of account API calls.

From `game/`:

```text
python3 -m unittest discover -s tests -p test_character_lab.py -v
python3 -m unittest discover -s tests -p test_static_dependency_v24.py -v
```

Both exit 0: three lab HTTP/route tests and the existing static-dependency test
passed. `character-lab-http-green.txt` and `character-lab-static-green.txt` retain
output. An actual temporary loopback HTTP server with a fresh temporary DB served
the lab and modules with HTTP 200 and no Set-Cookie. This proves account-free HTTP
access, not a browser render. All five character modules (including clock and
asset-loader) have `/name.js`, `/character-system/name.js`, and
`/web/character-system/name.js` aliases. Lab html/js/css have explicit root and
`/web/` aliases.

Tests were written before implementation. `character-lab-red.txt` records the
initial absent module. The initial route-test invocation from the wrong directory
could not import server; its output is honestly retained as
`character-lab-route-invocation-error.txt`. Rerunning from game observed the
expected two missing-route failures before adding the allowlist entries; the
subsequent corrected runs pass.

## Remaining verification

No browser was opened by this subtask. Actual Phaser scene startup, UI interactions,
mobile viewport, console/network errors and screenshots are assigned to root
integration and are **not performed here**. Physical phone, touch/WebGL performance,
artistic continuity and approval of new layered clothing remain unperformed.
Technical tests do not upgrade these drafts or declare whole-game completion.

## Independent skill forward review

Read-only review of `.agents/skills/bziker-character-pipeline/SKILL.md` and
`bziker-game-qa/SKILL.md`:

1. Request “Add a jacket, but its seated frame is missing”: first inspect supported
   model pose keys. If seating is supported, reject the entire incomplete outfit
   and preserve the previous one. The pipeline explicitly says a slot missing one
   pose is incomplete and rejected before wearing. Prepare the missing real garment
   layer in drafts against the master; do not relabel a whole figure as a jacket
   or remove supported seating simply to pass validation.
2. Request “PNGs load without errors — is all visual art ready?”: no. Report only
   successful loading; both skills separately require coverage/compatibility,
   canonical master/face/proportions/motion/overlap inspection and recorded artistic
   evidence. Browser viewport and a physical phone also require separate evidence.
   The pipeline explicitly says successful loading/checksums/exports do not approve
   quality, and legacy-composite does not establish a ready new layered model.

No game execution or file changes were performed as part of that independent
read-only skill review. Its conclusions were sent to the skills agent and root.
