import {
  EXPERIMENTAL_MAX_BUDGET,
  compactCoinAmount,
  parseCoinAmount,
} from '../src/budget.js';
import { structureById } from '../src/data/structures.js';
import { validateLayout } from '../src/layoutValidation.js';
import type { PlacedStructure } from '../src/types.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(parseCoinAmount('') === undefined, 'empty budget should stay optional');
assert(parseCoinAmount('1k') === 1_000, '1k should parse as 1,000');
assert(parseCoinAmount('1.5m') === 1_500_000, 'decimal million suffix should parse');
assert(parseCoinAmount('2B') === 2_000_000_000, 'suffix parsing should be case-insensitive');
assert(parseCoinAmount('1,250,000') === 1_250_000, 'comma-separated coins should parse');
assert(parseCoinAmount('$750k') === 750_000, 'leading currency symbol should be accepted');
assert(parseCoinAmount('1.25k') === 1_250, 'fractional suffixes that resolve to whole coins should parse');
assert(parseCoinAmount('1.2345k') === undefined, 'fractional coin results should be rejected');
assert(parseCoinAmount('ten million') === undefined, 'invalid text should be rejected');
assert(compactCoinAmount(1_000) === '1k', 'compact thousands should format');
assert(compactCoinAmount(2_000_000) === '2m', 'compact millions should format');
assert(EXPERIMENTAL_MAX_BUDGET === 3_750_000, 'experimental reference should remain explicit');

const experimentalLayout: PlacedStructure[] = [];
for (let row = 0; row < 5; row += 1) {
  for (let column = 0; column < 5; column += 1) {
    experimentalLayout.push({
      instanceId: `experimental-${row}-${column}`,
      structureId: 'octagon',
      x: 1 + column * 8,
      y: 2 + row * 8,
      rotation: 0,
    });
  }
}
assert(validateLayout(experimentalLayout, 120).length === 0, 'the experimental 25-Octagon layout should satisfy current planner validation');
const experimentalCost = experimentalLayout.reduce((total, item) => (
  total + (structureById.get(item.structureId)?.cost ?? 0)
), 0);
assert(experimentalCost === EXPERIMENTAL_MAX_BUDGET, 'the experimental layout should match the displayed reference');

console.log('Budget shorthand and experimental maximum tests passed.');
