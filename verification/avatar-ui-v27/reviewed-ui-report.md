# Independent actual UI image review

Current reviewed coverage is generated in `reviewed-coverage.json` from the explicit receipt `reviewed-contact-manifests.json`. The coverage builder verifies actual source JPEG SHA and deduplicates category/value/direction keys. Existing browser captures are not overwritten.

## Current accepted static image coverage

- Male: 82 values, all eleven non-gender categories, 328 unique direction screenshots. The merged proof consists of 288 original first-pass images plus 40 new images for ten retaken values. Eight values required readiness-gated direction retakes, and white hair/raincoat were additional post-fix regressions. All forty new images were visually inspected in full via nine contact sheets and now show the labelled down/left/up/right directions.
- Female: 38 style values, 152 unique direction screenshots: twelve hair, five headwear, four shirt, four pants, six accessories and seven outfits. All eight contact sheets were viewed in full and show the labelled directions. The remaining 44 palette values have not yet been added to reviewed coverage.

Within this static scope, no additional disappearing body/head, lost feet, new transparent horizontal garment rows or mistaken direction capture remained. The fixed male raincoat and female outfit6 no longer show the gray center detail over the face in these shots. White hair and porcelain skin remain visible. Palette colors are visible on their selected layers; changing environmental illumination means these screenshots do not establish a common exact RGB color chart.

## What this review does and does not establish

The images are actual post-save world captures from the parent's real UI workflow. The reviewer did not drive that browser, inspect every editor screenshot, independently verify every save response or prove reload persistence. A contact sheet is static evidence, not a full animation, atomic in-motion clothing-change test or physical-phone check. The male first-pass evidence retains some old foreground interaction outlines; those are acknowledged in `g0-all82-review.md`. The parent corrected their depth separately. The mixed-snapshot male collection is not claimed to be 82 complete newly captured cases on actor-sprite685; the native fixed-v28 sweep independently covers both genders after that freeze.

The completed native review is `../customization-audit/interop-final-fixed-v28/review.md`: all4064 combinations,0same-frame face candidates,0newcanvas edges,all22contacts viewed, and the116former attention cases now0changedfacepixels. That check is not blanket artistic approval of every source image or full gameplay acceptance.

Rebuild the numeric coverage only from reviewed manifests:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 verification/avatar-ui-v27/build-reviewed-coverage.py
```

Create QA contacts from a fresh named output directory:

```sh
node verification/avatar-ui-v27/make-contacts.mjs --gender 0 --category shirtColor --values 0,6 --source final-fixed --label UNIQUE_LABEL
```
