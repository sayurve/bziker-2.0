# Frozen v27 native interoperability review

This is the first frozen snapshot (actor-sprite SHA dd5716f4e9beb3e508513e4b3d9dc4f8c9e675e29ba25aaf1089ef45d5f73a69). It is a regression diagnostic, not final artistic approval. Source hashes still matched when the additional face diagnostic ran.

Commands, both exited 0:

```sh
node verification/customization-audit/render-options.mjs final-freeze-v27
node verification/customization-audit/final-interoperability.mjs --run final-freeze-v27
node verification/customization-audit/inspect-outfit-faces.mjs
```

Use the bundled Node runtime recorded by the parent task. The general sweep rendered 608 idle and 2432 walking cases, 0 missing-source fallbacks; all were nonempty. Its isolated catalog fixture intentionally owns no outfits: six purchase buttons remain locked there. This does not override the separate legitimate browser purchase evidence.

The interoperability sweep rendered 224 outfit cases plus 3840 hair/headwear cases, total 4064. All retained their frame, anchor and head metadata; none was empty or touched any canvas edge. Ten JS source hashes and all 84 loaded native image resources remained stable through the run. These metrics only establish the checks named here.

All 22 interoperability PNG contact sheets were viewed in full: two outfit sheets and all combinations of two genders, two hair colors and five headwear settings. Hairstyle silhouettes remained visible across the four run phases and directions. No disappearing body/head, transparent garment rows or crop at the canvas edge was observed in those sheets. This is static phase inspection, not a browser motion or physical-device check. The final general sweep's pantsStyle and accessory sheets were additionally viewed; its other 16 sheets were rendered but not re-reviewed after this freeze.

## Confirmed defect: outfit6 detail paints over face

The exact polygon comparison found 116 candidates, exclusively paid outfits; 0 among the 3840 hair/headwear cases. Full pixel triage counted 1789 changed fine pixels inside the authored face polygon. Of these, 82 were also inside the authored head rectangle, across 14 cases, all outfit6 (raincoat).

The diagnostic zoom shows an unconditional vertical gray detail climbing into the front mouth/nose and side cheek, especially the female model. Reproduction: gender1, outfit6, down, run phase0. Fine pixel (48,58) changes from skin RGBA (251,175,130,255) to (107,104,84,255); neighboring (49,58) changes similarly. This is a real face intrusion, not just a collar recolor. See [zoom](outfit-face-attention-zoom.png) and complete raw coordinates in [diagnostic](outfit-face-pixel-diagnostic.json). Parent and hair owner were notified for an isolated runtime fix and regression before another freeze.

Changes for outfits1–5 lay outside the head rectangle in this diagnostic; most are dark pixels below the chin adjacent to the collar. No change to eyes or upper cheeks was observed. A composited baseline alone cannot prove whether every lower outline pixel belongs to a donor head or a garment, so those candidates are retained rather than silently discarded.

## Scope limits

The raw face metric reports changes to the same pose, not identity equivalence across separately authored directions or a proof of grounded foot motion. Parent owns real UI purchases, all UI option walkthroughs, browser logs, motion playback and full regression. The reviewer did not operate the concurrent browser or edit production. The all-zero hair face comparison cannot exclude color leakage outside the polygon; the hair owner independently reported such a lower-body color issue during the full suite and is fixing it. A new actor-sprite hash requires a new labelled run; this snapshot must not be described as a final PASS for that future source.
