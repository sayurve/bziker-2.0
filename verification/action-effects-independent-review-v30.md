# Independent read-only review: action effects v30

Reviewed `game/web/action-effects.js` SHA8f5933cc85872d227840196845254d6c9b0e1130eb053753bbcd10c022e1cb1a and `game/web/world.js` SHAf7cc510733f2f24c96e69545a8504a84dda6d6899bba9f1782f5a4033ad8d6e8. No production code, asset, hairstyle or palette matrix was changed by this review.

## Confirmed finding

P2 — an open phone and an active throw use different visible/release bodies. `action-effects.js:33` selects the release pose without `phoneOpen`; `world.js:381` selects the actual displayed body with `phoneOpen:!!p.phone_open`. With a standing open phone, source resolution correctly holds the exact C idle pose and phone, whereas `actionFlight` starts the paper at the HAND extended release palm. The same snapshot is reachable: world.setPhone does not block active timed actions, and world.py activity(phone) does not reject an active action effect or clear it.

Actual production-data repro: actor{x:120,y:220,avatar:{gender:0},facing:'right',pose:'phone',phone_open:true}; effect{type:'throw-litter',started_at:100,duration:3,x:180,y:220}; now101.2, scale1.25, anchor24/63. Displayed canonical-idle-male-right phone palm and paper release differ31.069 world units. Across2models×4dirs, all8 open-phone cases differ20.616–32.103 units; all8 closed-phone cases agree. Exact diagnostic and results: `action-effects-independent-review-v30.mjs/.json`.

A policy decision is needed for this overlap. Keeping the requested phone pose static and suppressing the unrelated paper flight is coherent. Merely forwarding phoneOpen is insufficient because line34 also accepts hands only when frame.poseFamily is set; C idle would fall back to the old generic edge coordinate. An alternative needs an actually displayed release pose and cannot silently animate the phone body.

## Confirmed working scope

The release helper correctly uses selected model/direction hand coordinates and world scale when no phone overrides the body; its endpoint remains the bin slot. Water uses reviewed rodHand, rodAngle and sourceScale, with a separate fish-carry palm. World forwards actual boat/phone snapshot options to the helper and actor; reduced motion uses the same. A read-only production-data probe checked112 combinations(2models×2boat×2phone×2actions×7progress); all selected WATER frame IDs/indices match the actual displayed source selection. Probe comparisons use the exact authoritative actionEffectState.progress; decimal boundary reconstruction can otherwise falsely select the neighboring .4 frame.

The two requested tests pass2/2 (`action-effects-independent-review-tests-v30.log`).

## Test gaps

The release fixture never supplies phone_open, seated context or a canonical idle actor, so it cannot catch the confirmed mismatch. Its nondefault scale check is useful; the fixture coordinates are intentionally different by model/direction. A regression should exercise the chosen phone+active-throw policy on actual current C/A data.

The water grip test directly checks helper/source selection on a male fixture, not world.drawAvatar end-to-end. It covers all4 WATER frames through fishing/catch/boat and open/closed phone, but female current production metadata and actual callback integration are outside that fixture. The independent production probe covers the metadata/selection gap; a future integration assertion can protect world option forwarding. No additional concrete WATER or world-paint defect was confirmed in this review.


## Resolution appended 2026-10-15T16:03:47.822187+00:00

The historical finding above is **resolved** in current action-effects.js SHA`5e3d8e355f4e279b9c25d72d279a4a6c7f65661581d211fddf976f6a4e5149db`. The original finding,16 historical release records,112 historical WATER records and historical summary have been retained unchanged; the old8mismatch count is not a current failure. Current source SHA snapshots and evidence are appended under JSON `resolutions`.

The chosen policy now suppresses paper flight while actor.phone_open is true. `actionFlight` returnsnull before choosing a hidden HAND palm, and `drawActionFlight` paints0rectangles. With the phone closed, release still starts at the selected hand with the real scale/anchor. Independent actual-data probe:64release cases across2models×4directions×standing/seated×2scales×phone states;32phone cases suppressed,32closed cases match the displayed release palm,0policy failures.

