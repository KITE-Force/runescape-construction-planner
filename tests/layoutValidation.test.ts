import { validateLayout } from '../src/layoutValidation.js';
import type { PlacedStructure } from '../src/types.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const valid: PlacedStructure[] = [
  { instanceId: 'a', structureId: 'square', x: 4, y: 4, rotation: 0 },
  { instanceId: 'b', structureId: 'square', x: 12, y: 4, rotation: 0 },
];
assert(validateLayout(valid, 99).length === 0, 'a connected two-room layout should be valid');

const lowLevel: PlacedStructure[] = [
  { instanceId: 'large', structureId: 'square-large', x: 4, y: 4, rotation: 0 },
];
assert(
  validateLayout(lowLevel, 20).some((issue) => issue.includes('requires Construction level 95')),
  'lowering Construction level should surface a requirement issue',
);

const badBorder: PlacedStructure[] = [
  { instanceId: 'edge', structureId: 'square', x: 0, y: 0, rotation: 0 },
];
assert(
  validateLayout(badBorder, 99).some((issue) => issue.includes('plot-edge rule')),
  'existing layouts outside the confirmed margins should be reported',
);

const overlap: PlacedStructure[] = [
  { instanceId: 'one', structureId: 'square', x: 4, y: 4, rotation: 0 },
  { instanceId: 'two', structureId: 'square', x: 6, y: 4, rotation: 0 },
];
assert(
  validateLayout(overlap, 99).some((issue) => issue.includes('overlaps')),
  'room overlap should be reported',
);

console.log('Whole-layout validation tests passed.');
