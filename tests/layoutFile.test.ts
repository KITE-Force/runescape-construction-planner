import { parseLayoutJson } from '../src/layoutFile.js';
import { normalizeColorInput } from '../src/color.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectFailure(json: string, expectedText: string) {
  let failed = false;
  try {
    parseLayoutJson(json);
  } catch (error) {
    failed = true;
    const message = error instanceof Error ? error.message : String(error);
    assert(message.includes(expectedText), `Expected error containing "${expectedText}", received "${message}"`);
  }
  assert(failed, `Expected import to fail with: ${expectedText}`);
}

const migratedV1 = parseLayoutJson(JSON.stringify({
  version: 1,
  name: 'Imported test',
  gridWidth: 48,
  gridHeight: 48,
  constructionLevel: 99,
  budget: 750000,
  structures: [
    {
      instanceId: 'room-1',
      structureId: 'square',
      x: 4,
      y: 4,
      rotation: 0,
      customLabel: 'Prayer Room',
      notes: 'Add an altar here.',
      customColor: 'rgb(74, 144, 226)',
    },
  ],
}));

assert(migratedV1.version === 2, 'version 1 layouts should migrate to version 2');
assert(migratedV1.zones.length === 0, 'version 1 layouts should migrate with an empty zones list');
assert(migratedV1.name === 'Imported test', 'layout name should be preserved');
assert(migratedV1.constructionLevel === 99, 'Construction level should be preserved');
assert(migratedV1.budget === 750000, 'optional budget should be preserved');
assert(migratedV1.structures.length === 1, 'valid structure should be imported');
assert(migratedV1.structures[0].customLabel === 'Prayer Room', 'custom label should be preserved');
assert(migratedV1.structures[0].notes === 'Add an altar here.', 'notes should be preserved');
assert(migratedV1.structures[0].customColor === '#4a90e2', 'custom color should be normalized and preserved');

const zonedV2 = parseLayoutJson(JSON.stringify({
  version: 2,
  name: 'Zoned layout',
  gridWidth: 48,
  gridHeight: 48,
  structures: [],
  zones: [
    {
      zoneId: 'garden-zone',
      x: 10,
      y: 12,
      width: 14,
      height: 9,
      label: 'Courtyard Garden',
      color: 'rgb(74, 128, 99)',
    },
  ],
}));
assert(zonedV2.zones.length === 1, 'version 2 zones should be imported');
assert(zonedV2.zones[0].label === 'Courtyard Garden', 'zone label should be preserved');
assert(zonedV2.zones[0].color === '#4a8063', 'zone color should be normalized');

assert(normalizeColorInput('#abc') === '#aabbcc', 'three-digit hex should expand');
assert(normalizeColorInput('255, 0, 128') === '#ff0080', 'comma-separated RGB should normalize');
assert(normalizeColorInput('rgb(12, 34, 56)') === '#0c2238', 'rgb() should normalize');
assert(normalizeColorInput('rgb(300, 0, 0)') === null, 'out-of-range RGB should be rejected');

const legacyDefaults = parseLayoutJson(JSON.stringify({
  version: 1,
  name: 'Legacy export',
  gridWidth: 48,
  gridHeight: 48,
  structures: [],
}));
assert(legacyDefaults.constructionLevel === 99, 'missing Construction level should default to 99');
assert(legacyDefaults.budget === undefined, 'missing budget should remain optional');

expectFailure(JSON.stringify({
  version: 1,
  name: 'Bad metadata',
  gridWidth: 48,
  gridHeight: 48,
  structures: [{ instanceId: 'x', structureId: 'square', x: 4, y: 4, rotation: 0, notes: 7 }],
}), 'notes must be a string');

expectFailure(JSON.stringify({
  version: 1,
  name: 'Bad color',
  gridWidth: 48,
  gridHeight: 48,
  structures: [{ instanceId: 'x', structureId: 'square', x: 4, y: 4, rotation: 0, customColor: 'not-a-color' }],
}), 'customColor must be a valid hex or RGB color');

expectFailure(JSON.stringify({
  version: 2,
  name: 'Bad zone bounds',
  gridWidth: 48,
  gridHeight: 48,
  structures: [],
  zones: [{ zoneId: 'z', x: 45, y: 45, width: 8, height: 8, label: 'Bad', color: '#ffffff' }],
}), 'must stay within');

expectFailure(JSON.stringify({
  version: 2,
  name: 'Bad zone color',
  gridWidth: 48,
  gridHeight: 48,
  structures: [],
  zones: [{ zoneId: 'z', x: 4, y: 4, width: 8, height: 8, label: 'Bad', color: 'nope' }],
}), 'color must be a valid hex or RGB color');

expectFailure(JSON.stringify({
  version: 2,
  name: 'Duplicate zone IDs',
  gridWidth: 48,
  gridHeight: 48,
  structures: [],
  zones: [
    { zoneId: 'same', x: 4, y: 4, width: 4, height: 4, label: 'A', color: '#ffffff' },
    { zoneId: 'same', x: 10, y: 10, width: 4, height: 4, label: 'B', color: '#ffffff' },
  ],
}), 'Duplicate zone zoneId');

expectFailure(JSON.stringify({
  version: 1,
  name: 'Bad budget',
  gridWidth: 48,
  gridHeight: 48,
  budget: -1,
  structures: [],
}), 'Budget must be zero or greater');

expectFailure(JSON.stringify({
  version: 1,
  name: 'Decimal budget',
  gridWidth: 48,
  gridHeight: 48,
  budget: 12.5,
  structures: [],
}), 'Budget must be an integer');

expectFailure('{broken json', 'not valid JSON');
expectFailure(JSON.stringify({
  version: 3,
  name: 'Future',
  gridWidth: 48,
  gridHeight: 48,
  structures: [],
  zones: [],
}), 'Unsupported layout version');
expectFailure(JSON.stringify({
  version: 1,
  name: 'Unknown item',
  gridWidth: 48,
  gridHeight: 48,
  structures: [{ instanceId: 'x', structureId: 'unknown', x: 0, y: 0, rotation: 0 }],
}), 'unknown structureId');
expectFailure(JSON.stringify({
  version: 1,
  name: 'Duplicate IDs',
  gridWidth: 48,
  gridHeight: 48,
  structures: [
    { instanceId: 'same', structureId: 'square', x: 4, y: 4, rotation: 0 },
    { instanceId: 'same', structureId: 'square', x: 14, y: 4, rotation: 0 },
  ],
}), 'Duplicate structure instanceId');

console.log('Layout JSON migration, zoning, and import validation tests passed.');
