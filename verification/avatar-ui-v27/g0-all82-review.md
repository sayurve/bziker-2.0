# Male actual UI first-pass image review

All 17 contact sheets covering 82 option values × four direction-labelled world screenshots (328) were viewed in full. They are cropped from the actual 1204×925/926 browser JPEG captures; no native avatar rerender is substituted. Each crop preserves source SHA in its category manifest. First-pass source images and previous review outputs were not overwritten.

The selected hair, headwear, skin, shirt, pants, accessory, shoe and purchased outfit variants are visible in the world. White hair, porcelain skin and white shirt/pants/shoes remain visible; no vanished actor/body or new transparent horizontal garment bands were observed. Screenshot lighting changes over time, so colors were compared by visible option response rather than a supposed shared absolute RGB. Known raincoat face intrusion and the old foreground action outline are preserved in these earlier captures; the native fixed-v28 sweep is a separate source snapshot.

13 labelled direction captures show a front pose instead of their claimed left/up direction:

| Category | Value | Invalid captures |
|---|---:|---|
| skin | 4 | left, up |
| shirtStyle | 3 | left, up |
| shirtColor | 0 | left, up |
| shirtColor | 6 | up |
| pantsColor | 6 | left, up |
| headwear | 0 | up |
| accessory | 0 | up |
| shoesColor | 2 | left, up |

These eight selected values need direction retakes. Several up captures show the front action pose with a raised hand. Parent independently identified a capture-timing cause: input can arrive during phone closing/reset; the new capture helper waits for actual dialog hidden plus enabled world-entry readiness. This image review confirms the direction mismatch but does not independently prove that runtime timing cause. It is not evidence of a wrong sprite direction mapping. Outfit6 also needs a post-fix UI retake to show the resolved face intrusion.

The other 315 screenshots visibly show their labelled direction. This is a static image review; it does not independently validate every save response, reload persistence, an entire animation or the 82 editor screenshots. Parent owns the actual UI workflow/state checks. Do not describe the first pass as 328/328 directions accepted.

Reproduce a category contact with the helper, using a fresh label:

```sh
node verification/avatar-ui-v27/make-contacts.mjs --gender 0 --category skin --source final --label UNIQUE_LABEL
```

The helper now accepts all non-gender categories; a fresh output directory is mandatory.
