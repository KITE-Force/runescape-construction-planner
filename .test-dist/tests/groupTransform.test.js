import { rotateSelectionClockwise, selectionBounds, translateSelection } from '../src/groupTransform.js';
function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}
const square = {
    id: 'square',
    name: 'Square',
    category: 'room',
    width: 8,
    height: 8,
    shape: 'rectangle',
    doorways: [],
};
const hallway = {
    id: 'hallway',
    name: 'Hallway',
    category: 'room',
    width: 8,
    height: 4,
    shape: 'rectangle',
    doorways: [],
};
const definitions = new Map([[square.id, square], [hallway.id, hallway]]);
const group = [
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
console.log('Group selection transform tests passed.');
