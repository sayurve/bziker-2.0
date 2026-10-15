# v13 implementation review

Reviewed on 10 October 2026 against `HEAD e09e6f2`. Scope: the uncommitted changes in `web/avatar.js`, `web/gameplay-ui.js`, `web/inventory-ui.js`, `web/styles.css`, the adjusted v12 UI test, and the two new v13 tests. No application source was edited during this review.

## Findings

No actionable regressions found in the reviewed changes.

- The saved customization catalog and `profileAvatar` normalization are unchanged. Both gender choices, all 12 hairstyle IDs, the existing clothing, headwear, accessory and outfit IDs remain available.
- The renderer retains integer-grid artwork, the 32×48 envelope, four directions, mirrored side frames and eight walking contacts. The focused tests verify a fixed head during walking and a fixed physical anchor at fractional positions and device pixel ratios 1, 2 and 3.
- Generic jury sprites remain independent of customization and personal poses. Head-only previews suppress body, actions, phone and accessory layers.
- Sitting, phone and action compositions preserve the planted legs and feet in the tested combinations. The continuous action tests cover smoking, food, drink, pickup, throw and petting across every saved outfit and all directions.
- The new item renderer resolves the actual bag catalog IDs, `trash` and `card-deck` aliases, supported category fallbacks and unknown values through own-property checks. Its SVG contains fixed authored colors and geometry; arbitrary item IDs and kinds are not inserted into its SVG markup.
- The inventory still exposes exactly ten explicit selection buttons, escaped item labels and identifiers, and a separate action button. Food, pet, deck, rod, catch and litter behavior is preserved by the routing and inventory tests.
- Static CSS geometry leaves 53.2px-wide slots at 320px portrait. At 541px landscape, widths are 44.6px normally and 46.3px in the compact-height layout. Slot heights remain 54px normally and at least 48px in compact landscape, with 44px close/action targets. These are calculations from the stylesheet, not browser measurements.

## Verification

111 individual tests passed across 15 focused test files: character-reference-v13, inventory-art-v13, avatar-catalog, avatar-rendering, avatar-v7, avatar-motion, avatar-stability-v10, actor-pixel-grid-v10, actor-actions-pixel-grid-v12, actor-actions-v12, walk-cycle-v10, inventory-ui, gameplay-ui-v12, app-routing and profile-builder.

The first run on the system Node executable passed 60 tests; two canvas suites could not resolve `@napi-rs/canvas`. Those suites passed on the bundled Node runtime, together with the routing and profile-builder suites (51 additional tests). That initial failure was dependency resolution, not a failing renderer assertion. `git diff --check` passed. The existing character catalog image was also inspected for obvious hairstyle/direction defects.

### Final arm and eye-layer follow-up

The subsequent change at `web/avatar.js:132` draws the free forearm row by row with a small horizontal reach. Every adjacent row overlaps, including the shortest seated/swing configurations. A separate read-only raster probe passed 3,584 combinations of both genders, all seven outfits, all four shirt styles, four directions, idle/sitting poses and eight walking contacts: every visible hand skin pixel remained connected to the torso. The existing phone/action suppression conditions and mirroring remain intact.

The duplicate initial eye layer was removed while the final eye layer at `web/avatar.js:204` remains after the hairstyle layers. Restoring the deleted layer only in an in-memory module produced exactly the same SVG in 480 comparisons covering both genders, all 12 hairstyles, four directions, idle, seated phone, head-only, generic and smoking configurations. Its removal therefore leaves the tested final pixels unchanged. No actionable regression found in this follow-up. No application source, browser or database was modified or used; the full test suite was not repeated during this follow-up.

## Limits

No browser, database or live server was used. This review does not establish actual viewport layout, touch behavior, server synchronization, performance on a physical phone, or exact visual equivalence to the supplied reference screenshots. CSS fit was assessed statically; authored pixel-art similarity remains a visual acceptance decision.
