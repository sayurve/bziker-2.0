# Character system v1

This module coordinates existing authored art. It does not generate poses, approve
artwork, stretch garments, mirror bodies, or create independent layer animations.
Structural validation cannot establish that a submitted `status: "approved"` was
actually approved by an artist. The production asset manifest remains responsible
for that provenance. Drafts are rejected unless an explicit laboratory caller uses
`allowDraft: true` on the controller/view/validator.

## Definition

`validateCharacterDefinition(value, {allowDraft = false})` returns a detached,
deeply frozen copy or throws `TypeError` before any rendering changes.

Required fields:

| Field | Contract |
| --- | --- |
| `id` | Stable model identifier; clothing compatibility uses this exact value. |
| `status` | `approved`, or `draft` with explicit lab opt-in. |
| `mode` | `layered` or `legacy-composite`; the latter has one complete-pose layer. |
| `canvas` | `{width, height}` positive integer logical pixels, constant across poses. |
| `anchor` | `{x, y}` logical pixel coordinates on that canvas, typically ground contact. |
| `layers` | Nonempty array of unique layer IDs. |
| `directions` | All four authored directions: `down`, `left`, `right`, `up`. |
| `layerOrder` | Each direction maps to every layer ID once, back to front. |
| `actions` | Includes `idle` and `walk`; additional authored actions are allowed. |
| `poses` | Exactly every `action/direction/frameIndex` combination. |

Every action is `{loop: boolean, frames: [{durationMs: positiveFiniteNumber}, ...]}`.
Any action may declare a positive finite `distancePerCycle` to use a distance
clock; it must then have `loop: true`. `walk` must declare this field. The cycle
uses the same world units as `advance({distance})`. Each frame selects the corresponding
explicit pose; durations do not synthesize intermediate art.

Every pose is `{layers: {layerId: textureReference}, attachments: {name: {x, y}}}`.
It must contain every base layer and the same set of named attachment points as
every other pose. Coordinates belong to that particular authored pose and may
change between poses. Empty attachments are permitted for a model that exposes
none. For an attachment in world space, add `(point - anchor) * uniformScale` to
the container position (or use Phaser's world transform if an ancestor transforms
it). Foot position/collision geometry stays external to artwork and clothing.

A texture reference is **exactly** `{texture: "PhaserTextureKey", frame: null}` for
an individual full-canvas PNG, or `{texture: "AtlasKey", frame: "frameName"}` (or
nonnegative integer frame) for an atlas. A frame property is always explicit.
References cannot override width, height, scale, offset, flip or anchor. The view
checks `Frame.realWidth/realHeight` against the logical canvas. An atlas may trim
transparent margins only when its source-size and source-offset metadata preserve
the original canvas and placement. Preserve the individual PNG masters separately.

Identifiers for models/layers/actions/attachments cannot contain `/`. Texture keys
and atlas frame names may contain `/`. Extra top-level descriptive metadata can
record source provenance; it has no effect on rendering.

## Outfit

`validateOutfit(definition, outfit, {allowDraft = false})` also returns a frozen
copy. An outfit is `{id, status, modelId, layers}`. `modelId` must match the model;
`layers` maps one or more declared layer IDs to `{[poseKey]: textureReference}`.
Every replaced layer must cover **every pose in every action and direction**.
Unreplaced layers retain the base art. Combining shirt, hair and trousers belongs
in one outfit object, so validation and display use one transaction. `null` passed
to the controller removes the outfit and restores the complete base.

## Controller

```js
import { CharacterController } from './controller.js';
import { PhaserCharacterView } from './phaser-view.js';

// model and garment are authored manifests; preload their texture references first.
const controller = new CharacterController(model);
const view = new PhaserCharacterView(scene, model, { x: 100, y: 200, scale: 2 });
view.apply(controller.snapshot);
controller.setState({ action: 'walk', direction: 'right' });
controller.advance({ deltaMs: elapsedMilliseconds, distance: actualDistanceMoved });
view.apply(controller.snapshot);
controller.setOutfit(garment, view);
```

The controller exposes `definition`, `outfit` and an immutable `snapshot` getter.
Each snapshot contains `modelId`, `mode`, `action`, `direction`, `frameIndex`,
`poseKey`, normalized `phase`, `complete`, `outfitId`, `canvas`, `anchor`,
`attachments` and ordered `layers: [{id, texture, frame}]`. Every layer and attachment
is taken from that **one** pose key.

- `setState({action, direction})` rejects unsupported state atomically. Repeating
  the same action does not restart it; changing direction preserves its phase.
  Changing action resets elapsed time and travelled distance.
- `advance({deltaMs = 0, distance = 0})` accepts finite nonnegative values. Every action with
  `distancePerCycle` (including `walk` or `run`) advances solely by actual accepted
  movement distance, divided into equal frame intervals over `distancePerCycle`;
  blocked movement must report zero distance. Actions without that field use the
  authored frame durations. Looping actions wrap; a one-shot
  holds its last frame with `complete: true` until the caller chooses another state.
- `stop()` selects idle frame zero in the current direction and clears both clocks.
- `teleport({direction})` has the same reset, optionally changing direction. Call
  it after teleporting or changing rooms rather than feeding the position jump into
  movement distance. Neither method moves the external physics/world position.
- `setReducedMotion(boolean)` resets phase. Reduced motion holds frame zero,
  avoids accumulating hidden movement distance, and still measures action completion.
- `setOutfit(outfitOrNull, view)` validates all pose coverage, preflights **all**
  texture/frame references via the view, applies the current pose, then commits the
  outfit. Validation, missing-texture and allocation failures preserve the old
  controller snapshot and visible children. Phase, position, scale and physics are
  unchanged. Without a view it validates data only; image availability is then the
  caller's responsibility. Use the view argument for a visible atomic swap.

An open phone should not call `stop()` or change a seated action. Seating, occupied
places, interactions and permissions remain world/server state. The controller does
not issue rewards or authorize actions.

## Phaser view

`new PhaserCharacterView(scene, definition, {x = 0, y = 0, scale = 1, allowDraft = false})`
creates one `Container`, exposed as `view.container`. `scale` is positive and
uniform. Layer images share `(0,0)` and origin `anchor / canvas`; no per-frame fit,
`setDisplaySize`, aspect stretching, body mirroring or per-layer animation is used.

`apply(snapshot)` checks model/canvas/anchor, exact pose and directional layer order,
and all active texture frames. It stages replacement images, then adds them together
and releases old images. Staging failure destroys only staged images. An identical
set of references does not allocate replacements. `preflightOutfit(outfitOrNull)`
checks every candidate pose without changing visible objects; the controller uses
it automatically. Views do not load images or create global Phaser textures.

`setPosition(x, y)` updates the container only. `destroy()` is idempotent, destroys
owned images/container, detaches any foreign children without destroying them, and
leaves shared textures in the texture manager. Keep gameplay objects outside the
view container so their lifecycle and ordering remain independent.

## Verification and remaining art work

Run `node --test game/tests/character-system.test.mjs` from the project root.
Tests cover structural compatibility, missing coverage, drafts, directional order,
attachment changes, distance/time clocks, resets, phase preservation, full outfit
preflight, allocation failure rollback, stable origin/dimensions and lifecycle.
Test manifests contain synthetic texture **names**, not production images or
claimed ready artwork. The Phaser harness tests the adapter contract and failure
paths; actual engine/browser/device rendering requires separate integration checks.
A successful test does not prove face consistency, garment drawing quality,
complete new layered master art, artistic approval, or physical phone usability.
