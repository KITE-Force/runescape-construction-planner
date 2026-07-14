import type {
  DoorwayConnection,
  DoorwayDefinition,
  DoorwaySide,
  PlacedStructure,
  Point,
  Rotation,
  ShapeId,
  StructureDefinition,
  TransformedDoorway,
  WorldDoorway,
} from './types.js';

const EPSILON = 0.001;

export function rotatedSize(definition: StructureDefinition, rotation: Rotation) {
  return rotation === 90 || rotation === 270
    ? { width: definition.height, height: definition.width }
    : { width: definition.width, height: definition.height };
}

export function shapePoints(shape: ShapeId, width: number, height: number): Point[] {
  switch (shape) {
    case 'cross':
      return [
        { x: 2, y: 0 }, { x: width - 2, y: 0 }, { x: width - 2, y: 2 },
        { x: width, y: 2 }, { x: width, y: height - 2 }, { x: width - 2, y: height - 2 },
        { x: width - 2, y: height }, { x: 2, y: height }, { x: 2, y: height - 2 },
        { x: 0, y: height - 2 }, { x: 0, y: 2 }, { x: 2, y: 2 },
      ];
    case 'corner':
      return [
        { x: 0, y: 0 }, { x: width / 2, y: 0 }, { x: width / 2, y: height / 2 },
        { x: width, y: height / 2 }, { x: width, y: height }, { x: 0, y: height },
      ];
    case 't-shape':
      return [
        { x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height / 2 },
        { x: width * 0.75, y: height / 2 }, { x: width * 0.75, y: height },
        { x: width * 0.25, y: height }, { x: width * 0.25, y: height / 2 },
        { x: 0, y: height / 2 },
      ];
    case 'octagon':
      return [
        { x: 1, y: 0 }, { x: width - 1, y: 0 }, { x: width, y: 1 },
        { x: width, y: height - 1 }, { x: width - 1, y: height },
        { x: 1, y: height }, { x: 0, y: height - 1 }, { x: 0, y: 1 },
      ];
    case 'end-rounded':
      return [
        { x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height / 2 },
        { x: width * 0.75, y: height * 0.75 }, { x: width * 0.625, y: height },
        { x: width * 0.375, y: height }, { x: width * 0.25, y: height * 0.75 },
        { x: 0, y: height / 2 },
      ];
    case 'corner-rounded':
      return [
        { x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height },
        { x: width * 0.375, y: height }, { x: 0, y: height * 0.625 },
      ];
    default:
      return [
        { x: 0, y: 0 }, { x: width, y: 0 },
        { x: width, y: height }, { x: 0, y: height },
      ];
  }
}

export function rotatePoint(point: Point, width: number, height: number, rotation: Rotation): Point {
  switch (rotation) {
    case 90:
      return { x: height - point.y, y: point.x };
    case 180:
      return { x: width - point.x, y: height - point.y };
    case 270:
      return { x: point.y, y: width - point.x };
    default:
      return point;
  }
}

export function pointsFor(definition: StructureDefinition, rotation: Rotation): Point[] {
  const points = shapePoints(definition.shape, definition.width, definition.height);
  return points.map((point) => rotatePoint(point, definition.width, definition.height, rotation));
}

export function rectanglesOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

export function rectangleGaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  return {
    x: Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width), 0),
    y: Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height), 0),
  };
}

/**
 * RuneScape placement rule: two rooms may touch only when an aligned pair of
 * opposing doorways connects them. Otherwise, their bounding boxes must have
 * at least `minimumGap` empty tiles of separation on either axis.
 */
export function roomsMeetConnectionOrSpacingRule(
  first: PlacedStructure,
  second: PlacedStructure,
  definitions: ReadonlyMap<string, StructureDefinition>,
  minimumGap = 2,
) {
  const firstDefinition = definitions.get(first.structureId);
  const secondDefinition = definitions.get(second.structureId);
  if (!firstDefinition || !secondDefinition) return false;

  // The in-game message specifically describes a room-to-room rule. Paths are
  // landscaping pieces: they still cannot overlap other items, but they may
  // touch rooms or other paths without requiring a doorway or two-tile gap.
  if (firstDefinition.category !== 'room' || secondDefinition.category !== 'room') return true;

  const firstSize = rotatedSize(firstDefinition, first.rotation);
  const secondSize = rotatedSize(secondDefinition, second.rotation);
  const firstBounds = { x: first.x, y: first.y, ...firstSize };
  const secondBounds = { x: second.x, y: second.y, ...secondSize };

  if (rectanglesOverlap(firstBounds, secondBounds)) return false;
  if (findDoorwayConnections([first, second], definitions).length > 0) return true;

  const gaps = rectangleGaps(firstBounds, secondBounds);
  return gaps.x >= minimumGap || gaps.y >= minimumGap;
}


