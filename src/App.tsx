import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
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
import { validateLayout } from './layoutValidation.js';
import { exportPlannerSvgToPng } from './pngExport.js';
import { createShareUrl, readSharedLayout } from './shareUrl.js';
import {
  EXPERIMENTAL_MAX_BUDGET,
  EXPERIMENTAL_MAX_DESCRIPTION,
  parseCoinAmount,
} from './budget.js';
import {
  DEFAULT_STRUCTURE_COLOR,
  addRecentColor,
  normalizeColorInput,
  parseRecentColors,
} from './color.js';
import {
  findNearestValidSelectionPlacement,
  rotateSelectionClockwise,
  rotateSelectionCounterClockwise,
  translateSelection,
} from './groupTransform.js';
import {
  isMeaningfulMarquee,
  rectangleFromPoints,
  rectanglesIntersectOrTouch,
} from './marquee.js';
import {
  cloneSelectionForClipboard,
  createPastedSelection,
  offsetSelectionToAnchor,
} from './clipboard.js';
import './styles.css';

const assetUrl = (path?: string) => {
  if (!path) return undefined;

  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
};

const CELL = 14;
const SNAP = 1;
const STORAGE_KEY = 'rs-construction-planner-layout-v1';
const RECENT_COLORS_STORAGE_KEY = 'rs-construction-planner-recent-colors-v1';
const MIN_CONSTRUCTION_LEVEL = 20;
const MAX_CONSTRUCTION_LEVEL = 120;
const SOUTH_ENTRANCE_START_X = 21;
const SOUTH_ENTRANCE_WIDTH = 3;
const SOUTH_APPROACH_DEPTH = 2;
const CANVAS_HEIGHT_TILES = GRID_HEIGHT + SOUTH_APPROACH_DEPTH;

const readAmbientCaption = () => [
  10, 37, 40, 39, 115, 105, 8, 105, 14, 105, 12,
].map((value) => String.fromCharCode(value ^ 73)).join('');

const makeId = () => crypto.randomUUID();
const nextRotation = (rotation: Rotation): Rotation => ((rotation + 90) % 360) as Rotation;
const snap = (value: number) => Math.round(value / SNAP) * SNAP;
const clampLevel = (value: number) => Math.max(MIN_CONSTRUCTION_LEVEL, Math.min(MAX_CONSTRUCTION_LEVEL, value || MIN_CONSTRUCTION_LEVEL));
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

const roomDefinitions = structures.filter((definition) => definition.category === 'room');
const pathDefinitions = structures.filter((definition) => definition.category === 'path');
const portalDefinitions = structures.filter((definition) => definition.category === 'portal');

