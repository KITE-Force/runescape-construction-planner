import { useEffect, useMemo, useRef, useState } from 'react';
import { GRID_HEIGHT, GRID_WIDTH, structureById, structures } from './data/structures.js';
import {
  doorwayKey,
  doorwayRect,
  findBlockedDoorwayKeys,
  findDoorwayConnections,
  pointsFor,
  rectanglesOverlap,
  roomMeetsGlobalConnectionOrSpacingRule,
  rotatedSize,
  transformDoorway,
} from './geometry.js';
import {
  FURNITURE_LIMIT_STEPS,
  ROOM_LIMIT_STEPS,
  getFurnitureLimit,
  getRoomLimit,
  nextFurnitureLimit,
  nextRoomLimit,
} from './data/limits.js';
import type { PlacedStructure, Rotation, SavedLayout, StructureDefinition } from './types.js';
import { parseLayoutJson } from './layoutFile.js';
import { rotateSelectionClockwise, translateSelection } from './groupTransform.js';
import './styles.css';

const assetUrl = (path?: string) => {
  if (!path) return undefined;

  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
};

const CELL = 14;
const SNAP = 1;
const STORAGE_KEY = 'rs-construction-planner-layout-v1';
const MIN_CONSTRUCTION_LEVEL = 20;
const MAX_CONSTRUCTION_LEVEL = 120;
const SOUTH_ENTRANCE_START_X = 21;
const SOUTH_ENTRANCE_WIDTH = 3;
const SOUTH_APPROACH_DEPTH = 2;
const CANVAS_HEIGHT_TILES = GRID_HEIGHT + SOUTH_APPROACH_DEPTH;

const makeId = () => crypto.randomUUID();
const nextRotation = (rotation: Rotation): Rotation => ((rotation + 90) % 360) as Rotation;
const snap = (value: number) => Math.round(value / SNAP) * SNAP;
const clampLevel = (value: number) => Math.max(MIN_CONSTRUCTION_LEVEL, Math.min(MAX_CONSTRUCTION_LEVEL, value || MIN_CONSTRUCTION_LEVEL));

const roomDefinitions = structures.filter((definition) => definition.category === 'room');
const pathDefinitions = structures.filter((definition) => definition.category === 'path');
const portalDefinitions = structures.filter((definition) => definition.category === 'portal');

const costLabel = (cost: number | undefined) => (
  cost === undefined ? 'Cost unknown' : `${cost.toLocaleString()} coins`
);
const levelLabel = (level: number | undefined) => (
  level === undefined ? 'Level unknown' : `Level ${level}`
);

const isHallwayFamily = (structureId: string) => structureId.startsWith('hallway');
const isVerticalRotation = (rotation: Rotation) => rotation === 90 || rotation === 270;

function placementMargins(item: PlacedStructure) {
  return {
    west: isHallwayFamily(item.structureId) && isVerticalRotation(item.rotation) ? 4 : 1,
    north: 2,
    east: 2,
    south: 1,
  };
}

function categoryOrder(definition: StructureDefinition) {
  switch (definition.category) {
    case 'room': return 0;
    case 'path': return 1;
    case 'portal': return 2;
  }
}

function canShareSpace(first: StructureDefinition, second: StructureDefinition) {
  return (first.category === 'room' && second.category !== 'room')
    || (second.category === 'room' && first.category !== 'room');
}

