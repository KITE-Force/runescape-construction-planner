# RuneScape 120 Construction Layout Planner

Plan structures on RuneScape's 48×48 Construction plot before spending coins in game.

**Live planner:** https://kite-force.github.io/runescape-construction-planner/

> This project is unofficial and is not affiliated with or endorsed by Jagex. RuneScape names, images, and game assets belong to their respective owners. The MIT License applies only to the original source code in this repository.

## Features

- All currently recorded room types, paths, and portal furniture
- Drag, rotate, nudge, duplicate, copy, paste, and group selection
- Area selection and right-click planner actions
- Doorway connection and room-spacing validation
- Construction-level room and furniture limits
- Custom labels, notes, and structure colors
- Recently used colors
- Optional structure budget with `k`, `m`, and `b` shorthand
- Local browser saving
- JSON import and export
- Shareable compressed layout URLs with no backend
- High-resolution PNG export
- Whole-layout validation and planner feedback
- South entrance marker at tiles 21–23

## Controls

| Action | Control |
|---|---|
| Select | Click a structure |
| Add or remove from selection | Ctrl/Command/Shift-click |
| Area select | Drag from empty plot space |
| Add an area to the selection | Ctrl/Command/Shift-drag |
| Move | Drag the selection or use arrow keys |
| Rotate | `R` |
| Copy | `Ctrl/Cmd+C` |
| Paste | `Ctrl/Cmd+V` |
| Duplicate | `Ctrl/Cmd+D` |
| Delete | `Delete` or `Backspace` |
| Planner actions | Right-click the canvas or selection |

Dragging previews freely and validates on release. Invalid moves return to their previous positions. Rotation tries the current position first and then searches up to four tiles away for the nearest valid placement.

## Important planner rules

- Plot coordinates run from `0` to `47`.
- Structure margins are west `1`, north `2`, east `2`, and south `1`.
- Vertically oriented hallway variants require a west margin of `4`.
- Every positive-length shared wall between rooms requires an aligned doorway for that exact pair.
- A connected room may corner-touch another room.
- Non-touching rooms require at least two empty tiles of separation.
- Paths and portals may overlap rooms, but not other paths or portals.
- Irregular rooms currently use rectangular bounds for collision and spacing.
- The south entrance is marked at zero-based tiles `21–23`.

The in-app **Information** and **Game rules & oddities** panels contain the full rule reference.

## Costs and budget

Only room and structure placement costs are included. Paths, portals, labels, notes, colors, and planner actions do not add cost.

Budget input accepts values such as:

```text
1k
250k
1.5m
2b
1,250,000
```

The displayed **Experimental max budget** is a highest-known planner result, not a proven in-game global maximum.

## Saving and sharing

- **Save locally** stores the current layout in the browser.
- **Export JSON** creates a portable layout file.
- **Import JSON** validates and restores a layout.
- **Copy share link** stores compressed layout data directly in the URL.
- **Export PNG** creates a clean 2× image of the current plot.

Shared links require no account, database, or paid backend. Anyone with the link can read included labels and notes. Very large layouts may be more reliable as JSON files.

## Development

Requirements:

- Node.js
- npm

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

The repository is configured to use the public npm registry:

```text
https://registry.npmjs.org/
```

Do not distribute `node_modules`; install dependencies locally for the current operating system.

## Known limitations

- Exact collision masks for irregular rooms still need further in-game confirmation.
- Doorway positions were reconstructed from in-game menu icons.
- Some low-level room and furniture limits remain unconfirmed.
- Shared URLs can become long when layouts contain extensive notes.

Detailed implementation context is available in `PROJECT_SPEC.md`.