const costLabel = (cost: number | undefined) => (
  cost === undefined ? 'Cost unknown' : `${cost.toLocaleString()} coins`
);
const levelLabel = (level: number | undefined) => (
  level === undefined ? 'Level unknown' : `Level ${level}`
);
const structureCostLabel = (definition: StructureDefinition) => (
  definition.category === 'room' ? costLabel(definition.cost) : 'No structure cost'
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

type FeedbackKind = 'info' | 'success' | 'warning' | 'error';

interface FeedbackMessage {
  id: number;
  kind: FeedbackKind;
  text: string;
}

interface MarqueeState {
  pointerId: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  additive: boolean;
  baseIds: string[];
}

interface ContextMenuState {
  clientX: number;
  clientY: number;
  plotX: number;
  plotY: number;
  selectionIds: string[];
}

export default function App() {
  const [placed, setPlaced] = useState<PlacedStructure[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [primarySelectedId, setPrimarySelectedId] = useState<string | null>(null);
  const [layoutName, setLayoutName] = useState('My layout');
  const [constructionLevel, setConstructionLevel] = useState(99);
  const [budgetInput, setBudgetInput] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const [ambientOpen, setAmbientOpen] = useState(false);
  const [showDoorways, setShowDoorways] = useState(true);
  const [highlightConnections, setHighlightConnections] = useState(true);
  const [showStructureLabels, setShowStructureLabels] = useState(false);
  const [feedbackExpanded, setFeedbackExpanded] = useState(false);
  const [colorInput, setColorInput] = useState('');
  const [recentColors, setRecentColors] = useState<string[]>(() => (
    parseRecentColors(localStorage.getItem(RECENT_COLORS_STORAGE_KEY))
  ));
  const [dragCandidates, setDragCandidates] = useState<PlacedStructure[] | null>(null);
  const [dragValidity, setDragValidity] = useState<'valid' | 'invalid' | null>(null);
  const [marquee, setMarquee] = useState<MarqueeState | null>(null);
  const [clipboardItems, setClipboardItems] = useState<PlacedStructure[]>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [feedbackMessages, setFeedbackMessages] = useState<FeedbackMessage[]>([
    { id: 0, kind: 'info', text: 'Planner ready. Feedback and validation messages will appear here.' },
  ]);
  const feedbackIdRef = useRef(1);
  const dragRef = useRef<{
    ids: string[];
    startPointerX: number;
    startPointerY: number;
    originals: PlacedStructure[];
    wheelTurns: number;
  } | null>(null);
  const dragCandidatesRef = useRef<PlacedStructure[] | null>(null);
  const wheelRotationRef = useRef({ accumulatedDelta: 0 });
  const marqueeRef = useRef<MarqueeState | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<SVGSVGElement | null>(null);
  const pasteSequenceRef = useRef(0);
  const initialLayoutLoadRef = useRef(false);
  const ambientTapRef = useRef({ count: 0, lastTap: 0 });

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const marqueeRectangle = useMemo(() => (
    marquee
      ? rectangleFromPoints(
        { x: marquee.startX, y: marquee.startY },
        { x: marquee.currentX, y: marquee.currentY },
      )
      : null
  ), [marquee]);

  const postFeedback = (text: string, kind: FeedbackKind = 'info') => {
    const message: FeedbackMessage = {
      id: feedbackIdRef.current,
      kind,
      text,
    };
    feedbackIdRef.current += 1;
    setFeedbackMessages((current) => [message, ...current].slice(0, 6));
  };

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
  const layoutIssues = useMemo(
    () => validateLayout(placed, constructionLevel, structureById),
    [placed, constructionLevel],
  );

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

  useEffect(() => {
    if (initialLayoutLoadRef.current) return;
    initialLayoutLoadRef.current = true;

    try {
      const shared = readSharedLayout();
      if (shared) {
        const imported = parseLayoutJson(JSON.stringify(shared));
        const invalidItem = imported.structures.find((item) => (
          !isValidAgainst(item, imported.structures)
        ));

        if (invalidItem) {
          const definition = structureById.get(invalidItem.structureId)!;
          throw new Error(`Placement for ${definition.name} at (${invalidItem.x}, ${invalidItem.y}) violates the current boundary, overlap, doorway, or spacing rules.`);
        }

        setPlaced(imported.structures);
        setLayoutName(imported.name);
        setConstructionLevel(clampLevel(imported.constructionLevel ?? 99));
        setBudgetInput(imported.budget === undefined ? '' : String(imported.budget));
        clearSelection();
        postFeedback(`Loaded shared layout “${imported.name}” with ${imported.structures.length} item${imported.structures.length === 1 ? '' : 's'}. Save locally to keep it in this browser.`, 'success');
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The shared layout could not be loaded.';
      postFeedback(`Shared layout failed: ${message}`, 'error');
    }

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as SavedLayout;
      setPlaced(saved.structures ?? []);
      setLayoutName(saved.name ?? 'My layout');
      setConstructionLevel(clampLevel(saved.constructionLevel ?? 99));
      setBudgetInput(saved.budget === undefined ? '' : String(saved.budget));
    } catch {
      // Ignore malformed or outdated local data.
    }
  }, []);

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
      postFeedback(blockedReason, 'error');
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
          postFeedback(`Added ${definition.name}.`, 'success');
          return;
        }
      }
    }
    postFeedback('No open space was found for that item using the current plot boundary and spacing rules.', 'error');
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
      if (invalidMessage) postFeedback(invalidMessage, 'error');
      return false;
    }
    setPlaced((current) => mergedLayout(current, candidates));
    return true;
  };

  const moveSelection = (dx: number, dy: number) => {
    const originals = selectedItemsFrom(placed);
    applySelectionCandidates(
      translateSelection(originals, dx, dy),
      originals.length > 1
        ? 'The selected group cannot move there without violating a placement rule.'
        : 'That item cannot move there without violating a placement rule.',
    );
  };

  const rotateSelected = () => {
    const originals = selectedItemsFrom(placed);
    const rotated = rotateSelectionClockwise(originals, structureById);
    const placement = findNearestValidSelectionPlacement(
      rotated,
      (candidates) => areCandidatesValidAgainst(candidates, placed),
      4,
    );

    if (!placement) {
      postFeedback(
        originals.length > 1
          ? 'The selected group cannot rotate within four nearby tiles without violating a boundary, overlap, doorway, or spacing rule.'
          : 'That item cannot rotate in place or within four nearby tiles without violating a placement rule.',
        'error',
      );
      return;
    }

    setPlaced((current) => mergedLayout(current, placement.items));
    if (placement.dx === 0 && placement.dy === 0) {
      postFeedback(originals.length > 1 ? 'Group rotated in place.' : 'Item rotated in place.', 'success');
    } else {
      const horizontal = placement.dx === 0
        ? ''
        : `${Math.abs(placement.dx)} ${placement.dx > 0 ? 'right' : 'left'}`;
      const vertical = placement.dy === 0
        ? ''
        : `${Math.abs(placement.dy)} ${placement.dy > 0 ? 'down' : 'up'}`;
      postFeedback(
        `Smart rotate nudged the ${originals.length > 1 ? 'group' : 'item'} ${[horizontal, vertical].filter(Boolean).join(' and ')}.`,
        'warning',
      );
    }
  };

  const deleteSelected = () => {
    if (selectedIds.length === 0) return;
    const removing = new Set(selectedIds);
    setPlaced((current) => current.filter((item) => !removing.has(item.instanceId)));
    setSelectedIds([]);
    setPrimarySelectedId(null);
    postFeedback(`Deleted ${removing.size} selected item${removing.size === 1 ? '' : 's'}.`, 'success');
  };

  const itemsForIds = (ids: string[], source: PlacedStructure[] = placed) => {
    const idSet = new Set(ids);
    return source.filter((item) => idSet.has(item.instanceId));
  };

  const copySelection = (ids: string[] = selectedIds) => {
    const copying = itemsForIds(ids);
    if (copying.length === 0) {
      postFeedback('Select at least one structure before copying.', 'warning');
      return false;
    }

    setClipboardItems(cloneSelectionForClipboard(copying));
    pasteSequenceRef.current = 0;
    postFeedback(`Copied ${copying.length} item${copying.length === 1 ? '' : 's'} to the planner clipboard.`, 'success');
    return true;
  };

  const pasteLimitProblem = (items: PlacedStructure[]) => {
    for (const item of items) {
      const definition = structureById.get(item.structureId);
      if (!definition) return `The copied selection contains an unknown structure type: ${item.structureId}.`;
      if (definition.level !== undefined && definition.level > constructionLevel) {
        return `${definition.name} requires Construction level ${definition.level}.`;
      }
    }

    const addedRooms = items.filter((item) => structureById.get(item.structureId)?.category === 'room').length;
    const addedFurniture = items.length - addedRooms;
    if (roomLimit !== undefined && roomCount + addedRooms > roomLimit) {
      return `Pasting would exceed the room limit (${roomCount + addedRooms}/${roomLimit}) at Construction level ${constructionLevel}.`;
    }
    if (furnitureLimit !== undefined && furnitureCount + addedFurniture > furnitureLimit) {
      return `Pasting would exceed the furniture limit (${furnitureCount + addedFurniture}/${furnitureLimit}) at Construction level ${constructionLevel}.`;
    }
    return null;
  };

  const pasteCopiedItems = (
    sourceItems: PlacedStructure[],
    anchor?: { x: number; y: number },
    actionLabel = 'Pasted',
  ) => {
    if (sourceItems.length === 0) {
      postFeedback('Nothing has been copied yet.', 'warning');
      return false;
    }

    const limitProblem = pasteLimitProblem(sourceItems);
    if (limitProblem) {
      postFeedback(limitProblem, 'error');
      return false;
    }

    const sequenceOffset = 2 * (pasteSequenceRef.current + 1);
    const offset = anchor
      ? offsetSelectionToAnchor(sourceItems, anchor.x, anchor.y)
      : { dx: sequenceOffset, dy: sequenceOffset };
    const initialCandidates = createPastedSelection(
      sourceItems,
      offset.dx,
      offset.dy,
      makeId,
    );
    const placement = findNearestValidSelectionPlacement(
      initialCandidates,
      (candidates) => areCandidatesValidAgainst(candidates, placed),
      Math.max(GRID_WIDTH, GRID_HEIGHT),
    );

    if (!placement) {
      postFeedback('No valid open location was found for the copied selection.', 'error');
      return false;
    }

    setPlaced((current) => [...current, ...placement.items]);
    const pastedIds = placement.items.map((item) => item.instanceId);
    setSelectedIds(pastedIds);
    setPrimarySelectedId(pastedIds.at(-1) ?? null);
    pasteSequenceRef.current += 1;

    const adjusted = placement.dx !== 0 || placement.dy !== 0;
    postFeedback(
      `${actionLabel} ${placement.items.length} item${placement.items.length === 1 ? '' : 's'}${adjusted ? ' at the nearest valid position' : ''}.`,
      adjusted ? 'warning' : 'success',
    );
    return true;
  };

  const pasteClipboard = (anchor?: { x: number; y: number }) => (
    pasteCopiedItems(clipboardItems, anchor, anchor ? 'Pasted' : 'Pasted')
  );

  const duplicateSelection = (ids: string[] = selectedIds) => {
    const duplicating = itemsForIds(ids);
    if (duplicating.length === 0) {
      postFeedback('Select at least one structure before duplicating.', 'warning');
      return false;
    }
    return pasteCopiedItems(cloneSelectionForClipboard(duplicating), undefined, 'Duplicated');
  };

  const deleteItemsByIds = (ids: string[]) => {
    if (ids.length === 0) return;
    const removing = new Set(ids);
    setPlaced((current) => current.filter((item) => !removing.has(item.instanceId)));
    setSelectedIds((current) => current.filter((id) => !removing.has(id)));
    setPrimarySelectedId((current) => (current && removing.has(current) ? null : current));
    postFeedback(`Deleted ${removing.size} item${removing.size === 1 ? '' : 's'}.`, 'success');
  };

  const updateSelectedMetadata = (patch: Partial<Pick<PlacedStructure, 'customLabel' | 'notes'>>) => {
    if (!primarySelectedId || selectedIds.length !== 1) return;
    setPlaced((current) => current.map((item) => (
      item.instanceId === primarySelectedId ? { ...item, ...patch } : item
    )));
  };

  const applyColorToSelection = (
    rawColor: string,
    options: { recordRecent?: boolean; announce?: boolean } = {},
  ) => {
    const { recordRecent = true, announce = true } = options;

    if (selectedIds.length === 0) {
      if (announce) postFeedback('Select at least one structure before applying a color.', 'warning');
      return;
    }

    const normalized = normalizeColorInput(rawColor);
    if (!normalized) {
      if (announce) {
        postFeedback('Enter a valid color such as #4a90e2, 4a90e2, rgb(74, 144, 226), or 74, 144, 226.', 'error');
      }
      return;
    }

    const selected = new Set(selectedIds);
    setPlaced((current) => current.map((item) => (
      selected.has(item.instanceId) ? { ...item, customColor: normalized } : item
    )));
    setColorInput(normalized);

    if (recordRecent) {
      setRecentColors((current) => {
        const next = addRecentColor(current, normalized);
        localStorage.setItem(RECENT_COLORS_STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    }

    if (announce) {
      postFeedback(
        `Applied ${normalized} to ${selected.size} selected structure${selected.size === 1 ? '' : 's'}.`,
        'success',
      );
    }
  };

  const resetSelectionColor = () => {
    if (selectedIds.length === 0) return;
    const selected = new Set(selectedIds);
    setPlaced((current) => current.map((item) => {
      if (!selected.has(item.instanceId)) return item;
      const { customColor: _customColor, ...withoutColor } = item;
      return withoutColor;
    }));
    setColorInput('');
    postFeedback(
      `Reset the color for ${selected.size} selected structure${selected.size === 1 ? '' : 's'}.`,
      'success',
    );
  };

  const clearRecentColors = () => {
    setRecentColors([]);
    localStorage.removeItem(RECENT_COLORS_STORAGE_KEY);
    postFeedback('Cleared recently used colors.', 'info');
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

  const tapAmbientMark = () => {
    const now = performance.now();
    const previous = ambientTapRef.current;
    const count = now - previous.lastTap > 1_800 ? 1 : previous.count + 1;
    ambientTapRef.current = { count, lastTap: now };

    if (count >= 5) {
      ambientTapRef.current = { count: 0, lastTap: 0 };
      setAmbientOpen(true);
    }
  };

  useEffect(() => {
    if (!contextMenu) return undefined;

    const closeForOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest('.planner-context-menu')) setContextMenu(null);
    };
    const close = () => setContextMenu(null);

    window.addEventListener('pointerdown', closeForOutsidePointer, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('pointerdown', closeForOutsidePointer, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [contextMenu]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;

      const key = event.key.toLowerCase();
      const command = event.ctrlKey || event.metaKey;

      if (event.key === 'Escape') {
        setContextMenu(null);
        return;
      }

      if (command && key === 'c') {
        event.preventDefault();
        if (!event.repeat) copySelection();
        return;
      }
      if (command && key === 'v') {
        event.preventDefault();
        if (!event.repeat) pasteClipboard();
        return;
      }
      if (command && key === 'd') {
        event.preventDefault();
        if (!event.repeat) duplicateSelection();
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') deleteSelected();
      if (key === 'r') rotateSelected();

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

  useEffect(() => {
    if (!helpOpen && !ambientOpen) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setHelpOpen(false);
      setAmbientOpen(false);
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [helpOpen, ambientOpen]);

  const totalCost = useMemo(
    () => placed.reduce((total, item) => {
      const definition = structureById.get(item.structureId);
      return definition?.category === 'room' ? total + (definition.cost ?? 0) : total;
    }, 0),
    [placed],
  );
  const unknownCostCount = useMemo(
    () => placed.filter((item) => {
      const definition = structureById.get(item.structureId);
      return definition?.category === 'room' && definition.cost === undefined;
    }).length,
    [placed],
  );
  const validBudget = parseCoinAmount(budgetInput);
  const budgetRemaining = validBudget === undefined ? undefined : validBudget - totalCost;
  const budgetUsagePercent = validBudget === undefined
    ? undefined
    : validBudget <= 0
      ? totalCost > 0 ? 100 : 0
      : Math.round((totalCost / validBudget) * 100);
  const selectedItems = previewPlaced.filter((item) => selectedIdSet.has(item.instanceId));
  const selected = selectedItems.length === 1 ? selectedItems[0] : null;

  const selectedColorValues = selectedItems.map((item) => item.customColor ?? DEFAULT_STRUCTURE_COLOR);
  const commonSelectionColor = selectedColorValues.length > 0
    && selectedColorValues.every((color) => color === selectedColorValues[0])
    ? selectedColorValues[0]
    : null;
  const colorPickerValue = commonSelectionColor
    ?? selectedColorValues[0]
    ?? DEFAULT_STRUCTURE_COLOR;

  useEffect(() => {
    if (selectedItems.length === 0) {
      setColorInput('');
      return;
    }
    setColorInput(commonSelectionColor ?? '');
  }, [placed, selectedIds]);

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

  const clearLayout = () => {
    const removedCount = placed.length;
    setPlaced([]);
    clearSelection();
    postFeedback(
      removedCount > 0
        ? `Cleared ${removedCount} item${removedCount === 1 ? '' : 's'} from the layout.`
        : 'The layout is already empty.',
      'info',
    );
  };

  const currentLayoutData = (): SavedLayout => ({
    version: 1,
    name: layoutName,
    gridWidth: GRID_WIDTH,
    gridHeight: GRID_HEIGHT,
    constructionLevel,
    ...(validBudget === undefined ? {} : { budget: validBudget }),
    structures: placed,
  });

  const save = () => {
    const data = currentLayoutData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    postFeedback('Layout saved locally in this browser.', 'success');
  };

  const exportLayout = () => {
    const data = currentLayoutData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${layoutName.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'layout'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    postFeedback('Layout JSON exported.', 'success');
  };

  const copyText = async (text: string) => {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        // Fall back to a temporary text area for browsers that deny the modern API.
      }
    }

    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.select();
    const copied = document.execCommand('copy');
    textArea.remove();

    if (!copied) {
      throw new Error('The browser denied clipboard access.');
    }
  };

  const copyShareLink = async () => {
    try {
      const shareUrl = createShareUrl(currentLayoutData());
      await copyText(shareUrl);

      if (shareUrl.length > 8_000) {
        postFeedback('Share link copied, but it is unusually long. Export JSON may be more reliable for this layout.', 'warning');
      } else {
        postFeedback('Shareable layout link copied. Anyone with the link can open this layout.', 'success');
      }
    } catch (error) {
      postFeedback(
        error instanceof Error ? `Could not copy share link: ${error.message}` : 'Could not copy the share link.',
        'error',
      );
    }
  };

  const exportPng = async () => {
    if (!canvasRef.current) {
      postFeedback('The planner canvas is not ready to export yet.', 'error');
      return;
    }

    try {
      await exportPlannerSvgToPng(canvasRef.current, layoutName, 2);
      postFeedback('High-resolution layout PNG exported.', 'success');
    } catch (error) {
      postFeedback(
        error instanceof Error ? `PNG export failed: ${error.message}` : 'PNG export failed.',
        'error',
      );
    }
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
      setBudgetInput(imported.budget === undefined ? '' : String(imported.budget));
      clearSelection();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(imported));
      postFeedback(`Imported layout “${imported.name}” with ${imported.structures.length} item${imported.structures.length === 1 ? '' : 's'}.`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The selected layout could not be imported.';
      postFeedback(`Import failed: ${message}`, 'error');
    }
  };

  const clearDrag = () => {
    dragRef.current = null;
    dragCandidatesRef.current = null;
    wheelRotationRef.current = { accumulatedDelta: 0 };
    setDragCandidates(null);
    setDragValidity(null);
  };

  const clearMarquee = () => {
    marqueeRef.current = null;
    setMarquee(null);
  };

  const clientPositionInPlot = (
    canvas: SVGSVGElement,
    clientX: number,
    clientY: number,
  ) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp((clientX - rect.left) / CELL, 0, GRID_WIDTH),
      y: clamp((clientY - rect.top) / CELL, 0, GRID_HEIGHT),
    };
  };

  const pointerPositionInPlot = (event: React.PointerEvent<SVGSVGElement>) => (
    clientPositionInPlot(event.currentTarget, event.clientX, event.clientY)
  );

  const openCanvasContextMenu = (event: React.MouseEvent<SVGSVGElement>) => {
    event.preventDefault();
    const point = clientPositionInPlot(event.currentTarget, event.clientX, event.clientY);
    setContextMenu({
      clientX: event.clientX,
      clientY: event.clientY,
      plotX: point.x,
      plotY: point.y,
      selectionIds: [...selectedIds],
    });
  };

  const openItemContextMenu = (
    event: React.MouseEvent<SVGGElement>,
    instanceId: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const ids = selectedIdSet.has(instanceId) ? selectedIds : [instanceId];
    if (!selectedIdSet.has(instanceId)) setSelectedIds(ids);
    setPrimarySelectedId(instanceId);

    const canvas = event.currentTarget.ownerSVGElement;
    if (!canvas) return;
    const point = clientPositionInPlot(canvas, event.clientX, event.clientY);
    setContextMenu({
      clientX: event.clientX,
      clientY: event.clientY,
      plotX: point.x,
      plotY: point.y,
      selectionIds: [...ids],
    });
  };

  const beginMarquee = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    const point = pointerPositionInPlot(event);
    const next: MarqueeState = {
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y,
      additive: event.ctrlKey || event.metaKey || event.shiftKey,
      baseIds: selectedIds,
    };
    marqueeRef.current = next;
    setMarquee(next);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const activeMarquee = marqueeRef.current;
    if (activeMarquee) {
      const point = pointerPositionInPlot(event);
      const next = { ...activeMarquee, currentX: point.x, currentY: point.y };
      marqueeRef.current = next;
      setMarquee(next);
      return;
    }

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

  const rotateActiveDragWithWheel = (event: WheelEvent, canvas: SVGSVGElement) => {
    const activeDrag = dragRef.current;
    if (!activeDrag || marqueeRef.current || event.deltaY === 0) return;

    event.preventDefault();
    event.stopPropagation();

    const pixelDelta = event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? event.deltaY * 16
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? event.deltaY * window.innerHeight
        : event.deltaY;
    const wheelState = wheelRotationRef.current;

    if (wheelState.accumulatedDelta !== 0
      && Math.sign(wheelState.accumulatedDelta) !== Math.sign(pixelDelta)) {
      wheelState.accumulatedDelta = 0;
    }
    wheelState.accumulatedDelta += pixelDelta;

    if (Math.abs(wheelState.accumulatedDelta) < 40) return;

    const currentCandidates = dragCandidatesRef.current ?? activeDrag.originals;
    const rotateClockwise = wheelState.accumulatedDelta > 0;
    const rotated = rotateClockwise
      ? rotateSelectionClockwise(currentCandidates, structureById)
      : rotateSelectionCounterClockwise(currentCandidates, structureById);
    const rect = canvas.getBoundingClientRect();

    activeDrag.originals = rotated;
    activeDrag.startPointerX = (event.clientX - rect.left) / CELL;
    activeDrag.startPointerY = (event.clientY - rect.top) / CELL;
    activeDrag.wheelTurns += rotateClockwise ? 1 : -1;
    dragCandidatesRef.current = rotated;
    wheelState.accumulatedDelta = 0;

    setDragCandidates(rotated);
    setDragValidity(areCandidatesValidAgainst(rotated, placed) ? 'valid' : 'invalid');
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const handleWheel = (event: WheelEvent) => rotateActiveDragWithWheel(event, canvas);
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [placed]);

  const finishMarquee = () => {
    const activeMarquee = marqueeRef.current;
    if (!activeMarquee) return false;

    const selectionRectangle = rectangleFromPoints(
      { x: activeMarquee.startX, y: activeMarquee.startY },
      { x: activeMarquee.currentX, y: activeMarquee.currentY },
    );

    if (!isMeaningfulMarquee(selectionRectangle)) {
      if (!activeMarquee.additive) clearSelection();
      clearMarquee();
      return true;
    }

    const areaIds = placed
      .filter((item) => rectanglesIntersectOrTouch(selectionRectangle, bounds(item)))
      .map((item) => item.instanceId);
    const nextIds = activeMarquee.additive
      ? [...new Set([...activeMarquee.baseIds, ...areaIds])]
      : areaIds;

    setSelectedIds(nextIds);
    setPrimarySelectedId(areaIds.at(-1) ?? nextIds.at(-1) ?? null);
    postFeedback(
      areaIds.length > 0
        ? `${activeMarquee.additive ? 'Added' : 'Selected'} ${areaIds.length} item${areaIds.length === 1 ? '' : 's'} with area selection.`
        : activeMarquee.additive
          ? 'Area selection did not add any items.'
          : 'No items were inside the selection area.',
      areaIds.length > 0 ? 'success' : 'info',
    );
    clearMarquee();
    return true;
  };

  const finishDrag = () => {
    if (finishMarquee()) return;

    const activeDrag = dragRef.current;
    const candidates = dragCandidatesRef.current;
    if (!candidates) {
      clearDrag();
      return;
    }

    const rotatedDuringDrag = (activeDrag?.wheelTurns ?? 0) !== 0;
    const valid = areCandidatesValidAgainst(candidates, placed);
    if (valid) {
      setPlaced((current) => mergedLayout(current, candidates));
      postFeedback(
        rotatedDuringDrag
          ? `Completed drag placement with wheel rotation for ${candidates.length} item${candidates.length === 1 ? '' : 's'}.`
          : `Moved ${candidates.length} item${candidates.length === 1 ? '' : 's'}.`,
        'success',
      );
    } else {
      postFeedback(
        candidates.length > 1
          ? `Invalid group drop${rotatedDuringDrag ? ' after wheel rotation' : ''}. The selection returned to its previous position.`
          : `Invalid drop${rotatedDuringDrag ? ' after wheel rotation' : ''}. The item returned to its previous position.`,
        'error',
      );
    }
    clearDrag();
  };

  const cancelDrag = () => {
    clearMarquee();
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

  const contextMenuStyle = contextMenu ? {
    left: Math.max(8, Math.min(contextMenu.clientX, window.innerWidth - 238)),
    top: Math.max(8, Math.min(contextMenu.clientY, window.innerHeight - 284)),
  } as CSSProperties : undefined;

  const selectionColorControls = selectedItems.length > 0 ? (
    <fieldset className="color-controls">
      <legend>Structure color</legend>
      <div className="color-control-row">
        <label className="color-picker-control" title="Open the browser color picker">
          <span className="sr-only">Choose structure color</span>
          <input
            type="color"
            value={colorPickerValue}
            onChange={(event) => applyColorToSelection(event.target.value, {
              recordRecent: false,
              announce: false,
            })}
          />
        </label>
        <input
          className="color-code-input"
          value={colorInput}
          onChange={(event) => setColorInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              applyColorToSelection(colorInput);
            }
          }}
          placeholder={commonSelectionColor ? '#6c3e25 or rgb(108, 62, 37)' : 'Mixed colors — enter hex or RGB'}
          aria-label="Structure color as hex or RGB"
        />
        <button type="button" onClick={() => applyColorToSelection(colorInput)}>Apply</button>
        <button type="button" onClick={resetSelectionColor}>Reset</button>
      </div>
      {recentColors.length > 0 && (
        <div className="recent-colors">
          <div className="recent-colors-heading">
            <span>Recently used</span>
            <button type="button" className="recent-colors-clear" onClick={clearRecentColors}>Clear</button>
          </div>
          <div className="recent-color-swatches" role="list" aria-label="Recently used structure colors">
            {recentColors.map((color) => (
              <button
                type="button"
                className="recent-color-swatch"
                key={color}
                style={{ '--recent-color': color } as CSSProperties}
                title={`Apply ${color} to selection`}
                aria-label={`Apply recently used color ${color}`}
                onClick={() => applyColorToSelection(color)}
                role="listitem"
              >
                <span aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      )}
      <small>
        {commonSelectionColor
          ? `Current selection color: ${commonSelectionColor}.`
          : 'The selected structures currently use different colors.'}
        {' '}Use the color picker, hex, rgb(r, g, b), or r, g, b. Picker changes preview on the full selection; press Apply to commit the final color to Recently used.
      </small>
    </fieldset>
  ) : null;

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
                          {structureCostLabel(structure)}
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
          <button onClick={copyShareLink}>Copy share link</button>
          <button onClick={exportPng}>Export PNG</button>
          <button onClick={clearLayout}>Clear</button>
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

          <section
            className={`toolbar-cost ${budgetRemaining !== undefined && budgetRemaining < 0 ? 'over-budget' : ''}`}
            aria-label="Structure cost and optional budget"
          >
            <div className="toolbar-cost-total">
              <span>Structure cost</span>
              <strong>{totalCost.toLocaleString()} coins{unknownCostCount > 0 && ` + ${unknownCostCount} unknown`}</strong>
            </div>
            <label className="toolbar-budget-field">
              <span>Budget</span>
              <input
                type="text"
                inputMode="decimal"
                value={budgetInput}
                onChange={(event) => setBudgetInput(event.target.value)}
                placeholder="Optional: 250k"
                aria-label="Optional structure budget in coins"
              />
            </label>
            {budgetUsagePercent !== undefined && (
              <div
                className={`toolbar-budget-gauge ${budgetUsagePercent >= 100 ? 'over' : budgetUsagePercent >= 80 ? 'warning' : ''}`}
                style={{ '--budget-fill': `${Math.min(Math.max(budgetUsagePercent, 0), 100)}%` } as CSSProperties}
                aria-label={`${budgetUsagePercent}% of budget used`}
                title={`${totalCost.toLocaleString()} of ${validBudget?.toLocaleString() ?? 0} coins used`}
              >
                <span>{budgetUsagePercent > 999 ? '999+' : `${budgetUsagePercent}%`}</span>
              </div>
            )}
            <span className={`toolbar-budget-status ${budgetInput.trim() !== '' && validBudget === undefined ? 'error' : budgetRemaining !== undefined && budgetRemaining < 0 ? 'error' : validBudget !== undefined ? 'success' : 'muted'}`}>
              {budgetInput.trim() !== '' && validBudget === undefined
                ? 'Use values such as 1k, 1.5m, or 2b.'
                : validBudget !== undefined
                  ? budgetRemaining !== undefined && budgetRemaining < 0
                    ? `${Math.abs(budgetRemaining).toLocaleString()} over budget`
                    : `${(budgetRemaining ?? 0).toLocaleString()} remaining`
                  : 'No budget set'}
            </span>
            <button
              type="button"
              className="toolbar-experimental-budget"
              title={`${EXPERIMENTAL_MAX_DESCRIPTION} This is a highest-known planner result, not a proven in-game global maximum.`}
              onClick={() => {
                setBudgetInput(String(EXPERIMENTAL_MAX_BUDGET));
                postFeedback('Budget set to the experimental maximum reference.', 'info');
              }}
            >
              Experimental max: {EXPERIMENTAL_MAX_BUDGET.toLocaleString()}
            </button>
          </section>
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

        <div className="doorway-legend" aria-label="Doorway color legend and layout validation">
          <span><i className="legend-swatch open" /> Open doorway</span>
          <span><i className="legend-swatch connected" /> Connected</span>
          <span><i className="legend-swatch blocked" /> Faces wall</span>
          <span><strong>{connections.length}</strong> active connection{connections.length === 1 ? '' : 's'}</span>
          <div className={`layout-validation ${layoutIssues.length === 0 ? 'valid' : 'issues'}`} aria-live="polite">
            {layoutIssues.length === 0 ? (
              <span><strong>✓ Layout valid</strong></span>
            ) : (
              <details>
                <summary>⚠ {layoutIssues.length} issue{layoutIssues.length === 1 ? '' : 's'}</summary>
                <ul>
                  {layoutIssues.slice(0, 8).map((issue) => <li key={issue}>{issue}</li>)}
                  {layoutIssues.length > 8 && <li>…and {layoutIssues.length - 8} more.</li>}
                </ul>
              </details>
            )}
          </div>
        </div>

        <div className="canvas-layout">
          <div className="canvas-wrap">
            <svg
              ref={canvasRef}
              className="planner-canvas"
              width={GRID_WIDTH * CELL}
              height={CANVAS_HEIGHT_TILES * CELL}
              viewBox={`0 0 ${GRID_WIDTH * CELL} ${CANVAS_HEIGHT_TILES * CELL}`}
              onPointerMove={onPointerMove}
              onPointerUp={finishDrag}
              onPointerCancel={cancelDrag}
              onPointerDown={beginMarquee}
              onContextMenu={openCanvasContextMenu}
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
                    onContextMenu={(event) => openItemContextMenu(event, item.instanceId)}
                    onPointerDown={(event) => {
                      if (event.button !== 0) return;
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
                        wheelTurns: 0,
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
                    <polygon
                      points={points}
                      style={item.customColor ? {
                        fill: item.customColor,
                        fillOpacity: definition.category === 'room' ? 0.8 : 0.24,
                      } : undefined}
                    />
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

              {marqueeRectangle && isMeaningfulMarquee(marqueeRectangle) && (
                <rect
                  className="marquee-selection"
                  x={marqueeRectangle.x * CELL}
                  y={marqueeRectangle.y * CELL}
                  width={marqueeRectangle.width * CELL}
                  height={marqueeRectangle.height * CELL}
                  pointerEvents="none"
                />
              )}
            </svg>
          </div>

          <div className="workspace-side-stack">
            <section
              className={`feedback-card ${feedbackExpanded ? 'expanded' : 'collapsed'}`}
              aria-label="Planner feedback"
              aria-live="polite"
            >
              <div className="feedback-card-heading">
                <div className="feedback-heading-copy">
                  <h2>Planner feedback</h2>
                  {!feedbackExpanded && (
                    <p className={`feedback-summary ${dragValidity ?? feedbackMessages[0]?.kind ?? 'info'}`}>
                      {dragValidity === 'valid'
                        ? 'Current drag position is valid.'
                        : dragValidity === 'invalid'
                          ? 'Current drag position is invalid and will return on release.'
                          : feedbackMessages[0]?.text ?? 'No recent messages.'}
                    </p>
                  )}
                  {feedbackExpanded && <p>Placement, rotation, import, and validation messages appear here.</p>}
                </div>
                <div className="feedback-heading-actions">
                  {feedbackExpanded && (
                    <button
                      type="button"
                      className="feedback-clear"
                      onClick={() => setFeedbackMessages([])}
                      disabled={feedbackMessages.length === 0}
                    >
                      Clear
                    </button>
                  )}
                  <button
                    type="button"
                    className="feedback-toggle"
                    onClick={() => setFeedbackExpanded((current) => !current)}
                    aria-expanded={feedbackExpanded}
                  >
                    {feedbackExpanded ? 'Hide' : `Show${feedbackMessages.length > 0 ? ` (${feedbackMessages.length})` : ''}`}
                  </button>
                </div>
              </div>
              {feedbackExpanded && (
                <>
                  {dragValidity && (
                    <div className={`feedback-live ${dragValidity}`}>
                      {dragValidity === 'valid'
                        ? 'Current drag position is valid.'
                        : 'Current drag position is invalid and will return on release.'}
                    </div>
                  )}
                  {feedbackMessages.length > 0 ? (
                    <ol className="feedback-list">
                      {feedbackMessages.map((message) => (
                        <li className={`feedback-message ${message.kind}`} key={message.id}>
                          <span className="feedback-kind">{message.kind}</span>
                          <span>{message.text}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="feedback-empty">No recent messages.</p>
                  )}
                </>
              )}
            </section>

            <section className="selection-card" aria-label="Selected structures">
              <div className="selection-card-heading">
                <h2>Selection</h2>
                <button
                  type="button"
                  className="information-button"
                  onClick={() => setHelpOpen(true)}
                  aria-haspopup="dialog"
                  aria-label="Open planner information and controls"
                  title="Planner information and controls"
                >
                  ⓘ Information
                </button>
              </div>
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
                  {selectionColorControls}
                  <p>Type: {definition.category === 'room' ? 'Room' : 'Furniture piece'}</p>
                  <p>Requirement: {levelLabel(definition.level)}</p>
                  <p>Position: ({selected.x}, {selected.y})</p>
                  <p>Rotation: {selected.rotation}°</p>
                  <p>
                    Bounds: {rotatedSize(definition, selected.rotation).width}
                    {' × '}
                    {rotatedSize(definition, selected.rotation).height}
                  </p>
                  <p>Cost: {structureCostLabel(definition)}</p>
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
                {selectionColorControls}
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
                No structures selected. Select an item to edit it, or open <strong>ⓘ Information</strong> for controls and placement rules.
              </p>
            )}
            </section>
          </div>
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
            <li><span className="rule-badge observed">Observed</span><span>Every positive-length shared wall between two rooms needs an aligned doorway connection for that exact pair. A connected room may touch another room only at a corner; rooms that do not touch still need at least 2 empty tiles of separation.</span></li>
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
              <li>Path and portal level requirements are still unknown; the planner treats them as having no structure-placement cost.</li>
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
          Collision uses the complete recorded rectangular tile footprint. Irregular room outlines and curved-path artwork are approximate silhouettes and may differ from their menu thumbnails, but they still reserve the space required by the planner’s current placement model.
        </p>
      </aside>

      <button
        type="button"
        className="ambient-mark"
        onClick={tapAmbientMark}
        tabIndex={-1}
        aria-label="Decorative page mark"
      />

      {ambientOpen && (
        <div
          className="ambient-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setAmbientOpen(false);
          }}
          role="presentation"
        >
          <section
            className="ambient-card"
            role="dialog"
            aria-modal="true"
            aria-label="Message"
          >
            <button
              type="button"
              className="ambient-close"
              onClick={() => setAmbientOpen(false)}
              aria-label="Close"
            >
              ×
            </button>
            <div className="ambient-glyph" aria-hidden="true" />
            <p>{readAmbientCaption()}</p>
          </section>
        </div>
      )}

      {contextMenu && (
        <div
          className="planner-context-menu"
          style={contextMenuStyle}
          role="menu"
          aria-label="Planner actions"
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="context-menu-heading">
            {contextMenu.selectionIds.length > 0
              ? `${contextMenu.selectionIds.length} selected item${contextMenu.selectionIds.length === 1 ? '' : 's'}`
              : 'Canvas actions'}
          </div>
          <button
            type="button"
            role="menuitem"
            disabled={contextMenu.selectionIds.length === 0}
            onClick={() => {
              copySelection(contextMenu.selectionIds);
              setContextMenu(null);
            }}
          >
            <span>Copy</span><kbd>Ctrl/Cmd+C</kbd>
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={clipboardItems.length === 0}
            onClick={() => {
              pasteClipboard({ x: contextMenu.plotX, y: contextMenu.plotY });
              setContextMenu(null);
            }}
          >
            <span>Paste here</span><kbd>Ctrl/Cmd+V</kbd>
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={contextMenu.selectionIds.length === 0}
            onClick={() => {
              duplicateSelection(contextMenu.selectionIds);
              setContextMenu(null);
            }}
          >
            <span>Duplicate</span><kbd>Ctrl/Cmd+D</kbd>
          </button>
          <div className="context-menu-divider" role="separator" />
          <button
            type="button"
            role="menuitem"
            disabled={contextMenu.selectionIds.length === 0}
            onClick={() => {
              rotateSelected();
              setContextMenu(null);
            }}
          >
            <span>Rotate</span><kbd>R</kbd>
          </button>
          <button
            type="button"
            className="context-danger"
            role="menuitem"
            disabled={contextMenu.selectionIds.length === 0}
            onClick={() => {
              deleteItemsByIds(contextMenu.selectionIds);
              setContextMenu(null);
            }}
          >
            <span>Delete</span><kbd>Del</kbd>
          </button>
        </div>
      )}

      {helpOpen && (
        <div
          className="information-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setHelpOpen(false);
          }}
          role="presentation"
        >
          <section
            className="information-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="planner-information-title"
          >
            <header className="information-modal-header">
              <div>
                <h2 id="planner-information-title">Planner information</h2>
                <p>Controls, editing tools, and the placement rules currently enforced by the planner.</p>
              </div>
              <button
                type="button"
                className="information-modal-close"
                onClick={() => setHelpOpen(false)}
                aria-label="Close planner information"
              >
                ×
              </button>
            </header>

            <div className="information-modal-content">
              <section>
                <h3>Selecting and editing</h3>
                <ul>
                  <li>Click an item to inspect it, add a custom label, write notes, or change its color.</li>
                  <li>Drag across empty grid space to area-select structures.</li>
                  <li>Hold Ctrl, Command, or Shift while clicking or area-selecting to add or remove individual items from the group.</li>
                  <li>Right-click the canvas or selection to open planner actions.</li>
                </ul>
              </section>

              <section>
                <h3>Keyboard and clipboard</h3>
                <ul>
                  <li><kbd>Ctrl/Cmd+C</kbd> copies, <kbd>Ctrl/Cmd+V</kbd> pastes, and <kbd>Ctrl/Cmd+D</kbd> duplicates the planner selection.</li>
                  <li><kbd>R</kbd> smart-rotates; arrow keys nudge the selection one tile.</li>
                  <li><kbd>Delete</kbd> or <kbd>Backspace</kbd> removes the full selection.</li>
                </ul>
              </section>

              <section>
                <h3>Movement and rotation</h3>
                <ul>
                  <li>Drag selected items freely. The complete selection is validated when released.</li>
                  <li>While holding the selection with the left mouse button, scroll down to rotate clockwise or up to rotate counter-clockwise. Page scrolling is paused during this drag rotation.</li>
                  <li>An invalid drop returns every moved or wheel-rotated item to its previous position.</li>
                  <li>The <kbd>R</kbd> shortcut first tries the exact position, then smart-nudges the selection up to four tiles to the nearest valid final placement.</li>
                </ul>
              </section>

              <section>
                <h3>Room placement rules</h3>
                <ul>
                  <li>Every positive-length shared wall between rooms needs an aligned doorway for that exact room pair.</li>
                  <li>A connected room may touch another room at a single corner.</li>
                  <li>Non-touching rooms need at least two empty tiles of separation.</li>
                  <li>Paths and portals may overlap rooms, but they cannot overlap each other.</li>
                  <li>Irregular room drawings are approximate silhouettes and may not exactly match their menu thumbnails. They still reserve the complete recorded tile footprint, so the visual difference does not reduce placement or collision accuracy under the current rectangular model.</li>
                  <li>Plot-border restrictions and the special west-side vertical-hallway rule are always enforced.</li>
                  <li>The south entrance is marked at zero-based tiles 21–23.</li>
                </ul>
              </section>

              <section>
                <h3>Costs and saving</h3>
                <ul>
                  <li>Only room/structure placement costs count toward the cost card and optional budget.</li>
                  <li><strong>Copy share link</strong> compresses the current layout into the URL. It is free, requires no account or server, and does not overwrite the recipient’s browser save unless they choose Save locally.</li>
                  <li>Budget entries understand abbreviations such as <kbd>1k</kbd>, <kbd>1.5m</kbd>, and <kbd>2b</kbd>.</li>
                  <li>The experimental maximum is a highest-known layout under current planner assumptions, not a guaranteed in-game global maximum.</li>
                  <li>Paths, portals, labels, notes, colors, movement, and other planner actions add no cost.</li>
                  <li>Local saves, JSON export/import, and PNG export are available from the toolbar.</li>
                </ul>
              </section>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