export default function App() {
  const [placed, setPlaced] = useState<PlacedStructure[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [primarySelectedId, setPrimarySelectedId] = useState<string | null>(null);
  const [layoutName, setLayoutName] = useState('My layout');
  const [constructionLevel, setConstructionLevel] = useState(99);
  const [showDoorways, setShowDoorways] = useState(true);
  const [highlightConnections, setHighlightConnections] = useState(true);
  const [showStructureLabels, setShowStructureLabels] = useState(false);
  const [dragCandidates, setDragCandidates] = useState<PlacedStructure[] | null>(null);
  const [dragValidity, setDragValidity] = useState<'valid' | 'invalid' | null>(null);
  const dragRef = useRef<{
    ids: string[];
    startPointerX: number;
    startPointerY: number;
    originals: PlacedStructure[];
  } | null>(null);
  const dragCandidatesRef = useRef<PlacedStructure[] | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as SavedLayout;
      setPlaced(saved.structures ?? []);
      setLayoutName(saved.name ?? 'My layout');
      setConstructionLevel(clampLevel(saved.constructionLevel ?? 99));
    } catch {
      // Ignore malformed or outdated local data.
    }
  }, []);

  const bounds = (item: PlacedStructure) => {
    const definition = structureById.get(item.structureId)!;
    const size = rotatedSize(definition, item.rotation);
    return { x: item.x, y: item.y, ...size };
  };

  const roomCount = useMemo(
    () => placed.filter((item) => structureById.get(item.structureId)?.category === 'room').length,
    [placed],
  );
  const furnitureCount = useMemo(
    () => placed.filter((item) => structureById.get(item.structureId)?.category !== 'room').length,
    [placed],
  );

  const roomLimit = useMemo(() => getRoomLimit(constructionLevel), [constructionLevel]);
  const furnitureLimit = useMemo(() => getFurnitureLimit(constructionLevel), [constructionLevel]);
  const upcomingRoomLimit = useMemo(() => nextRoomLimit(constructionLevel), [constructionLevel]);
  const upcomingFurnitureLimit = useMemo(() => nextFurnitureLimit(constructionLevel), [constructionLevel]);

  const mergedLayout = (source: PlacedStructure[], candidates: PlacedStructure[]) => {
    const candidateById = new Map(candidates.map((item) => [item.instanceId, item]));
    const sourceIds = new Set(source.map((item) => item.instanceId));
    return [
      ...source.map((item) => candidateById.get(item.instanceId) ?? item),
      ...candidates.filter((item) => !sourceIds.has(item.instanceId)),
    ];
  };

  const areCandidatesValidAgainst = (
    candidates: PlacedStructure[],
    source: PlacedStructure[],
  ) => {
    if (candidates.length === 0) return false;
    const finalLayout = mergedLayout(source, candidates);

    for (const candidate of candidates) {
      const candidateBounds = bounds(candidate);
      const margins = placementMargins(candidate);
      if (
        candidateBounds.x < margins.west
        || candidateBounds.y < margins.north
        || candidateBounds.x + candidateBounds.width > GRID_WIDTH - margins.east
        || candidateBounds.y + candidateBounds.height > GRID_HEIGHT - margins.south
      ) return false;
    }

    for (let firstIndex = 0; firstIndex < finalLayout.length; firstIndex += 1) {
      const first = finalLayout[firstIndex];
      const firstDefinition = structureById.get(first.structureId)!;
      for (let secondIndex = firstIndex + 1; secondIndex < finalLayout.length; secondIndex += 1) {
        const second = finalLayout[secondIndex];
        const secondDefinition = structureById.get(second.structureId)!;
        if (
          rectanglesOverlap(bounds(first), bounds(second))
          && !canShareSpace(firstDefinition, secondDefinition)
        ) return false;
      }
    }

    return candidates.every((candidate) => roomMeetsGlobalConnectionOrSpacingRule(
      candidate,
      finalLayout.filter((item) => item.instanceId !== candidate.instanceId),
      structureById,
    ));
  };

  const isValidAgainst = (
    candidate: PlacedStructure,
    source: PlacedStructure[],
  ) => areCandidatesValidAgainst([candidate], source);

  const previewPlaced = useMemo(() => (
    dragCandidates ? mergedLayout(placed, dragCandidates) : placed
  ), [placed, dragCandidates]);

  const whyCannotAdd = (definition: StructureDefinition) => {
    if (definition.level !== undefined && definition.level > constructionLevel) {
      return `Requires Construction level ${definition.level}.`;
    }
    if (definition.category === 'room' && roomLimit !== undefined && roomCount + 1 > roomLimit) {
      return `Room limit reached (${roomCount}/${roomLimit}) at Construction level ${constructionLevel}.`;
    }
    if (definition.category !== 'room' && furnitureLimit !== undefined && furnitureCount + 1 > furnitureLimit) {
      return `Furniture limit reached (${furnitureCount}/${furnitureLimit}) at Construction level ${constructionLevel}.`;
    }
    return null;
  };

  const addStructure = (structureId: string) => {
    const definition = structureById.get(structureId)!;
    const blockedReason = whyCannotAdd(definition);
    if (blockedReason) {
      alert(blockedReason);
      return;
    }

    for (let y = 0; y <= GRID_HEIGHT - definition.height; y += SNAP) {
      for (let x = 0; x <= GRID_WIDTH - definition.width; x += SNAP) {
        const candidate: PlacedStructure = {
          instanceId: makeId(),
          structureId,
          x,
          y,
          rotation: 0,
        };
        if (isValidAgainst(candidate, placed)) {
          setPlaced((current) => [...current, candidate]);
          setSelectedIds([candidate.instanceId]);
          setPrimarySelectedId(candidate.instanceId);
          return;
        }
      }
    }
    alert('No open space was found for that item using the current plot boundary and spacing rules.');
  };

  const selectedItemsFrom = (source: PlacedStructure[]) => (
    source.filter((item) => selectedIdSet.has(item.instanceId))
  );

  const applySelectionCandidates = (
    candidates: PlacedStructure[],
    invalidMessage?: string,
  ) => {
    if (candidates.length === 0) return false;
    if (!areCandidatesValidAgainst(candidates, placed)) {
      if (invalidMessage) alert(invalidMessage);
      return false;
    }
    setPlaced((current) => mergedLayout(current, candidates));
    return true;
  };

  const moveSelection = (dx: number, dy: number) => {
    const originals = selectedItemsFrom(placed);
    applySelectionCandidates(translateSelection(originals, dx, dy));
  };

  const rotateSelected = () => {
    const originals = selectedItemsFrom(placed);
    applySelectionCandidates(
      rotateSelectionClockwise(originals, structureById),
      originals.length > 1
        ? 'The selected group cannot rotate there without violating a boundary, overlap, doorway, or spacing rule.'
        : 'That item cannot rotate there without violating a placement rule.',
    );
  };

  const deleteSelected = () => {
    if (selectedIds.length === 0) return;
    const removing = new Set(selectedIds);
    setPlaced((current) => current.filter((item) => !removing.has(item.instanceId)));
    setSelectedIds([]);
    setPrimarySelectedId(null);
  };

  const updateSelectedMetadata = (patch: Partial<Pick<PlacedStructure, 'customLabel' | 'notes'>>) => {
    if (!primarySelectedId || selectedIds.length !== 1) return;
    setPlaced((current) => current.map((item) => (
      item.instanceId === primarySelectedId ? { ...item, ...patch } : item
    )));
  };

  const toggleSelection = (instanceId: string) => {
    if (selectedIds.includes(instanceId)) {
      const next = selectedIds.filter((id) => id !== instanceId);
      setSelectedIds(next);
      if (primarySelectedId === instanceId) {
        setPrimarySelectedId(next.at(-1) ?? null);
      }
      return;
    }

    setSelectedIds([...selectedIds, instanceId]);
    setPrimarySelectedId(instanceId);
  };

  const clearSelection = () => {
    setSelectedIds([]);
    setPrimarySelectedId(null);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;

      if (event.key === 'Delete' || event.key === 'Backspace') deleteSelected();
      if (event.key.toLowerCase() === 'r') rotateSelected();

      const movement: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      if (movement[event.key]) {
        event.preventDefault();
        const [dx, dy] = movement[event.key];
        moveSelection(dx, dy);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const totalCost = useMemo(
    () => placed.reduce((total, item) => total + (structureById.get(item.structureId)?.cost ?? 0), 0),
    [placed],
  );
  const unknownCostCount = useMemo(
    () => placed.filter((item) => structureById.get(item.structureId)?.cost === undefined).length,
    [placed],
  );
  const selectedItems = previewPlaced.filter((item) => selectedIdSet.has(item.instanceId));
  const selected = selectedItems.length === 1 ? selectedItems[0] : null;

  const connections = useMemo(
    () => findDoorwayConnections(previewPlaced, structureById),
    [previewPlaced],
  );
  const connectedDoorwayKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const connection of connections) {
      keys.add(connection.first.key);
      keys.add(connection.second.key);
    }
    return keys;
  }, [connections]);
  const blockedDoorwayKeys = useMemo(
    () => findBlockedDoorwayKeys(previewPlaced, structureById, connectedDoorwayKeys),
    [previewPlaced, connectedDoorwayKeys],
  );

  const renderedPlaced = useMemo(() => [...previewPlaced].sort((a, b) => {
    const aDefinition = structureById.get(a.structureId)!;
    const bDefinition = structureById.get(b.structureId)!;
    const bySelected = Number(selectedIdSet.has(a.instanceId)) - Number(selectedIdSet.has(b.instanceId));
    if (bySelected !== 0) return bySelected;
    return categoryOrder(aDefinition) - categoryOrder(bDefinition);
  }), [previewPlaced, selectedIdSet]);

  const save = () => {
    const data: SavedLayout = {
      version: 1,
      name: layoutName,
      gridWidth: GRID_WIDTH,
      gridHeight: GRID_HEIGHT,
      constructionLevel,
      structures: placed,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  };

  const exportLayout = () => {
    const data: SavedLayout = {
      version: 1,
      name: layoutName,
      gridWidth: GRID_WIDTH,
      gridHeight: GRID_HEIGHT,
      constructionLevel,
      structures: placed,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${layoutName.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'layout'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };


  const importLayout = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (placed.length > 0 && !window.confirm('Importing a layout will replace the current layout. Continue?')) {
      return;
    }

    try {
      const imported = parseLayoutJson(await file.text());
      const invalidItem = imported.structures.find((item) => (
        !isValidAgainst(item, imported.structures)
      ));

      if (invalidItem) {
        const definition = structureById.get(invalidItem.structureId)!;
        throw new Error(`Imported placement for ${definition.name} at (${invalidItem.x}, ${invalidItem.y}) violates the current boundary, overlap, doorway, or spacing rules.`);
      }

      setPlaced(imported.structures);
      setLayoutName(imported.name);
      setConstructionLevel(clampLevel(imported.constructionLevel ?? 99));
      clearSelection();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(imported));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The selected layout could not be imported.';
      alert(`Import failed: ${message}`);
    }
  };

  const clearDrag = () => {
    dragRef.current = null;
    dragCandidatesRef.current = null;
    setDragCandidates(null);
    setDragValidity(null);
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const activeDrag = dragRef.current;
    if (!activeDrag) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const pointerX = (event.clientX - rect.left) / CELL;
    const pointerY = (event.clientY - rect.top) / CELL;
    const dx = snap(pointerX - activeDrag.startPointerX);
    const dy = snap(pointerY - activeDrag.startPointerY);
    const candidates = translateSelection(activeDrag.originals, dx, dy);

    dragCandidatesRef.current = candidates;
    setDragCandidates(candidates);
    setDragValidity(areCandidatesValidAgainst(candidates, placed) ? 'valid' : 'invalid');
  };

  const finishDrag = () => {
    const candidates = dragCandidatesRef.current;
    if (!candidates) {
      clearDrag();
      return;
    }

    setPlaced((current) => (
      areCandidatesValidAgainst(candidates, current)
        ? mergedLayout(current, candidates)
        : current
    ));
    clearDrag();
  };

  const cancelDrag = () => {
    clearDrag();
  };

  const selectedConnectionCount = selected
    ? connections.filter((connection) => (
      connection.first.instanceId === selected.instanceId
      || connection.second.instanceId === selected.instanceId
    )).length
    : 0;

  const roomLimitExceeded = roomLimit !== undefined && roomCount > roomLimit;
  const furnitureLimitExceeded = furnitureLimit !== undefined && furnitureCount > furnitureLimit;

  return (
    <main className="app-shell">
      <aside className="panel palette">
        <h1>Construction Planner</h1>
        <p className="muted">48 × 48 buildable plot</p>
        <div className="structure-list">
          {[
            { title: 'Rooms', items: roomDefinitions },
            { title: 'Paths', items: pathDefinitions },
            { title: 'Furniture', items: portalDefinitions },
          ].map((group) => (
            <section className="palette-group" key={group.title}>
              <h2>{group.title}</h2>
              <div className="palette-group-items">
                {group.items.map((structure) => {
                  const blockedReason = whyCannotAdd(structure);
                  const disabled = blockedReason !== null;
                  return (
                    <button
                      className={`structure-card ${structure.category}`}
                      key={structure.id}
                      onClick={() => addStructure(structure.id)}
                      disabled={disabled}
                      title={blockedReason ?? `Place ${structure.name}`}
                    >
                      {structure.referenceImage && <img src={assetUrl(structure.referenceImage)} alt="" />}
                      <span>
                        <strong>{structure.name}</strong>
                        <small>
                          {structure.width}×{structure.height}
                          {' · '}
                          {structure.category === 'room' ? levelLabel(structure.level) : 'Furniture piece'}
                          <br />
                          {costLabel(structure.cost)}
                          {structure.category === 'room' && (
                            <> · {structure.doorways.length} doorway{structure.doorways.length === 1 ? '' : 's'}</>
                          )}
                        </small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </aside>

      <section className="workspace">
        <div className="toolbar">
          <input
            value={layoutName}
            onChange={(event) => setLayoutName(event.target.value)}
            aria-label="Layout name"
          />
          <label className="number-field">
            Construction level
            <input
              type="number"
              min={MIN_CONSTRUCTION_LEVEL}
              max={MAX_CONSTRUCTION_LEVEL}
              value={constructionLevel}
              onChange={(event) => setConstructionLevel(clampLevel(Number(event.target.value)))}
              aria-label="Construction level"
            />
          </label>
          <button onClick={save}>Save locally</button>
          <button onClick={() => importInputRef.current?.click()}>Import JSON</button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={importLayout}
            aria-label="Import layout JSON"
          />
          <button onClick={exportLayout}>Export JSON</button>
          <button onClick={() => { setPlaced([]); clearSelection(); }}>Clear</button>
          <label className="toggle">
            <input
              type="checkbox"
              checked={showDoorways}
              onChange={(event) => setShowDoorways(event.target.checked)}
            />
            Show doorways
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={highlightConnections}
              onChange={(event) => setHighlightConnections(event.target.checked)}
              disabled={!showDoorways}
            />
            Highlight connections
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={showStructureLabels}
              onChange={(event) => setShowStructureLabels(event.target.checked)}
            />
            Show labels
          </label>
          <strong className="total">Known total: {totalCost.toLocaleString()} coins{unknownCostCount > 0 && ` + ${unknownCostCount} unknown`}</strong>
        </div>

        <div className="limit-strip" aria-label="Current level limits">
          <div className={`limit-chip ${roomLimitExceeded ? 'danger' : ''}`}>
            <strong>Rooms</strong>
            <span>{roomCount} / {roomLimit ?? 'Unknown'}</span>
            <small>
              {roomLimit === undefined
                ? 'No confirmed room cap below level 30'
                : upcomingRoomLimit
                  ? `Next room cap ${upcomingRoomLimit.limit} at level ${upcomingRoomLimit.level}`
                  : 'Highest known room cap reached'}
            </small>
          </div>
          <div className={`limit-chip ${furnitureLimitExceeded ? 'danger' : ''}`}>
            <strong>Furniture</strong>
            <span>{furnitureCount} / {furnitureLimit ?? 'Unknown'}</span>
            <small>
              {furnitureLimit === undefined
                ? 'No confirmed furniture cap'
                : upcomingFurnitureLimit
                  ? `Next furniture cap ${upcomingFurnitureLimit.limit} at level ${upcomingFurnitureLimit.level}`
                  : 'Highest known furniture cap reached'}
            </small>
          </div>
        </div>

        <div className="doorway-legend" aria-label="Doorway color legend">
          <span><i className="legend-swatch open" /> Open doorway</span>
          <span><i className="legend-swatch connected" /> Connected</span>
          <span><i className="legend-swatch blocked" /> Faces wall</span>
          <span><strong>{connections.length}</strong> active connection{connections.length === 1 ? '' : 's'}</span>
          {dragValidity && (
            <span className={`drag-status ${dragValidity}`}>
              {dragValidity === 'valid' ? 'Valid drop' : 'Invalid drop — releases back'}
            </span>
          )}
        </div>

        <p className="plot-rules">
          Click an item to select it. Ctrl/⌘/Shift-click toggles additional items for group move, rotation, and deletion. Drag freely and release to validate the complete selection; invalid drops return to their previous positions. A room with at least one aligned doorway connection may touch other rooms; a room with no connection must remain at least two empty tiles from every room. Paths and portals may overlap rooms but not each other. The south entrance is marked at tiles 21–23.
        </p>

        <div className="canvas-layout">
          <div className="canvas-wrap">
            <svg
              className="planner-canvas"
              width={GRID_WIDTH * CELL}
              height={CANVAS_HEIGHT_TILES * CELL}
              viewBox={`0 0 ${GRID_WIDTH * CELL} ${CANVAS_HEIGHT_TILES * CELL}`}
              onPointerMove={onPointerMove}
              onPointerUp={finishDrag}
              onPointerCancel={cancelDrag}
              onPointerDown={clearSelection}
              role="img"
              aria-label="Construction layout planner"
            >
              <defs>
                <pattern id="smallGrid" width={CELL} height={CELL} patternUnits="userSpaceOnUse">
                  <path
                    d={`M ${CELL} 0 L 0 0 0 ${CELL}`}
                    fill="none"
                    className="minor-grid"
                  />
                </pattern>
                <pattern id="largeGrid" width={CELL * 4} height={CELL * 4} patternUnits="userSpaceOnUse">
                  <rect width={CELL * 4} height={CELL * 4} fill="url(#smallGrid)" />
                  <path
                    d={`M ${CELL * 4} 0 L 0 0 0 ${CELL * 4}`}
                    fill="none"
                    className="major-grid"
                  />
                </pattern>
                <pattern id="southApproachPattern" width={CELL} height={CELL} patternUnits="userSpaceOnUse">
                  <rect width={CELL} height={CELL} className="south-approach-base" />
                  <circle cx={CELL * 0.25} cy={CELL * 0.28} r={CELL * 0.11} className="south-approach-stone" />
                  <circle cx={CELL * 0.68} cy={CELL * 0.62} r={CELL * 0.14} className="south-approach-stone alt" />
                  <circle cx={CELL * 0.82} cy={CELL * 0.18} r={CELL * 0.07} className="south-approach-stone" />
                </pattern>
              </defs>
              <rect
                width={GRID_WIDTH * CELL}
                height={CANVAS_HEIGHT_TILES * CELL}
                className="outside-plot-ground"
              />
              <rect
                width={GRID_WIDTH * CELL}
                height={GRID_HEIGHT * CELL}
                fill="url(#largeGrid)"
                className="buildable-plot"
              />
              <rect
                x={SOUTH_ENTRANCE_START_X * CELL}
                y={GRID_HEIGHT * CELL}
                width={SOUTH_ENTRANCE_WIDTH * CELL}
                height={SOUTH_APPROACH_DEPTH * CELL}
                fill="url(#southApproachPattern)"
                className="south-entrance-path"
              >
                <title>South plot entrance: tiles 21, 22, and 23; approach extends 2 tiles outside the border</title>
              </rect>
              <line
                x1={SOUTH_ENTRANCE_START_X * CELL}
                x2={(SOUTH_ENTRANCE_START_X + SOUTH_ENTRANCE_WIDTH) * CELL}
                y1={GRID_HEIGHT * CELL}
                y2={GRID_HEIGHT * CELL}
                className="south-entrance-opening"
              />
              <text
                x={(SOUTH_ENTRANCE_START_X + SOUTH_ENTRANCE_WIDTH / 2) * CELL}
                y={(GRID_HEIGHT + 1.35) * CELL}
                textAnchor="middle"
                className="south-entrance-label"
                textLength={SOUTH_ENTRANCE_WIDTH * CELL - 5}
                lengthAdjust="spacingAndGlyphs"
              >
                ENTRANCE
              </text>
              <rect
                width={GRID_WIDTH * CELL}
                height={GRID_HEIGHT * CELL}
                className="plot-border"
              />

              {renderedPlaced.map((item) => {
                const definition = structureById.get(item.structureId)!;
                const points = pointsFor(definition, item.rotation)
                  .map((point) => `${(item.x + point.x) * CELL},${(item.y + point.y) * CELL}`)
                  .join(' ');
                const size = rotatedSize(definition, item.rotation);
                const selectedClass = selectedIdSet.has(item.instanceId) ? ' selected' : '';
                const primaryClass = item.instanceId === primarySelectedId ? ' primary-selected' : '';
                const draggingClass = dragRef.current?.ids.includes(item.instanceId)
                  ? ` dragging drag-${dragValidity ?? 'valid'}`
                  : '';

                return (
                  <g
                    key={item.instanceId}
                    className={`placed ${definition.category}${selectedClass}${primaryClass}${draggingClass}`}
                    onPointerDown={(event) => {
                      event.stopPropagation();

                      if (event.ctrlKey || event.metaKey || event.shiftKey) {
                        toggleSelection(item.instanceId);
                        return;
                      }

                      const ids = selectedIdSet.has(item.instanceId)
                        ? selectedIds
                        : [item.instanceId];
                      if (!selectedIdSet.has(item.instanceId)) {
                        setSelectedIds(ids);
                      }
                      setPrimarySelectedId(item.instanceId);

                      const originals = placed.filter((placedItem) => ids.includes(placedItem.instanceId));
                      const rect = event.currentTarget.ownerSVGElement!.getBoundingClientRect();
                      dragRef.current = {
                        ids,
                        startPointerX: (event.clientX - rect.left) / CELL,
                        startPointerY: (event.clientY - rect.top) / CELL,
                        originals,
                      };
                      dragCandidatesRef.current = originals;
                      setDragCandidates(originals);
                      setDragValidity('valid');
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                  >
                    {(definition.category === 'path' || definition.category === 'portal') && definition.canvasImage && (
                      <image
                        className={`${definition.category}-image`}
                        href={assetUrl(definition.canvasImage)}
                        x={item.x * CELL}
                        y={item.y * CELL}
                        width={size.width * CELL}
                        height={size.height * CELL}
                        preserveAspectRatio="none"
                        transform={`rotate(${item.rotation} ${(item.x + size.width / 2) * CELL} ${(item.y + size.height / 2) * CELL})`}
                      />
                    )}
                    <polygon points={points} />
                    {showStructureLabels && (
                      <text
                        x={(item.x + size.width / 2) * CELL}
                        y={(item.y + size.height / 2) * CELL}
                        textAnchor="middle"
                        dominantBaseline="central"
                      >
                        {item.customLabel?.trim() || definition.name}
                      </text>
                    )}

                    {showDoorways && definition.doorways.map((doorway, doorwayIndex) => {
                      const transformed = transformDoorway(
                        doorway,
                        definition.width,
                        definition.height,
                        item.rotation,
                      );
                      const marker = doorwayRect(item, transformed);
                      const key = doorwayKey(item.instanceId, doorwayIndex);
                      const status = highlightConnections
                        ? connectedDoorwayKeys.has(key)
                          ? 'connected'
                          : blockedDoorwayKeys.has(key)
                            ? 'blocked'
                            : 'open'
                        : 'open';

                      return (
                        <rect
                          key={key}
                          className={`doorway-marker ${status}`}
                          x={marker.x * CELL}
                          y={marker.y * CELL}
                          width={marker.width * CELL}
                          height={marker.height * CELL}
                          rx={1.5}
                          aria-label={`${definition.name} ${transformed.side} doorway`}
                        />
                      );
                    })}
                  </g>
                );
              })}
            </svg>
          </div>

          <section className="selection-card" aria-label="Selected structures">
            <h2>Selection</h2>
            {selected ? (() => {
              const definition = structureById.get(selected.structureId)!;
              const selectedDoorwaysConnected = connectedDoorwayKeys.size > 0
                ? definition.doorways.filter((_, doorwayIndex) => (
                  connectedDoorwayKeys.has(doorwayKey(selected.instanceId, doorwayIndex))
                )).length
                : 0;
              const selectedMargins = placementMargins(selected);

              return (
                <>
                  <h3>{selected.customLabel?.trim() || definition.name}</h3>
                  {selected.customLabel?.trim() && <p className="muted">Structure type: {definition.name}</p>}
                  <label className="inspector-field">
                    <span>Custom label</span>
                    <input
                      value={selected.customLabel ?? ''}
                      onChange={(event) => updateSelectedMetadata({ customLabel: event.target.value })}
                      placeholder="Example: Prayer Room"
                      maxLength={80}
                    />
                  </label>
                  <label className="inspector-field">
                    <span>Notes</span>
                    <textarea
                      value={selected.notes ?? ''}
                      onChange={(event) => updateSelectedMetadata({ notes: event.target.value })}
                      placeholder="Add plans, furniture ideas, requirements, or reminders…"
                      rows={6}
                      maxLength={2000}
                    />
                  </label>
                  <p>Type: {definition.category === 'room' ? 'Room' : 'Furniture piece'}</p>
                  <p>Requirement: {levelLabel(definition.level)}</p>
                  <p>Position: ({selected.x}, {selected.y})</p>
                  <p>Rotation: {selected.rotation}°</p>
                  <p>
                    Bounds: {rotatedSize(definition, selected.rotation).width}
                    {' × '}
                    {rotatedSize(definition, selected.rotation).height}
                  </p>
                  <p>Cost: {costLabel(definition.cost)}</p>
                  {definition.category === 'room' ? (
                    <p>
                      Doorways: {definition.doorways.length}
                      {' · '}
                      {selectedDoorwaysConnected} connected
                      {selectedConnectionCount > 0 && ` across ${selectedConnectionCount} room connection${selectedConnectionCount === 1 ? '' : 's'}`}
                    </p>
                  ) : (
                    <p>This item counts as 1 furniture piece. It may overlap rooms but not other furniture pieces.</p>
                  )}
                  <p>
                    Margins: W{selectedMargins.west} · N{selectedMargins.north} · E{selectedMargins.east} · S{selectedMargins.south}
                  </p>
                  <div className="selection-actions">
                    <button onClick={rotateSelected}>Rotate (R)</button>
                    <button className="danger" onClick={deleteSelected}>Delete</button>
                  </div>
                  {definition.notes && <p className="warning"><strong>Game-data note:</strong> {definition.notes}</p>}
                </>
              );
            })() : selectedItems.length > 1 ? (
              <>
                <h3>{selectedItems.length} items selected</h3>
                <p className="muted">
                  Drag any selected item to move the group. Group rotation turns the full arrangement 90° clockwise and keeps its top-left corner anchored.
                </p>
                <ul className="selection-list">
                  {selectedItems.map((item) => {
                    const definition = structureById.get(item.structureId)!;
                    return (
                      <li key={item.instanceId}>
                        <strong>{item.customLabel?.trim() || definition.name}</strong>
                        <span>({item.x}, {item.y}) · {item.rotation}°</span>
                      </li>
                    );
                  })}
                </ul>
                <div className="selection-actions">
                  <button onClick={rotateSelected}>Rotate group (R)</button>
                  <button className="danger" onClick={deleteSelected}>Delete group</button>
                  <button onClick={clearSelection}>Clear selection</button>
                </div>
              </>
            ) : (
              <p className="muted">
                Click an item to inspect it and add a custom label or notes. Ctrl/⌘/Shift-click additional items to create a group. Drag to move; press R to rotate; arrow keys nudge; Delete/Backspace removes the full selection.
              </p>
            )}
          </section>
        </div>
      </section>

      <aside className="panel inspector">
        <section className="game-rules-card">
          <h2>Game rules & oddities</h2>
          <p className="rule-intro">
            Enter your Construction level above to enforce currently known room and furniture limits. Limits below level 20 are not known, so this planner starts from level 20 and only enforces limits that are confirmed from that point onward.
          </p>
          <ul className="rules-list">
            <li><span className="rule-badge observed">Observed</span><span>The buildable plot is treated as a 48×48 tile grid, with coordinates 0–47.</span></li>
            <li><span className="rule-badge entrance">Entrance</span><span>The plot entrance is on the south side at zero-based tiles 21, 22, and 23. A brown approach path extends 2 tiles outside the border; this marker is visual and does not consume buildable space.</span></li>
            <li><span className="rule-badge observed">Observed</span><span>Closest room placement to an edge: west 1 tile, north 2 tiles, east 2 tiles, south 1 tile.</span></li>
            <li><span className="rule-badge oddity">Oddity</span><span>A vertically oriented Hallway, Hallway (long), or Hallway (large) needs 4 clear tiles from the west border. Horizontal hallways use the normal 1-tile west margin.</span></li>
            <li><span className="rule-badge observed">Observed</span><span>A newly placed room is valid if it has at least one aligned doorway connection. Without a connection, it must remain at least 2 empty tiles from every other room.</span></li>
            <li><span className="rule-badge path">Path</span><span>Paths and the Portal count as furniture pieces in this planner. They may be placed inside rooms, but they still cannot overlap each other.</span></li>
            <li><span className="rule-badge observed">Observed</span><span>Confirmed furniture caps: {FURNITURE_LIMIT_STEPS.map((step) => `${step.level}→${step.limit}`).join(', ')}.</span></li>
            <li><span className="rule-badge observed">Observed</span><span>Confirmed room caps: {ROOM_LIMIT_STEPS.map((step) => `${step.level}→${step.limit}`).join(', ')}. Room cap is not confirmed below level 30.</span></li>
            <li><span className="rule-badge collision">Collision</span><span>Room-on-room overlap is blocked. Furniture pieces may overlap rooms, but not other furniture pieces.</span></li>
          </ul>
          <details>
            <summary>Planner assumptions still needing in-game confirmation</summary>
            <ul>
              <li>Irregular rooms currently reserve their full rectangular bounds for collision.</li>
              <li>Paths and the portal currently use the same outer plot margins as ordinary structures.</li>
              <li>The curved path artwork and portal artwork are planner approximations for visibility.</li>
              <li>Path and portal costs and level requirements are still unknown.</li>
            </ul>
          </details>
        </section>

        <hr />
        <h2>Doorways</h2>
        <p className="muted">
          Red markers are open doorways from the in-game structure icons. Matching doorways turn green when two structures touch and align. Amber means a doorway points into a wall without a matching doorway.
        </p>

        <hr />
        <h2>Current limitations</h2>
        <p className="muted">
          Collision still uses rectangular bounds. Irregular room outlines and the curved-path artwork are visual approximations until more in-game placement tests establish exact occupied cells.
        </p>
      </aside>
    </main>
  );
}