/** Returns the length of the positive-length wall segment shared by two bounds. */
export function sharedWallLength(
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number },
) {
  const firstRight = first.x + first.width;
  const secondRight = second.x + second.width;
  const firstBottom = first.y + first.height;
  const secondBottom = second.y + second.height;
  let sharedLength = 0;

  if (approximatelyEqual(firstRight, second.x) || approximatelyEqual(secondRight, first.x)) {
    sharedLength = Math.max(
      sharedLength,
      Math.min(firstBottom, secondBottom) - Math.max(first.y, second.y),
    );
  }

  if (approximatelyEqual(firstBottom, second.y) || approximatelyEqual(secondBottom, first.y)) {
    sharedLength = Math.max(
      sharedLength,
      Math.min(firstRight, secondRight) - Math.max(first.x, second.x),
    );
  }

  return Math.max(0, sharedLength);
}

/**
 * RuneScape room placement combines per-contact and whole-room rules:
 *
 * - Every positive-length shared wall with another room needs an aligned
 *   doorway connection for that room pair.
 * - A corner-only contact is allowed when the candidate connects to at least
 *   one room elsewhere.
 * - Rooms that do not touch still need at least `minimumGap` empty tiles of
 *   separation, even when the candidate connects somewhere else.
 * - A completely isolated candidate is valid when it has the required spacing
 *   from every room.
 *
 * Overlap is also checked here defensively, although the caller performs the
 * category-aware overlap validation for rooms, paths, and furniture.
 */
export function roomMeetsGlobalConnectionOrSpacingRule(
  candidate: PlacedStructure,
  placed: PlacedStructure[],
  definitions: ReadonlyMap<string, StructureDefinition>,
  minimumGap = 2,
) {
  const candidateDefinition = definitions.get(candidate.structureId);
  if (!candidateDefinition) return false;
  if (candidateDefinition.category !== 'room') return true;

  const otherRooms = placed.filter((other) => (
    other.instanceId !== candidate.instanceId
    && definitions.get(other.structureId)?.category === 'room'
  ));

  if (otherRooms.length === 0) return true;

  const candidateConnections = findDoorwayConnections(
    [candidate, ...otherRooms],
    definitions,
  ).filter((connection) => (
    connection.first.instanceId === candidate.instanceId
    || connection.second.instanceId === candidate.instanceId
  ));

  const connectedRoomIds = new Set(candidateConnections.map((connection) => (
    connection.first.instanceId === candidate.instanceId
      ? connection.second.instanceId
      : connection.first.instanceId
  )));
  const candidateHasConnection = connectedRoomIds.size > 0;

  const candidateSize = rotatedSize(candidateDefinition, candidate.rotation);
  const candidateBounds = { x: candidate.x, y: candidate.y, ...candidateSize };

  return otherRooms.every((other) => {
    const otherDefinition = definitions.get(other.structureId)!;
    const otherSize = rotatedSize(otherDefinition, other.rotation);
    const otherBounds = { x: other.x, y: other.y, ...otherSize };

    if (rectanglesOverlap(candidateBounds, otherBounds)) return false;

    const wallLength = sharedWallLength(candidateBounds, otherBounds);
    if (wallLength > EPSILON) {
      return connectedRoomIds.has(other.instanceId);
    }

    const gaps = rectangleGaps(candidateBounds, otherBounds);
    const cornerOnlyContact = gaps.x <= EPSILON && gaps.y <= EPSILON;
    if (cornerOnlyContact) return candidateHasConnection;

    return gaps.x >= minimumGap || gaps.y >= minimumGap;
  });
}

function doorwayPoint(doorway: DoorwayDefinition, width: number, height: number): Point {
  switch (doorway.side) {
    case 'north': return { x: doorway.offset, y: 0 };
    case 'east': return { x: width, y: doorway.offset };
    case 'south': return { x: doorway.offset, y: height };
    case 'west': return { x: 0, y: doorway.offset };
  }
}

function rotateSide(side: DoorwaySide, rotation: Rotation): DoorwaySide {
  const sides: DoorwaySide[] = ['north', 'east', 'south', 'west'];
  const quarterTurns = rotation / 90;
  return sides[(sides.indexOf(side) + quarterTurns) % sides.length];
}

/** Rotates a local doorway without mutating the structure definition. */
export function transformDoorway(
  doorway: DoorwayDefinition,
  structureWidth: number,
  structureHeight: number,
  rotation: Rotation,
): TransformedDoorway {
  const point = rotatePoint(doorwayPoint(doorway, structureWidth, structureHeight), structureWidth, structureHeight, rotation);
  const side = rotateSide(doorway.side, rotation);
  const structureSize = rotation === 90 || rotation === 270
    ? { width: structureHeight, height: structureWidth }
    : { width: structureWidth, height: structureHeight };

  return {
    side,
    offset: side === 'north' || side === 'south' ? point.x : point.y,
    width: doorway.width,
    structureWidth: structureSize.width,
    structureHeight: structureSize.height,
  };
}

export function doorwayKey(instanceId: string, doorwayIndex: number) {
  return `${instanceId}:${doorwayIndex}`;
}

