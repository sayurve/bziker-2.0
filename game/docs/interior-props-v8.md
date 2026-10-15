# Modern Bziker interior objects — v8

The renderer uses individual furniture sprites, with a shared physical floor footprint supplied by the room map. It creates no new collision boxes or interactions. Each sprite sorts at `y + height`; its raised body grows above that floor edge. This keeps shelves, furniture and seated players in the same depth system as the city.

## Art direction

- Graphite structure `#25292a`, pale laminate `#f5f5ee`, brushed steel `#9ca4a4`, muted foliage `#91aa93`.
- Merchandise accents: lavender `#b7a6ba`, blue `#99b3bd`, sage `#b6bea0`, paper amber `#d3bd93`, clay `#c6a39a`.
- The selected map color supplies the main furniture surface. Small surface highlights, seams, shelf price strips, chair feet and package labels show purpose without replacing the user's monochrome world with a colorful fantasy setting.
- Sign plates use an 8 px monospace utility face. Most objects have no floating label; room zones identify locations.
- Modern recognizable silhouettes: checkout conveyor and payment terminal, glass refrigerator doors, freestanding grocery islands, hanging garments and fitting curtains, computer desks, upholstered furniture, card tables and slot machines. Wood crates and medieval shop fixtures are avoided.

## Catalog and contract

`drawRoomProps(room)` accepts each `room.props` entry with `id`, `type`, `x`, `y`, `width`, `height` and optional `color`, `label`, `category`, `facing`. It returns one node per valid supported prop, named `room.id:prop.id`, with its own drawing envelope and depth.

The 28 supported types are cashier, shelf, gondola, fridge, produce, rack, fitting, mirror, sofa, chair, table, desk, bookcase, board, slot, poker-table, plant, lamp, bin, poster, kiosk, bar, queue, display-bed, display-desk, trophy, bench and luggage. A chair facing up uses the closer backrest silhouette for chairs across a meeting or cafe table.

Category values distinguish groceries, drinks, frozen foods and books. Shelf packages, upholstery seams and details remain deterministic across frames. Invalid decorative entries are excluded so a corrupt object does not prevent the rest of a room from drawing.

A board with `solid: false` is a suspended information panel. Its mounts stay on the panel, with no support legs or contact shadow on the passable floor. A solid board keeps its floor stand and two supports.

## Verification

`tests/interior-props-v8.test.mjs` verifies every catalog type, separate physical depth nodes, deterministic appearance, selected palettes, integer pixels, positive drawing spans and complete visual envelopes. A real Canvas contact sheet was also generated and inspected during implementation.