WATER actual-data probe:112cases,0frame mismatches,0grip errors,0authored angle errors,0fish-palm errors, source files stable. Read-only path review confirms world.drawAvatar forwards the same physical geometry anchor/scale to body and both effect helpers; phone/boat/pose reaches source selection, and explicit frame.water rodHand/rodAngle/sourceScale is used instead of ID inference. World grip placement remains separate from hull/seat visual fit. No additional confirmed world/equipment defect found in this scope.

Fresh focused tests: `node --test tests/canonical-release-hand-v30.test.mjs tests/canonical-water-grip-v30.test.mjs` fromgame/:2/2PASS, skip0, exit0. Current release test now asserts phone_open suppression, closing the prior fixture gap. Log: `verification/action-effects-independent-review-resolution-tests-v31.log`. Actual probe: `verification/action-effects-independent-resolution-v31.{mjs,json}`. This does not approve all action visuals or every browser overlap. Production was not changed by this review.


## Slot + bounded texture review appended 2026-10-15T16:28:27.917203+00:00

Current source snapshot is recorded as a new resolution/followup; earlier sourceSHA and results have not been relabelled as current. Actual native street-bin PNG593×768 and annotated QA crop were opened. Native291,272 hasRGBA[13,13,13,253], inside the visible dark receiving opening. Solid crop is[172,138,253,501]; sourceBinSlot maps this source point through the same designDestination as the bin art. world.drawActionFlight looks up the target_id entity and forwards this world point. Release palm and static-phone suppression remain intact.

Additional confirmed defect was found during this review: actorRenderBounds originally excluded throw flight. At legal plaza actor6044,4136(distance44.72<radius65), slot6062.9624506,4005.2292493 was20.7707507units above texturetop4026. The expanded actualworld.drawAvatar canvas contained25paperpixels, while the actual240×125texture contained0. Both live bins reproduced it;34/72 sampled trajectorycentres lay outside. Evidence: bin-slot-independent-v31-before-bounds-fix/.

Core fixed the stable whole-action envelope using the same actual flight start/mid/end, conservative sine-arc lift and6pixel paper margin. Independent AFTER with worldSHA`66c1cb90f59470e85d2e756f5232cac0bd8bcbad3baa692f91fdaff43e4b8c18` now preserves25/25paperpixels for both bins;0/72 sampled centres outside, source snapshot stable. Both AFTER full-vs-bounds tables were viewed entirely. Evidence: bin-slot-independent-v31-after-bounds-fix/.

Fresh focused native-slot/bounded-paint/release/water tests7/7PASS, skip0, exit0 in action-effects-independent-slot-bounds-current-tests-v31.log. The root retake-throw UI series was captured BEFORE this bounds fix and is historical evidence, not final bounded UI acceptance. No production code changed by this reviewer.


## Actual bounded UI followup 2026-10-15T16:31:41.269236+00:00

Independently opened entire frozen-contact-throw.png(18actual UI frames) and full frozen-throw-06.jpg after worldSHA`66c1cb90f59470e85d2e756f5232cac0bd8bcbad3baa692f91fdaff43e4b8c18`. The same ONE H7 stands farther below the bin. Released bright paper is visibly carried toward the bin and in06 reaches the visible opening/lower lip instead of being clipped below it; arm subsequently lowers to neutral. This supplies the previously pending bounded-browser observation for this one captured throw.

Screenshot metadata spans363–5546ms. The18UI shots are separate from72native sampled trajectorycentres; no claim that72UI cases were recorded or viewed. Inventory0 is still outside this reviewer’s evidence. Frozen screenshot/contact SHA and scope: verification/avatar-one-v31/independent-frozen-throw-review.json. Earlier pre-fix observations and pending-at-that-time entries remain historical.


## Postthrow inventory UI followup

The full frozen-throw-inventory.jpg was independently opened:1/10 occupied slots, fishing rod×1 only, no trash stack visible. This closes the previously pending trash-zero UI observation for the captured ONE H7 throw; it does not claim the entire inventory is empty. Evidence/SHA: avatar-one-v31/independent-frozen-gait-inventory-review.json. Older pending-at-that-time records remain historical.
