# Pickup contact stance — v31

Scope: ONE male H7 / white6 / skin3 / shirt8 actual-game follow-up. No new character artwork or other hairstyle changes. Original Bziker remains read-only.

Confirmed before: the ground park paper centre is (5448,3406), while interaction marker is (5448,3416). From the legal position (5495,3416), the previous UP squat palm was (5514.375,3410.375), about66.5 world units from the pile. The action request previously started immediately, without turning or positioning the character.

Implementation: `pickupStance` inverts the approved LOWER squat trash socket (prop-specific socket first, otherwise actual authored hand). The pile point is the centre of opaque native trash pixel(3,3), mapped through the existing source destination. Four real facing candidates are checked by walking collision substeps; the shortest clear direct approach is chosen, capped at110 world units. If none is clear, the client requests another approach rather than teleporting. Actual RAF movement uses existing `movePosition`, movement path publication, L locomotion and the normal speed. At arrival (0.01 world tolerance), a forced move must succeed and its server position must match before the pickup callback runs. Manual keyboard/joystick, overlays, blur/visibility, scene/profile changes, lost control and teardown cancel the pending intent. A second interaction cannot reenter it.

Paper remains on the ground until the actual squat contact boundary(.43); the held prop starts at that same boundary. Reduced motion uses the existing fixed contact pose(.5), so the ground disappears immediately under the same policy. Collection removes the independent floor node and nearest-action candidate, without rebuilding ground tiles. Fresh `collected_litter` snapshots replace the account/day list. A timestamp watermark and existing action revision protection prevent older GET/move responses from restoring stale paper or yesterday IDs. Private collection data stays top-level rather than being copied into player records.

Validation: original RED log `pickup-stance-v31-red.log`. Initial six focused tests GREEN in `pickup-stance-v31-focused.log`: both genders/four facings actual socket geometry and blocked paths; contact boundary/collection; real mount movement, successful server arrival and exactly one action; rejected movement, actual phone, inventory/manual and pending-ack cancellation; native paper paint pixels and real floor-node removal including late GET/new day; prior-day late movement response. The approach test compares the actual painted actor bitmap with approved L pixels, not a generic drawImage count. Existing activity lifecycle test now waits for real pickup approach and returns actual move acknowledgements.

Initial combined targeted regression:104/104 PASS (`pickup-stance-v31-green.log`), followed by final105/105 PASS (`pickup-late-action-v31-green.log`), including world lifecycle, native locomotion identity, source actor coverage, pet contact and bounded throw painter. Browser retake is root-owned and pending at this freeze; this report does not claim visual acceptance from unit tests.

Frozen production hashes:
- world.js: a94b566cde2bede8e931bfcbfd10886312d96f1bfb7cd9bd9cb96dde403a692b
- source-actors.js: a101e25573dd30747c40477e738ce5eb40857f7881cff9a7c48338f4795cb071
- source-city.js unchanged: c62fab72533f4cde0492e4b23ac2d4b70e357ec4470d1c3dfde47f8b25199520
- action-effects.js unchanged: a0b50650eb50dc71e63ffd55ecd9f764045fed2689de546736d65bf95de3861b
- actor-sprite.js unchanged: be8e935642374699951146083fbef4ec1ad690a7de8a06ae2153f34dc9b4271b
- avatar.js unchanged: d95537f37d3e2e4404a233f5a4c3f5c555a90b6e7c8153323d53559f09220422

All C/L/A manifests and PNG artwork are unchanged. No new server field, route or module, no economy/daily-limit changes.

## Independent ordering follow-up

Materials reproduced a late previous-day action result after a fresh empty-day collection snapshot. The existing snapshot watermark alone did not protect `setActionState`; it could replace the current action/holding/clock and recollect yesterday target. Added an actual mount RED (`pickup-late-action-v31-red.log`) before the fix. The single guard now rejects action results older than either the accepted action or collection snapshot timestamp before mutating any state. Seventh focused regression preserves the newer drink event/holding and visible new-day paper after the rejected old event expires, then proves a later legitimate pickup still starts on its own reach/contact clock. Final targeted105/105 PASS. Browser pickup12 was root-viewed as proper contact before this ordering-only guard; no new visual shape/art change.
