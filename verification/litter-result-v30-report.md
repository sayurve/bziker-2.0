# Actual pickup result and honest repeat notice

Production scope is limited to `game/economy.py` and the worldInteraction pickup branch in `game/web/app.js`. Character rendering, source assets and daily-limit rules were not changed.

The existing backend daily guard already made a repeat on(account,target,Moscow day) a successful no-op. It now returns `picked:true` only when that transaction adds the trash and starts the real pickup action; `picked:false` identifies the existing no-op. Other action responses do not gain this field. Existing snapshot/action/target/effect/holding contracts remain intact. An immediate retry still reports the already-active same effect in its authoritative snapshot; the fix does not cancel an existing legitimate action.

The app still refreshes the authoritative economy snapshot, then handles an explicit false result with «Этот мусор уже убран сегодня.». It does not forward that old effect to world.setActionState or trigger an unnecessary world refresh, avoiding a new pickup sound/pose from the no-op. First pickup and other actions retain their existing update/refresh/success path. An absent flag retains previous compatibility behavior.

RED: `litter-result-v30-red.log` shows2 missing-result-flag failures; `litter-notice-v30-red.log` shows both actual-app false-success tests failing before the fix. Tests execute the real Python service with a temporary database and the actual app through its existing VM harness; they do not inspect implementation strings.

GREEN: `litter-result-existing-contracts-v30-green.log`15/15 Python tests, including the new3 and existing action-effects/activities contracts. `litter-notice-v30-green.log`9/9 Node tests, including2 actual UI tests and7 perform/readiness regressions. Coverage includes first pickup, immediate repeat preserving the old effect ID, repeat after effect expiry, no duplicate inventory, independent second target, next Moscow day, unchanged bin response, accurate notices and no repeat action/sound forwarding.

Freeze SHA256:
- economy.py:83863aa8f5f923af58c83264350cdc75a907446686bf295de3dd30b7947f9e5d
- app.js:f94b38c718279f8246571d3da51396298d967b58099d6053f56d72ee44186db8
- source-actors.js remainsc73e4d0fa823d8d4f72bcb1625cfff902e2bdb8ee3c86b14abe7ed1ac1b2c5ba
- avatar.js remainsd95537f37d3e2e4404a233f5a4c3f5c555a90b6e7c8153323d53559f09220422

Root retains ownership of actual UI acceptance and full-suite verification. No live API mutation or browser interaction was performed here.
