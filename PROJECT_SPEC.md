# Project specification

## Goal

Create a preview/planning application for RuneScape's 120 Construction update. Placing structures in game is expensive and there is no preview mode. Users should be able to experiment on a 2D representation before committing coins.

## Plot

- Buildable grid: 48×48 tiles
- Tile coordinates: x=0–47, y=0–47
- Grid-line coordinates: 0–48
- Total tiles: 2,304

## Structures

| Name | Size | Cost | Level | Shape | Doorways |
|---|---:|---:|---:|---|---:|
| Square | 8×8 | 1,000 | 1 | Rectangle | 4 |
| Square (small) | 4×4 | 10,000 | 20 | Rectangle | 4 |
| Square (large) | 16×16 | 500,000 | 95 | Rectangle | 12 |
| Hallway | 8×4 | 5,000 | 10 | Rectangle | 4 |
| Hallway (long) | 16×4 | 30,000 | 30 | Rectangle | 8 |
| Hallway (large) | 16×8 | 250,000 | 90 | Rectangle | 8 |
| Cross | 8×8 | 50,000 | 50 | Irregular cross | 4 |
| Corner | 8×8 | 50,000 | 40 | L-shaped | 4 |
| T-Shape | 8×8 | 50,000 | 45 | T-shaped | 4 |
| Octagon | 8×8 | 150,000 | 60 | Beveled square | 4 |
| End (rounded) | 8×8 | 175,000 | 75 | Tapered end | 1 |
| Corner (rounded) | 8×8 | 125,000 | 70 | One beveled corner | 2 |
| Cobblestone Path | 2×2 | Unknown | Unknown | Landscaping path | 0 |
| Cobblestone Path (curved) | 4×4 | Unknown | Unknown | Curved landscaping path | 0 |
| Portal | 2×2 | Unknown | Unknown | Furniture / portal | 0 |

## Item categories

Definitions are categorized as `room`, `path`, or `portal`.

- Rooms participate in doorway connection detection and the two-tile room-spacing rule.
- Paths and portals have no doorways and are counted as furniture pieces.
- Paths and portals may overlap rooms, but not each other.
- All categories still participate in plot-boundary validation.

Path and portal costs and level requirements are optional fields because they have not yet been recorded. The UI displays them as unknown instead of treating zero as a verified game value.

## Approximate irregular geometry

These visual shapes are approximations from top-down screenshots. Keep visual and collision geometry separate.

- Cross: 8×8 with approximately 2×2 cutouts at all four corners.
- Corner: 8×8 composed of three 4×4 quadrants.
- T-Shape: 8×4 top bar plus centered 4×4 stem; two 2×4 outer sections absent.
- Octagon: 8×8 with four one-tile diagonal corner bevels.
- End (rounded): full-width rear, symmetrical tapered front.
- Corner (rounded): one corner diagonally clipped.

## Doorway model

The red rectangles in the in-game structure icons represent doorways.

Doorways are stored in each immutable `StructureDefinition` using local, unrotated tile coordinates:

```ts
interface DoorwayDefinition {
  side: 'north' | 'east' | 'south' | 'west';
  offset: number;
  width: number;
}
```

`offset` is the doorway center measured along the wall:

- north/south: measured from the structure's left edge
- east/west: measured from the structure's top edge

The initial doorway width is two tiles. Rotation is calculated at render/validation time; definition data is never mutated.

Two doorways connect when:

1. They face in opposite directions.
2. Their wall lines occupy the same world coordinate.
3. Their doorway spans align.
4. Their structures touch without overlapping illegally.

Rendering states:

- red: open doorway
- green: connected doorway
- amber: doorway faces a touching wall without an aligned opposing doorway

Doorways do not change collision geometry.

## Data design

Definitions contain immutable game data. Placed structures contain only instance data: structure ID, x/y coordinate, and rotation.

Do not permanently bake screenshots into collision logic. Add explicit per-tile occupancy masks only after in-game testing confirms cutouts can be used by neighboring structures.

## MVP acceptance criteria

