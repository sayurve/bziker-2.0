# Read-only female C/L neon-pixel audit

Observed color dots are **low-alpha source residues, excluded by the current runtime**. No C/L, source image, master, compiled image, code, or asset metadata was changed for this audit.

| Actual native fine PNG | Coordinate | Exact raw RGBA | Actual runtime RGBA |
|---|---:|---|---|
| game/assets/canonical-idle-v2/female-down-fine.png | 27,57 (left jaw) | 0,255,0,1 | 0,0,0,0 |
| same | 37,100 (left palm) | 255,0,0,1 | 0,0,0,0 |
| game/assets/canonical-idle-v2/female-right-fine.png | 36,96 (left palm) | 85,85,0,3 | 0,0,0,0 |
| game/assets/canonical-idle-v2/female-left-fine.png | 60,41 (right side hair) | 255,255,0,1 | 0,0,0,0 |

The 768×1024 references were viewed with view_image. They contain 8× nearest-neighbor copies of these same raw pixels: e.g. down green dot occupies x216..223,y456..463; right palm is x288..295,y768..775. The displayed reference preview makes these RGB residues conspicuous, but their stored alpha is 1 or 3, not opaque.

The source loader in `game/web/source-actors.js` lines 188–189 includes a pixel only when its alpha is **>127**. Exact raw RGBA was read independently with Pillow. `verify-runtime.mjs` then rendered every female C idle and L run fine frame through real `drawSourceAvatarCanvas`, rather than assuming that the alpha threshold was sufficient.

Scope: 48 files — C coarse/fine 8, L coarse/fine 32, four current female head donors and four current 8× references. A scan for exact red/green/yellow primary residues with channel maximum >=60 (excluding near-black values like 1,0,0) found **0 candidates with A>=128**; maximum candidate alpha **6**. Actual renderer checks cover **191 fine-frame candidate points; all 191 yielded RGBA 0,0,0,0**. Current C/L/head/reference file hashes still match all 48 initial samples.

Evidence: `neon-pixel-audit-v29/inputs.json`, `registration-colors.json` (all paths, SHA256, coordinates, RGBA), `runtime.json`, `runtime.log`, `summary.json`, and reproducible `verify-runtime.mjs`. Initial broad color scans are retained as diagnostic data; warm skin-colored reds are not classified as bright registration dots.

No opaque pixel requiring extraction cleanup or an image_gen art correction was confirmed in the observed cases. For future generator references, derive the reference from the actual runtime bitmap, or zero RGB/alpha for source pixels with A<=127 in a new derived reference only. This avoids exposing hidden low-alpha RGB to an image model without modifying the canonical source art. This audit does not approve the full body/action art.
