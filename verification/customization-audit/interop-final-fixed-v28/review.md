# Fixed v28 native interoperability review

Reviewed actor-sprite SHA `685e6d9a77feb1d746b689c3072b5373dbe33667d3d0108b6e0773bcc9100531`. All ten source JS hashes still matched the frozen sweep at final review. The run also hashed the bytes and metadata of all 84 loaded native resources and rechecked them at completion, with no changes.

## Results

- General customization: 608 idle and 2432 walking cases; 0 missing-source fallbacks; all nonempty. Eighteen PNG panels were generated. This reviewer did not visually re-review all eighteen general panels at this new freeze.
- Interoperability: 224 outfit cases plus 3840 hair/headwear cases, total 4064; all retained source frame, head registration and anchor. All are nonempty; 0 technical failures; 0 canvas-edge cases.
- Exact same-frame face polygon comparison: **0 candidates and 0 lost face pixels** across all 4064 cases. No diagnostic face candidate was silently excluded.
- Independent triage re-rendered the exact 116 prior failing outfit cases against their same-frame default clothing. All now have **0 changed pixels inside their authored face polygon**, compared with 1789 changed fine pixels in the first frozen pass. This includes the 82 former changes inside the head rectangle. Full raw rerun records remain in `outfit-face-pixel-diagnostic.json`.

All **22 interoperability contact sheets were visually viewed in full again**: two outfit sheets and twenty hair/headwear sheets. The additional six-row enlarged `outfit-face-attention-zoom.png` was also viewed. The raincoat center detail no longer climbs into the nose, mouth or cheek. No disappearing head/body, transparent horizontal garment bands or canvas-edge crop was observed. Brown and white hair, all twelve silhouettes and five headwear values remained visible in the sampled static native run phases. `visual-review.json` records the SHA of each sheet actually reviewed.

## Commands

All three commands exited 0. Detailed scope is in `summary.json`, `metrics.json`, `attention-cases.json`, the separate general `../final-fixed-v28/metrics.json`, and `commands.log`.

```sh
node verification/customization-audit/render-options.mjs final-fixed-v28
node verification/customization-audit/final-interoperability.mjs --run final-fixed-v28
node verification/customization-audit/inspect-outfit-faces.mjs interop-final-fixed-v28 interop-final-freeze-v27
```

Executed with `/Users/sapp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`. Scripts load and call actual production `loadSourceActor`, `avatarRaster` and `drawAvatarCanvas`, using real PNG resources. They do not create fake avatar implementations or touch DB/API/browser/runtime files. The isolated general catalog fixture intentionally owns no outfits and shows six locked purchase buttons; the parent separately exercised legitimate purchases through actual UI.

## Limits and separate UI evidence

This establishes the stated raster checks and static visual inspection, not artistic approval of every generated image or equivalence of separately authored directional faces. Four phase contacts do not prove natural movement playback, collision behavior, browser WebGL rendering or a physical phone. Parent owns browser motion/UI walkthroughs and the full regression suite. Hair/body color isolation is covered by the hair owner's targeted regression; zero changes inside the face polygon alone could not prove that separate property.

The male actual-UI first pass is documented separately in `../../avatar-ui-v27/g0-all82-review.md`: all 17 contacts / 328 world screenshots were viewed, but 13 direction-labelled captures required readiness-gated retakes. Those earlier screenshots are preserved as first-pass evidence; the fixed native sweep must not silently relabel them as post-fix UI captures. Parent is producing new captures in `final-fixed`.
