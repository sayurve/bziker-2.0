# Character core implementation verification

Date: 2026-10-15. Scope: `game/web/character-system/definition.js`,
`controller.js`, `phaser-view.js`, `README.md`,
`game/tests/character-system.test.mjs` and the evidence files in this directory.

## Implemented

- Immutable detached definition/outfit validation with required four authored
  directions, complete action/direction/frame coverage, constant canvas/anchor,
  per-direction layer permutation and consistent named per-pose attachments.
- Explicit `{texture, frame}` references: null frame for PNG, named/numeric frame
  for atlas. Per-reference sizing, flipping and positional transforms rejected.
- Explicit `layered` versus one-layer `legacy-composite` modes. Drafts rejected by
  default; explicit lab opt-in supported without changing approval status.
- One controller chooses one pose key/frame for every layer. Actions declaring `distancePerCycle` follow actual
  distance; other actions follow authored frame durations. Direction preserves
  phase; repeated state does not restart; stop/teleport clear movement accumulation.
- Complete outfit coverage and model compatibility validated before commit. With
  the view argument, every candidate pose texture is checked before the current
  pose is staged. Invalid coverage, missing future textures, atlas-frame failure
  or image allocation failure retain the old controller and displayed objects.
- Phaser adapter uses a Container, common origin and uniform scale. It validates
  source logical frame size and never fits individual visible bounds. Staging and
  destruction release owned images, preserve shared textures, detach foreign
  children, and do not introduce independent animation clocks.
- README defines exact data/API contracts, callers' movement/seating responsibilities,
  texture preloading, artistic provenance and integration limitations.

## Executed checks

Command (project root):

```text
/Users/sapp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test game/tests/character-system.test.mjs
```

Final observed result: **18 tests, 18 passed, 0 failed**, exit 0.
`character-core-green.txt` retains the complete passing output.
`character-core-red.txt` records the initial 10 missing-feature failures before
implementation. `character-core-hardening-red.txt` records three regressions found
by additional tests before adding full-outfit texture preflight, foreign-child
preservation and consistent attachment coverage.

Tests include four-direction coverage, invalid model/outfit mutation, drafts,
distance versus time, complete one-shot hold, repeated-state phase, direction
order, attachment coordinates, stop/teleport, reduced motion, outfit phase,
missing atlas frames, future-pose texture failure, staged allocation failure,
logical dimensions, ownership and restoring base PNG frame references.

The Phaser adapter tests use a focused scene/texture harness to inject otherwise
hard-to-produce failures. Local bundled Phaser source inspection confirms
`Frame.realWidth` and `realHeight` read `data.sourceSize.w/h`; `setTrim` stores
original source size and trim placement. This supports the adapter's atlas rule,
but does not substitute for a real browser rendering check.

## Limits and integration

No production graphics were generated or claimed approved. Synthetic test manifests
contain texture names only. Artistic face/proportion consistency, new layered
master art, garment quality, a real Phaser browser run and physical-phone checks
were not performed by this core subtask. Root integration owns world/legacy/lab
wiring and the broader game regression run. No source actors, world, server, index,
lab, browser, publication or commits were modified by this subtask.

A Git status check returned “not a git repository”; this is a standalone project
folder, so this report makes no Git diff/commit claims.

## Distance-clock follow-up

The distance clock is selected by `clip.distancePerCycle`, independent of action
name. Any action declaring it must have a positive finite cycle and `loop: true`;
walk still requires the field. A new run regression checks that time alone leaves
its phase unchanged, distance advances it, and repeated state retains phase.
A large page-lag test confirms finite timed one-shots clamp to phase 1 and their
last frame even for Number.MAX_VALUE milliseconds. Initial failures are recorded
in `character-core-distance-red.txt`; the final passing output includes 18 tests.
