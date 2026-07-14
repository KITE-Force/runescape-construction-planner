import { parseLayoutJson } from '../src/layoutFile.js';
import { normalizeColorInput } from '../src/color.js';
function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}
function expectFailure(json, expectedText) {
    try {
        parseLayoutJson(json);
        throw new Error(`Expected import to fail with: ${expectedText}`);
    }
    catch (error) {
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
            customLabel: 'Prayer Room',
            notes: 'Add an altar here.',
            customColor: 'rgb(74, 144, 226)',
        },
    ],
}));
assert(valid.name === 'Imported test', 'layout name should be preserved');
assert(valid.constructionLevel === 99, 'Construction level should be preserved');
assert(valid.structures.length === 1, 'valid structure should be imported');
assert(valid.structures[0].customLabel === 'Prayer Room', 'custom label should be preserved');
assert(valid.structures[0].notes === 'Add an altar here.', 'notes should be preserved');
assert(valid.structures[0].customColor === '#4a90e2', 'custom color should be normalized and preserved');
assert(normalizeColorInput('#abc') === '#aabbcc', 'three-digit hex should expand');
assert(normalizeColorInput('255, 0, 128') === '#ff0080', 'comma-separated RGB should normalize');
assert(normalizeColorInput('rgb(12, 34, 56)') === '#0c2238', 'rgb() should normalize');
assert(normalizeColorInput('rgb(300, 0, 0)') === null, 'out-of-range RGB should be rejected');
const legacyLevel = parseLayoutJson(JSON.stringify({
    version: 1,
    name: 'Legacy export',
    gridWidth: 48,
    gridHeight: 48,
    structures: [],
}));
assert(legacyLevel.constructionLevel === 99, 'missing Construction level should default to 99');
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