export function worldDoorways(item: PlacedStructure, definition: StructureDefinition): WorldDoorway[] {
  return definition.doorways.map((doorway, doorwayIndex) => {
    const transformed = transformDoorway(doorway, definition.width, definition.height, item.rotation);
    const horizontal = transformed.side === 'north' || transformed.side === 'south';
    const line = horizontal
      ? item.y + (transformed.side === 'south' ? transformed.structureHeight : 0)
      : item.x + (transformed.side === 'east' ? transformed.structureWidth : 0);
    const spanCenter = horizontal ? item.x + transformed.offset : item.y + transformed.offset;

    return {
      ...transformed,
      key: doorwayKey(item.instanceId, doorwayIndex),
      instanceId: item.instanceId,
      doorwayIndex,
      line,
      spanStart: spanCenter - transformed.width / 2,
      spanEnd: spanCenter + transformed.width / 2,
    };
  });
}

function oppositeSide(side: DoorwaySide): DoorwaySide {
  switch (side) {
    case 'north': return 'south';
    case 'east': return 'west';
    case 'south': return 'north';
    case 'west': return 'east';
  }
}

function approximatelyEqual(a: number, b: number) {
  return Math.abs(a - b) <= EPSILON;
}

export function findDoorwayConnections(
  placed: PlacedStructure[],
  definitions: ReadonlyMap<string, StructureDefinition>,
): DoorwayConnection[] {
  const doorways = placed.flatMap((item) => {
    const definition = definitions.get(item.structureId);
    return definition ? worldDoorways(item, definition) : [];
  });
  const connections: DoorwayConnection[] = [];

  for (let firstIndex = 0; firstIndex < doorways.length; firstIndex += 1) {
    const first = doorways[firstIndex];
    for (let secondIndex = firstIndex + 1; secondIndex < doorways.length; secondIndex += 1) {
      const second = doorways[secondIndex];
      if (first.instanceId === second.instanceId) continue;
      if (oppositeSide(first.side) !== second.side) continue;
      if (!approximatelyEqual(first.line, second.line)) continue;
      if (!approximatelyEqual(first.spanStart, second.spanStart)) continue;
      if (!approximatelyEqual(first.spanEnd, second.spanEnd)) continue;
      connections.push({ first, second });
    }
  }

  return connections;
}

function spansOverlap(firstStart: number, firstEnd: number, secondStart: number, secondEnd: number) {
  return Math.min(firstEnd, secondEnd) - Math.max(firstStart, secondStart) > EPSILON;
}

/**
 * Finds doorways that point directly into another structure wall but do not have
 * an aligned, opposing doorway. This is advisory only and does not affect placement.
 */
export function findBlockedDoorwayKeys(
  placed: PlacedStructure[],
  definitions: ReadonlyMap<string, StructureDefinition>,
  connectedKeys: ReadonlySet<string>,
): Set<string> {
  const blocked = new Set<string>();
  const boundsByInstance = new Map(placed.map((item) => {
    const definition = definitions.get(item.structureId)!;
    const size = rotatedSize(definition, item.rotation);
    return [item.instanceId, { x: item.x, y: item.y, width: size.width, height: size.height }];
  }));

  for (const item of placed) {
    const definition = definitions.get(item.structureId);
    if (!definition) continue;

    for (const doorway of worldDoorways(item, definition)) {
      if (connectedKeys.has(doorway.key)) continue;

      const hitsWall = placed.some((other) => {
        if (other.instanceId === item.instanceId) return false;
        const bounds = boundsByInstance.get(other.instanceId)!;

        switch (doorway.side) {
          case 'north':
            return approximatelyEqual(doorway.line, bounds.y + bounds.height)
              && spansOverlap(doorway.spanStart, doorway.spanEnd, bounds.x, bounds.x + bounds.width);
          case 'south':
            return approximatelyEqual(doorway.line, bounds.y)
              && spansOverlap(doorway.spanStart, doorway.spanEnd, bounds.x, bounds.x + bounds.width);
          case 'west':
            return approximatelyEqual(doorway.line, bounds.x + bounds.width)
              && spansOverlap(doorway.spanStart, doorway.spanEnd, bounds.y, bounds.y + bounds.height);
          case 'east':
            return approximatelyEqual(doorway.line, bounds.x)
              && spansOverlap(doorway.spanStart, doorway.spanEnd, bounds.y, bounds.y + bounds.height);
        }
      });

      if (hitsWall) blocked.add(doorway.key);
    }
  }

  return blocked;
}

export function doorwayRect(
  item: PlacedStructure,
  doorway: TransformedDoorway,
  thickness = 0.55,
) {
  const halfThickness = thickness / 2;
  const halfWidth = doorway.width / 2;

  switch (doorway.side) {
    case 'north':
      return { x: item.x + doorway.offset - halfWidth, y: item.y - halfThickness, width: doorway.width, height: thickness };
    case 'east':
      return { x: item.x + doorway.structureWidth - halfThickness, y: item.y + doorway.offset - halfWidth, width: thickness, height: doorway.width };
    case 'south':
      return { x: item.x + doorway.offset - halfWidth, y: item.y + doorway.structureHeight - halfThickness, width: doorway.width, height: thickness };
    case 'west':
      return { x: item.x - halfThickness, y: item.y + doorway.offset - halfWidth, width: thickness, height: doorway.width };
  }
}
