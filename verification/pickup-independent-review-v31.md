# Independent pickup review v31

Scope: proper collision checked short approach, accepted server arrival, native LOWER contact/held prop, own daily ground visibility, cancellation. Production read-only; original DB untouched.

Reviewed frozen world eaa923f3e71bf75a4fb545601fdd480af25d0943647e87a4cb87942b81144ab8 and source-actors a101e25573dd30747c40477e738ce5eb40857f7881cff9a7c48338f4795cb071.

## Reproduced finding: old action result can restore previous-day collection

world.js setActionState checks lastActionTime but not the newer collectionTime received by applySnapshot. In actual mount, load snapshot100 collected[id], receive newer snapshot200 collected[], then deliver a delayed pick actionResult100. setActionState accepts it, rewinds the local server clock and unions id into today's list. The ground remains hidden after the effect expires, although the newer server snapshot had exposed it. This is the action-result path; the existing late GET/move test does pass.

Repro: `node verification/pickup-independent-day-action-v31.mjs` from project root. Actual output recorded pickup-independent-day-action-v31.json: newDayVisible=true, latePreviousDayActionAccepted=true, afterLateActionExpiredVisible=false (expected true). No runtime edits. Sent to core/root.

## Independent commands

From game/: `node --test tests/pickup-stance-v31.test.mjs` — exit0,6/6, no skips; verification/pickup-independent-node-v31.log.

From game/: `python3 -m unittest discover -s tests -p test_collected_litter_ownership_v31.py -v` — exit0,5/5; verification/collected-litter-independent-server-v31.log. Temporary SQLite fixtures verify own-account isolation, persistence after restart, Moscow midnight reset without inventory loss, duplicate/binning semantics, and rollback on inventory failure.

Current narrow tests positively verify real L raster, bounded ordinary movement, collision rejection, server arrival before callback, manual/phone/inventory/await cancellation, contact .43 prop+ground synchronization, real source paper disappearance, late old GET/move protection. No additional confirmed bug found in these reviewed paths.

## Actual UI

Independently VIEWED before+12 contact sheet, full06, inventory. Details and SHA in avatar-one-v31/independent-pickup-stance-review.json and appended independent-ui-review.md. SameONE H7 face/hair/shoulder continuity visible through bend/squat/rise; hand reaches actual pile in06/07; ground disappears; inventory trash1+rod1. Approach gait is undersampled by screenshots; native L assertion is separate. Browser was operated by root, no independent physical-phone test and no approval of all presets/game.

## Resolution on final frozen world

Core changed only setActionState ordering guard to reject server_time < max(lastActionTime,collectionTime). Current worldSHA `a94b566cde2bede8e931bfcbfd10886312d96f1bfb7cd9bd9cb96dde403a692b`; source-actors unchanged `a101e25573dd30747c40477e738ce5eb40857f7881cff9a7c48338f4795cb071`.

Independent repro rerun to a new filename: `node verification/pickup-independent-day-action-v31.mjs ./pickup-independent-day-action-v31-after-fix.json` — exit0; latePreviousDayActionAccepted=false and afterLateActionExpiredVisible=true. Original failing JSON retained.

Independent focused rerun `node --test game/tests/pickup-stance-v31.test.mjs` from root — exit0,7/7,no skips. New test also positively verifies preserving a newer current drink/holding, then accepting a later genuine pickup with its proper new clock/contact. Log: pickup-independent-node-v31-after-fix.log.

The reproduced late-action finding is resolved for this frozen version. No additional confirmed defect found in reviewed pickup paths. Full-suite execution and current browser automation belong to root; this report does not claim an independent full-suite run. UI contact receipt remains tied honestly to eaa923: the subsequent one-line stale-response guard does not alter its ordinary animation path. Machine-readable resolution and logSHA: pickup-independent-resolution-v31.json.
