import {
  cloneSelectionForClipboard,
  createPastedSelection,
  offsetSelectionToAnchor,
  selectionTopLeft,
} from '../src/clipboard.js';
import type { PlacedStructure } from '../src/types.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const selection: PlacedStructure[] = [
  {
    instanceId: 'room-a',
    structureId: 'square',
    x: 10,
    y: 8,
    rotation: 90,
    customLabel: 'Prayer Room',
    notes: 'Keep altar here',
    customColor: '#4a90e2',
  },
  {
    instanceId: 'room-b',
    structureId: 'hallway',
    x: 18,
    y: 12,
    rotation: 0,
  },
];

const copied = cloneSelectionForClipboard(selection);
assert(copied !== selection, 'clipboard copy should create a new array');
assert(copied[0] !== selection[0], 'clipboard copy should clone item objects');
assert(copied[0].customLabel === 'Prayer Room', 'custom labels should be preserved');
assert(copied[0].notes === 'Keep altar here', 'notes should be preserved');
assert(copied[0].customColor === '#4a90e2', 'custom colors should be preserved');

const topLeft = selectionTopLeft(selection);
assert(topLeft?.x === 10 && topLeft.y === 8, 'selection top-left should use minimum coordinates');

const anchorOffset = offsetSelectionToAnchor(selection, 4, 6);
assert(anchorOffset.dx === -6 && anchorOffset.dy === -2, 'anchor offset should place the group top-left at the requested tile');

let id = 0;
const pasted = createPastedSelection(selection, 2, 3, () => `copy-${id += 1}`);
assert(pasted[0].instanceId === 'copy-1' && pasted[1].instanceId === 'copy-2', 'pasted items should receive new IDs');
assert(pasted[0].x === 12 && pasted[0].y === 11, 'paste offset should move the first item');
assert(pasted[1].x === 20 && pasted[1].y === 15, 'paste offset should preserve group spacing');
assert(pasted[0].rotation === 90, 'rotation should be preserved');
assert(pasted[0].customLabel === 'Prayer Room', 'metadata should be preserved when pasted');

console.log('Clipboard copy, anchor, and paste tests passed.');
