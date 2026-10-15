# Actor motion and framing verification

The native source images were not edited. The renderer still displays complete 96×128 source frames through a uniform scale into the logical 48×64 actor canvas. Four running phases are advanced by distance, with the common foot anchor retained; no independent horizontal/vertical scale or sinusoidal body transformation was introduced. Standing frames remain the existing relaxed poses.

Confirmed defects corrected:

- At a diagonal input against a wall, collision removes one movement component. Facing formerly used the input component that was blocked, so the actor travelled vertically with a horizontal running frame. Facing now uses the displacement after collision; the integration guard observes the actual native bitmap for all four slide directions and both genders.
- The native hair highlights overlap the former RGB skin classification. A light hair selection left brown scalp pixels. The imported face/ears now form a protected material region, including dark-only jaw rows. The hair candidate is restricted to the authored head region, and flesh components separated from the crown retain their dark hand/ear contours. Hair highlights receive the selected hair tint. Face protection only prevents the fallback hair tint: the actual skin predicate still controls skin recolouring, so neutral eyes, whites and contours retain their original pixels.
- Public modular interiors retain source canvas padding outside their actual room. The camera now frames the union of the clipped floor and walls plus 24 world units. Position, room geometry, actor scale and zoom are unchanged. The left/right/top/bottom edges, larger viewport centring, touch-control space, and pixel alignment have regression guards. City and private base framing retain their previous values.

Evidence uses the real source canvas renderer, not a fallback or a reconstructed sprite:

- `actor-native-motion-contact-after.png`: both genders, four directions, standing plus all four running phases.
- `actor-white-hair-contact-after.png`: the same comparison with the light hair selection, preserving the native face.
- `actor-live-avatar-contact-after.png`: the actual account wardrobe and its female counterpart, including hairstyle, headwear, jacket and trousers.
- `actor-motion-evidence-after.json`: exact opaque bounds, source head metadata and constant canvas/anchor dimensions. Head metadata is a catalogue edit region, not the complete native jaw silhouette.
- `actor-motion-tests.log`: 154 targeted tests passed with no failures. The guards include native frame RGBA identity, 32 crown cases, measured male/female jaw outlines, seven skin colours on known eyes, skin1/2 neutral head pixels in all 32 running frames, fixed source hand-region RGBA identity in all 32 running frames, action/phone/seat poses, walk-cycle timing, camera and mounted world lifecycle.

The peer interpolation test fixture was moved from coordinates outside its room into the physical floor. Its obstacle size, corner displacement and circular-foot collision assertion are identical; it now observes the peer inside the corrected camera frame.
