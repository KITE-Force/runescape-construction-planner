import { parseLayoutJson } from '../src/layoutFile.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectFailure(json: string, expectedText: string) {
  try {
    parseLayoutJson(json);
    throw new Error(`Expected import to fail with: ${expectedText}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(message.includes(expectedText), `Expected error containing "${expectedText}", received "${message}"`);
  }
}

const valid = parseLayoutJson(JSON.stringify({
  version: 1,
  name: 'Imported test',
  gridWidth: 48,
  gridHeight: 48,
  constructionLevel: 99,
  structures: [
    {
      instanceId: 'room-1',
      structureId: 'square',
      x: 4,
      y: 4,
      rotation: 0,
    },
  ],
}));

assert(valid.name === 'Imported test', 'layout name should be preserved');
assert(valid.constructionLevel === 99, 'Construction level should be preserved');
assert(valid.structures.length === 1, 'valid structure should be imported');

const legacyLevel = parseLayoutJson(JSON.stringify({
  version: 1,
  name: 'Legacy export',
  gridWidth: 48,
  gridHeight: 48,
  structures: [],
}));
assert(legacyLevel.constructionLevel === 99, 'missing Construction level should default to 99');

expectFailure('{broken json', 'not valid JSON');
expectFailure(JSON.stringify({
  version: 2,
  name: 'Future',
  gridWidth: 48,
  gridHeight: 48,
  structures: [],
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

console.log('Layout JSON import validation tests passed.');
