# Approved UI integration

The user authorized the full local Bziker design folder. Use approved `09_Интерфейс_игры`: current controls and Telebzi, and approved 12 loading/auth screens. Archive/History artwork is excluded.

1. Add meaningful tests: twelve phone routes contain character and exclude inventory; saved control side validates values; phone state preserves HUD and hides lower controls; password reveal only changes the input type.
2. Import immutable design PNG/font files with source path and SHA-256 provenance. Keep names and numbers as real text from server snapshots.
3. Add reusable source UI hooks for root integration. HUD retains existing selectors; minimap canvas shows actual map. Controls retain world selectors and joystick pointer handling.
4. Rebuild full-screen auth around existing `account-form` and credential validation. Keep register/login/claim endpoints and progress untouched. Add accessible password visibility toggle.
5. Rebuild Telebzi around the two approved hand layers, live HTML content and twelve real routes. Opening slides from the bottom center; closing restores controls. Adapt foreground content for 320px and short screens, retain 44px targets.
6. Apply white/black approved panel language to working character catalogue and phone views. New startup progress is indeterminate until real bootstrap completes; never show synthetic percentage.
7. Run relevant Node tests, syntax and asset manifest verification. Root runs integrated game checks. No new browser tabs; no commit by this agent.