- User can place all structures.
- Structures stay inside the 48×48 grid.
- Structures cannot overlap according to the active collision model.
- Structures rotate in 90-degree increments.
- User can select, move, delete, and inspect structures.
- Total coin cost updates immediately.
- Layout can be saved and exported.
- Doorways render in their correct local positions.
- Doorways rotate with placed structures.
- Aligned facing doorways are detected and highlighted.
- Doorway markers never intercept pointer interactions.


## Plot edge rules

The currently observed placement margins are:

- west: 1 tile
- north: 2 tiles
- east: 2 tiles
- south: 1 tile

Special-case rule:

- vertical hallway variants (`Hallway`, `Hallway (long)`, `Hallway (large)`) require a 4-tile west margin instead of 1. This matches the in-game behaviour where the room becomes valid only starting on the fifth tile from the west border.

## Display toggles

The toolbar now includes toggles for:

- showing doorway markers
- highlighting doorway connections
- showing or hiding the text label inside placed structures


## Room connection and spacing rule

Observed in-game validation message:

> Rooms need to connect to other rooms or be at least two tiles apart.

Implementation rules:

1. Overlapping room bounds are invalid.
2. Every positive-length shared wall between the candidate and another room requires an aligned opposing doorway connection for that exact pair.
3. If the candidate has at least one valid doorway connection, it may additionally touch another room at a single corner.
4. Non-touching rooms still require at least two empty tiles of separation, even when the candidate connects elsewhere.
5. A candidate with no connection must remain at least two empty tiles from every room.
6. The rule is checked during placement, drag release, keyboard nudging, rotation, and JSON import.

Until per-tile irregular collision masks are confirmed, spacing is measured between rectangular structure bounds.


## In-app game-rule reference

The inspector contains an always-visible **Game rules & oddities** card. Each entry is labeled as observed behavior, an oddity, a path rule, or a collision rule. A collapsible assumptions section records behavior that still needs in-game confirmation.

Current assumptions include:

- irregular rooms reserve full rectangular bounds for collision
- paths use the same outer plot margins as ordinary rooms until tested
- the curved path visual is reconstructed from the supplied screenshot inside an 8×8 bounding box
- path costs and Construction requirements are not yet known


## Construction limits

The planner includes an editable Construction level input and enforces known caps.

Confirmed furniture caps:

- 20 → 50
- 35 → 75
- 50 → 100
- 65 → 125
- 80 → 150
- 95 → 200
- 110 → 250
- 115 → 300

Confirmed room caps:

- 30 → 10
- 60 → 15
- 90 → 20
- 120 → 25

Known caveats:

- limits below level 20 are unknown
- room-cap data is not confirmed below level 30
- the planner should clearly explain these unknowns in the UI rather than inventing missing values


## Plot entrance orientation

Observed orientation marker:

- side: south
- zero-based plot columns: 21, 22, and 23
- opening width: 3 tiles
- visible brown approach: 2 tiles outside the south plot border

The approach path is a visual reference only. It is outside the 48×48 buildable area and is not included in room, furniture, cost, collision, or limit calculations.


## Drag placement behavior

Placed items move freely while being dragged. The preview outline turns green for a valid drop and red for an invalid drop. Placement rules are committed only when the pointer is released; an invalid drop returns the item to its previous position. Keyboard nudging and rotation still validate immediately.


## Per-instance annotations

`PlacedStructure` supports optional `customLabel` and `notes` strings. These fields are user data, not immutable game-definition data. They must survive local save, JSON export, and JSON import. When labels are visible, `customLabel` takes precedence over the structure definition name.

## Group selection

- Plain click selects one item.
- Ctrl/Command/Shift-click toggles additional items.
- Dragging any selected item previews translation of the entire selection and validates the complete drop on release.
- Invalid group drops restore every item to its original position.
- Arrow-key movement, rotation, and deletion apply to the complete selection.
- Group rotation is 90° clockwise around the selection bounds, with the resulting top-left corner anchored to the original top-left corner.
- A group transformation commits only when all selected items remain inside boundary constraints and the resulting layout passes overlap, connection, and spacing validation.


## Smart rotation

Rotation first tries the exact transformed position. If that position is invalid, the planner searches nearby integer-tile offsets, up to four tiles away, and applies the closest valid result. This accounts for irregular rooms whose effective in-game placement origin shifts when rotated. Group rotations use the same rule and move the complete selection together.
