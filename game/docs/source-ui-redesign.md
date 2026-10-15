# Approved UI integration

Used the current approved controls, Telebzi hand layers and loading/auth screens from `09_Интерфейс_игры`. Historical and demonstration data were excluded.

The 26 assets retain their original bytes; paths and SHA-256 checks are recorded in `assets/design-ui-manifest.json`. Phone menu glyphs use clipped SVG views of the actual supplied image. The icon contact sheet is an offline crop inspection, not a browser screenshot.

Existing account credential validation and API endpoints are retained. Register/login/claim never store passwords locally. Password visibility changes only the input type. The splash uses the approved crossed-arm mascot; loading is indeterminate while bootstrap is pending.

Telebzi has 12 routes including Character; Inventory remains a separate ten-slot drawer. The screen uses live HTML and account data over approved hand artwork. Opening from the bottom center hides lower game controls and leaves HUD visible. Closing restores controls. Left/right joystick placement is stored in `bziker.controlLayout`.

Integration hooks are `sourceHudHTML()`, `sourceControlsHTML()`, `preloadSourceUI()` and `drawSourceJoystick(ctx,{x,y})` (normalized axes). All existing world control and HUD selectors remain available.

Verification: 92/92 focused Node tests passed, including late-response lifecycle checks, separate inventory, stored control placement and current-account hand artwork. Syntax checks passed, and all26 copied assets match their sources. Browser layout and physical phones were not checked by this agent; no browser tabs were opened.

The server explicitly serves the approved source modules at both root and `/web` paths, plus image/font assets. Unknown scripts, private data and traversal paths remain unavailable. Nine source Python tests passed across these routes, map migration and furniture validation.

City schema6 migration maps retained city/district positions from the nearest old named landmark to the corresponding new one, retaining a local offset of at most160 world units and repairing collisions. Private bases/interiors and player progress remain intact; open phones remain open, retired city seats release their occupants, and boats return to their new docks only when the layout changes. A restart on the same map preserves occupied boats and seats.

Furniture stores optional `source_theme` values (`modern`, `loft`, `tech`, `wood`, `stone`) without changing footprints or rotations. Optional base surfaces and wall materials use explicit approved lists. Full-picker wall, floor and furniture colors accept six-digit hexadecimal values and normalize them to lowercase; arbitrary source asset paths are rejected. Missing optional fields do not add defaults to retained data.
