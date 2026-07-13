import { useEffect, useMemo, useRef, useState } from 'react';
import { GRID_HEIGHT, GRID_WIDTH, structureById, structures } from './data/structures.js';
import {
  doorwayKey,
  doorwayRect,
  findBlockedDoorwayKeys,
  findDoorwayConnections,
  pointsFor,
  rectanglesOverlap,
  roomsMeetConnectionOrSpacingRule,
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [layoutName, setLayoutName] = useState('My layout');
  const [constructionLevel, setConstructionLevel] = useState(99);
  const [showDoorways, setShowDoorways] = useState(true);
  const [highlightConnections, setHighlightConnections] = useState(true);
  const [showStructureLabels, setShowStructureLabels] = useState(false);
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);

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

  const isValid = (candidate: PlacedStructure, ignoreId = candidate.instanceId) => {
    const candidateDefinition = structureById.get(candidate.structureId)!;
    const candidateBounds = bounds(candidate);
    const margins = placementMargins(candidate);

    if (
      candidateBounds.x < margins.west
      || candidateBounds.y < margins.north
      || candidateBounds.x + candidateBounds.width > GRID_WIDTH - margins.east
      || candidateBounds.y + candidateBounds.height > GRID_HEIGHT - margins.south
    ) return false;

    return !placed.some((other) => {
      if (other.instanceId === ignoreId) return false;

      const otherDefinition = structureById.get(other.structureId)!;
      const otherBounds = bounds(other);
      const overlap = rectanglesOverlap(candidateBounds, otherBounds);

      if (overlap) return !canShareSpace(candidateDefinition, otherDefinition);
      return !roomsMeetConnectionOrSpacingRule(candidate, other, structureById);
    });
  };

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
        if (isValid(candidate, '')) {
          setPlaced((current) => [...current, candidate]);
          setSelectedId(candidate.instanceId);
          return;
        }
      }
    }
    alert('No open space was found for that item using the current plot boundary and spacing rules.');
  };

  const updateSelected = (updater: (item: PlacedStructure) => PlacedStructure) => {
    if (!selectedId) return;
    setPlaced((current) => current.map((item) => {
      if (item.instanceId !== selectedId) return item;
      const candidate = updater(item);
      return isValid(candidate) ? candidate : item;
    }));
  };

  const rotateSelected = () => updateSelected((item) => ({
    ...item,
    rotation: nextRotation(item.rotation),
  }));

  const deleteSelected = () => {
    if (!selectedId) return;
    setPlaced((current) => current.filter((item) => item.instanceId !== selectedId));
    setSelectedId(null);
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
        updateSelected((item) => ({ ...item, x: item.x + dx, y: item.y + dy }));
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
  const selected = placed.find((item) => item.instanceId === selectedId) ?? null;

  const connections = useMemo(
    () => findDoorwayConnections(placed, structureById),
    [placed],
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
    () => findBlockedDoorwayKeys(placed, structureById, connectedDoorwayKeys),
    [placed, connectedDoorwayKeys],
  );

  const renderedPlaced = useMemo(() => [...placed].sort((a, b) => {
    const aDefinition = structureById.get(a.structureId)!;
    const bDefinition = structureById.get(b.structureId)!;
    const bySelected = Number(a.instanceId === selectedId) - Number(b.instanceId === selectedId);
    if (bySelected !== 0) return bySelected;
    return categoryOrder(aDefinition) - categoryOrder(bDefinition);
  }), [placed, selectedId]);

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

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = snap((event.clientX - rect.left) / CELL - dragRef.current.offsetX);
    const y = snap((event.clientY - rect.top) / CELL - dragRef.current.offsetY);
    const id = dragRef.current.id;

    setPlaced((current) => current.map((item) => {
      if (item.instanceId !== id) return item;
      const candidate = { ...item, x, y };
      return isValid(candidate, id) ? candidate : item;
    }));
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
          <button onClick={exportLayout}>Export JSON</button>
          <button onClick={() => { setPlaced([]); setSelectedId(null); }}>Clear</button>
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
            Show structure labels
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
        </div>

        <p className="plot-rules">
          Rooms must connect through aligned doorways or remain at least two empty tiles apart. Paths and portals are treated as furniture pieces: they may overlap rooms, but they do not overlap each other and they do not require doorways. The south entrance is marked at tiles 21–23, with a 2-tile brown approach outside the plot.
        </p>

        <div className="canvas-wrap">
          <svg
            className="planner-canvas"
            width={GRID_WIDTH * CELL}
            height={CANVAS_HEIGHT_TILES * CELL}
            viewBox={`0 0 ${GRID_WIDTH * CELL} ${CANVAS_HEIGHT_TILES * CELL}`}
            onPointerMove={onPointerMove}
            onPointerUp={() => { dragRef.current = null; }}
            onPointerLeave={() => { dragRef.current = null; }}
            onPointerDown={() => setSelectedId(null)}
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
              const selectedClass = item.instanceId === selectedId ? ' selected' : '';

              return (
                <g
                  key={item.instanceId}
                  className={`placed ${definition.category}${selectedClass}`}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    const rect = event.currentTarget.ownerSVGElement!.getBoundingClientRect();
                    dragRef.current = {
                      id: item.instanceId,
                      offsetX: (event.clientX - rect.left) / CELL - item.x,
                      offsetY: (event.clientY - rect.top) / CELL - item.y,
                    };
                    setSelectedId(item.instanceId);
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
                      {definition.name}
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
      </section>

      <aside className="panel inspector">
        <h2>Selected item</h2>
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
              <h3>{definition.name}</h3>
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
              <button onClick={rotateSelected}>Rotate (R)</button>
              <button className="danger" onClick={deleteSelected}>Delete</button>
              {definition.notes && <p className="warning">{definition.notes}</p>}
            </>
          );
        })() : (
          <p className="muted">
            Click an item to inspect it. Drag to move; press R to rotate; arrow keys nudge one tile.
          </p>
        )}

        <hr />
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
            <li><span className="rule-badge observed">Observed</span><span>Rooms must either touch through aligned, opposing doorways or remain at least 2 empty tiles apart.</span></li>
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
