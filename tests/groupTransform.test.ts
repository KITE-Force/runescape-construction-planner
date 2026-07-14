import {
  findNearestValidSelectionPlacement,
  rotateSelectionClockwise,
  selectionBounds,
  translateSelection,
} from '../src/groupTransform.js';
import { structureById } from '../src/data/structures.js';
import { rectanglesOverlap, roomMeetsGlobalConnectionOrSpacingRule, rotatedSize } from '../src/geometry.js';
import type { PlacedStructure, StructureDefinition } from '../src/types.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const square: StructureDefinition = {
  id: 'square',
  name: 'Square',
  category: 'room',
  width: 8,
  height: 8,
  shape: 'rectangle',
  doorways: [],
};
const hallway: StructureDefinition = {
  id: 'hallway',
  name: 'Hallway',
  category: 'room',
  width: 8,
  height: 4,
  shape: 'rectangle',
  doorways: [],
};
const definitions = new Map([[square.id, square], [hallway.id, hallway]]);
const group: PlacedStructure[] = [
  { instanceId: 'a', structureId: 'square', x: 10, y: 10, rotation: 0 },
  { instanceId: 'b', structureId: 'hallway', x: 18, y: 12, rotation: 0 },
];

const moved = translateSelection(group, 3, -2);
assert(moved[0].x === 13 && moved[0].y === 8, 'group translation should move the first item');
assert(moved[1].x === 21 && moved[1].y === 10, 'group translation should preserve relative positions');
assert(group[0].x === 10, 'translation must not mutate the original items');

const originalBounds = selectionBounds(group, definitions);
assert(originalBounds?.width === 16 && originalBounds.height === 8, 'original group bounds should be measured');
const rotated = rotateSelectionClockwise(group, definitions);
const rotatedBounds = selectionBounds(rotated, definitions);
assert(rotatedBounds?.x === 10 && rotatedBounds.y === 10, 'rotation should anchor the group top-left');
assert(rotatedBounds?.width === 8 && rotatedBounds.height === 16, 'rotation should swap group width and height');
assert(rotated.every((item) => item.rotation === 90), 'every selected item should rotate');
assert(rotated.every((item) => Number.isInteger(item.x) && Number.isInteger(item.y)), 'group rotation should stay on integer tiles');


const reportedLargeSquare: PlacedStructure = {
  instanceId: 'large-square',
  structureId: 'square-large',
  x: 15,
  y: 4,
  rotation: 0,
};
const reportedCornerBeforeRotation: PlacedStructure = {
  instanceId: 'corner-room',
  structureId: 'corner',
  x: 7,
  y: 10,
  rotation: 90,
};
const reportedRotatedInPlace = rotateSelectionClockwise(
  [reportedCornerBeforeRotation],
  structureById,
);
assert(
  reportedRotatedInPlace[0].x === 7
    && reportedRotatedInPlace[0].y === 10
    && reportedRotatedInPlace[0].rotation === 180,
  'the basic rotation should first try the same stored origin',
);

const reportedPlacementIsValid = (items: PlacedStructure[]) => {
  const candidate = items[0];
  const candidateDefinition = structureById.get(candidate.structureId)!;
  const squareDefinition = structureById.get(reportedLargeSquare.structureId)!;
  const candidateSize = rotatedSize(candidateDefinition, candidate.rotation);
  const squareSize = rotatedSize(squareDefinition, reportedLargeSquare.rotation);
  const candidateBounds = { x: candidate.x, y: candidate.y, ...candidateSize };
  const squareBounds = {
    x: reportedLargeSquare.x,
    y: reportedLargeSquare.y,
    ...squareSize,
  };

  return !rectanglesOverlap(candidateBounds, squareBounds)
    && roomMeetsGlobalConnectionOrSpacingRule(
      candidate,
      [reportedLargeSquare],
      structureById,
    );
};

assert(
  !reportedPlacementIsValid(reportedRotatedInPlace),
  'rotating the reported corner while pinning its top-left origin should be invalid',
);

const smartRotatedPlacement = findNearestValidSelectionPlacement(
  reportedRotatedInPlace,
  reportedPlacementIsValid,
  4,
);
assert(smartRotatedPlacement !== null, 'smart rotation should find a nearby legal placement');
assert(
  smartRotatedPlacement.dx === 0
    && smartRotatedPlacement.dy === 2
    && smartRotatedPlacement.items[0].x === 7
    && smartRotatedPlacement.items[0].y === 12
    && smartRotatedPlacement.items[0].rotation === 180,
  'smart rotation should reproduce the valid exported corner placement by nudging it two tiles down',
);

console.log('Group selection transform tests passed.');
