# RuneScape 120 Construction Layout Planner

Visit: https://kite-force.github.io/runescape-construction-planner/ to use

This project is unofficial and is not affiliated with or endorsed by Jagex. RuneScape names, images, and other game assets belong to their respective owners. The MIT License applies only to the original source code in this repository.

A working React + TypeScript planner for experimenting with structures on the new 48×48 Construction plot without paying in-game placement costs.

PROGRAMMED ENTIRELY BY GPT-5.6 SOL

## Included

- 48×48 tile grid, coordinates 0–47
- All 12 currently recorded room types plus 2 path types and 1 portal furniture item
- Click a palette item to place it
- Drag structures and snap to one-tile coordinates
- Rotate with `R` or the inspector button
- Move selected structures with arrow keys
- Delete with Delete/Backspace
- Rectangular collision and boundary checks
- Known-cost total, while clearly marking items whose cost has not been recorded
- Local browser save
- JSON import and export
- Approximate visual polygons for irregular rooms
- Doorway metadata reconstructed from the red markers in the in-game icons
- Doorways rotate with structures
- Aligned facing doorways turn green
- Doorways facing a wall without an aligned doorway turn amber
- Toolbar controls for showing doorways and connection highlighting
- Doorway geometry tests
- Cleaned official menu-icon crops under `public/reference/structures`
- Optional structure labels toggle for placed rooms
- Room-connection/spacing validation: rooms must connect through aligned doorways or stay at least 2 tiles apart
- Cobblestone Path (2×2), Cobblestone Path (curved, 4×4 bounding box), and Portal (2×2)
- Paths and portals count as furniture pieces; they may overlap rooms but not each other
- Always-visible “Game rules & oddities” reference in the inspector
- South entrance marker at zero-based tiles 21–23, with a 2-tile brown approach outside the border

## Run

```bash
npm install
npm run dev
```

Validation:

```bash
npm test
npm run build
npm run preview
```

## Doorway colors

- **Red:** open/unconnected doorway
- **Green:** aligned with a facing doorway on a touching structure
- **Amber:** points into a touching structure wall without a matching doorway

Doorways are wall metadata only. They do not change the active collision footprint.

## Important assumptions

- Plot is 48×48 because moving from coordinate 0 to coordinate 47 includes 48 tiles.
- Collision currently reserves each structure's complete bounding rectangle, including visual cutouts.
- Irregular shapes are reconstructed from screenshots and should be tested in game before exact collision masks are implemented.
- Doorway markers are reconstructed from the red rectangles in the in-game menu icons.
- The natural dimensional system appears based on 4-tile modules, but the editor stores positions in 1×1 tiles.

## Paths

The currently recorded furniture-like pieces are:

- **Cobblestone Path:** 2×2
- **Cobblestone Path (curved):** 4×4 bounding box, equivalent to four 2×2 path tiles
- **Portal:** 2×2

Paths and portals do not have doorways. In this planner they count toward the **furniture limit**, not the room limit. They may be placed inside rooms, but they still cannot overlap other furniture pieces. Their costs, level requirements, and exact outer-edge behavior are marked as unconfirmed until they are tested in game.

## In-app rule reference

The right-side inspector includes a **Game rules & oddities** card. It separates observed behavior from planner assumptions, including:

- 48×48 plot size
- asymmetric edge margins
- the west-edge vertical hallway exception
- the room connection/two-tile spacing rule
- path exemptions
- bounding-box collision assumptions

## Recommended next work

1. Add undo/redo history.
2. Add JSON import and named saved layouts.
3. Replace bounding-box collision with per-tile masks once overlap rules are known.
4. Confirm doorway widths and offsets with in-game placement tests.
5. Add pan/zoom and a responsive layout.
6. Add structure duplication and copy/paste.
7. Add shareable compressed URL layouts.
8. Add screenshot/image export.
9. Package with Tauri after the web version is stable.

See `PROJECT_SPEC.md` and `COPILOT_PROMPT.md` for detailed context.

## npm registry troubleshooting

This archive is configured to use the public npm registry. If npm still tries to use an internal or old registry URL, run these commands from the project folder in Windows Command Prompt:

```bat
rmdir /s /q node_modules 2>nul
del /f /q package-lock.json 2>nul
npm config set registry https://registry.npmjs.org/
npm install
```

The project should not be distributed with `node_modules`; dependencies are installed locally for the current operating system.


## Plot boundary rules

Observed in-game edge rules currently implemented in the planner:

- West edge: structures must stay at least 1 tile away
- North edge: structures must stay at least 2 tiles away
- East edge: structures must stay at least 2 tiles away
- South edge: structures must stay at least 1 tile away
- Special case: vertically oriented hallway variants (`Hallway`, `Hallway (long)`, `Hallway (large)`) must stay at least 4 tiles away from the west edge

These rules are applied during placement, dragging, and rotation checks.


## Room connection and spacing rule

RuneScape rejects nearby rooms with the message: “Rooms need to connect to other rooms or be at least two tiles apart.” The planner applies this as a whole-room placement rule:

- A newly placed room is accepted when it has at least one aligned doorway connection to any existing room.
- Once connected, the room may also touch other rooms at walls or corners; every contact does not need its own doorway.
- A room with no connection must have at least two empty tiles of separation from every existing room.
- Actual room overlap remains invalid.
- The current implementation uses rectangular room bounds for spacing because exact collision masks for irregular rooms are still unconfirmed.


## Construction level limits

The planner now has a **Construction level** input. It enforces currently known level-based caps:

- **Furniture cap:** 20→50, 35→75, 50→100, 65→125, 80→150, 95→200, 110→250, 115→300
- **Room cap:** 30→10, 60→15, 90→20, 120→25

Important note: limits below level 20 are unknown. The editor starts at level 20 and only enforces caps that are confirmed from that point onward. Room-cap data is not confirmed below level 30, so room-count enforcement begins at level 30.


## Plot entrance

The in-game entrance approaches the plot from the **south side**. The planner marks the opening at zero-based x coordinates **21, 22, and 23**. A brown path is rendered for **2 tiles outside the south border** so the layout orientation is immediately clear. This outside approach is visual-only and does not count as buildable plot space or as a placed path/furniture item.


## JSON layout files

Use **Export JSON** to download the current layout and **Import JSON** to restore it later. Import restores the layout name, Construction level, and all placed rooms, paths, and portals. The entire file is validated before the current layout is replaced; malformed JSON, unknown structure IDs, unsupported versions, and placements that violate current rules are rejected.


## Drag placement behavior

Placed items move freely while being dragged. The preview outline turns green for a valid drop and red for an invalid drop. Placement rules are committed only when the pointer is released; an invalid drop returns the item to its previous position. Keyboard nudging and rotation still validate immediately.
