# Pet spatial contact fix v31

## Confirmed cause

The independently viewed actual-game contact (`avatar-one-v31/independent-pet-contact.png`) showed LOWER intact, but the human C palm below the dog. Human action selection uses authored LOWER palms and a finite progress cadence(0→1→2→1→2→3). The animal selected an unrelated4Hz looping reaction via index4((now-start)*4), without registering its head to the palm. The existing reaction source is dog16_Играет/play-bow or cat16_Потягивается/stretch; the native sprites themselves do not require a vertical jump.

All80 native reaction cells(20 breeds×4) were inspected in `pet-dog-native-reaction-v31.png` and `pet-cat-native-reaction-v31.png`. Upper-head/crown and lower-head/cheek contact pixels were manually measured for B/C; final metadata with exact source atlas/crop/SHA is `pet-head-sockets-v31.json`. Existing source artwork and C/L/A files were not edited. Early draft socket measurements remain draft and are superseded by this final file.

## Narrow implementation

`world.js` adds petInteractionLayout. It selects the actual human source frame/palm with the same progress, facing, pose and selected avatar used for painting. Street pets use the original target position to choose the reach side; owned pets keep the existing right-side reach contract. Seated placements use their actual rendered owner coordinates. The whole animal is translated so its measured head contact lies beneath the authored palm. No crop, mirror, scale, XY deformation, head graft or new image is introduced.

During progress.18–.84, B/C use the same finite source phase as the human. Real animal play/stretch poses and heart feedback remain. Reach/withdraw use smooth whole-position approach/return; they do not chase the high standing hand before the first stroke. Reduced motion keeps one shared fixed phase and placement. Only the matching active target is affected. If an open phone overrides the human reach with static idle, contact registration is not falsely claimed.

`source-actors.js` adds a finite integer pet_contact_frame override0..3, only while a reaction is active. Ordinary gait, explicit source behavior without this field and all invalid values remain unchanged. This makes pet progress a shared selection input; no new animation clock is added.

Both street-animal and owned-pet painters consume this layout. Bounds/depth follow the actual translated whole animal. Root's release/bin-slot callback and WATER code were preserved.

## RED→GREEN and proof

`pet-contact-v31-red.log`:3/3 RED before the fix. `pet-contact-v31-regression.log`:95/95 PASS after the fix, including4 new tests, pet motion, source motion audit and world lifecycle.

The new actual-PNG test covers320 contact cases(2 human models×2 sides×20 breeds×4 stroke progress samples). Each measured point is an opaque pixel in the real decoded head; actual canvas draw preserves source/destination64×64 dimensions. Rounded palm/head separation is≤.8 world units. B/C whole-animal origin variation is≤3.1 units, preventing the previous large unrelated jump. Additional tests cover wrong/expired target, smooth approach/withdraw, fixed reduced motion, finite validation and unaffected ordinary gait. A real mountWorld callback test observes the native source crop actually painted at the computed palm-aligned destination, not only the helper output.

`pet-contact-after-v31.png` is a viewed eight-sample QA contact using actual drawAvatar and drawAnimal with the same ONE maleH7/white6/skin3/shirt8. B/C contact is visibly restored; the original play-bow and hearts remain. This is native renderer proof; root owns the fresh actual-game retake and full regression. No additional hairstyle matrix or new raster art was produced.

Freeze SHA256:
- world.js f285df4235fae25989177e4ff5f9bf9ada6027afea880f1986d15241710a7a09
- source-actors.js e8b28698806865f0e1a298c00148fffe2115fc818efc799936ff8bd40afc1a8e
- actor-sprite.js remains be8e935642374699951146083fbef4ec1ad690a7de8a06ae2153f34dc9b4271b
- litter app/economy remain f94b38c718279f8246571d3da51396298d967b58099d6053f56d72ee44186db8 /83863aa8f5f923af58c83264350cdc75a907446686bf295de3dd30b7947f9e5d
