import type { PlacedStructure } from './types.js';

export interface ClipboardOffset {
  dx: number;
  dy: number;
}

export function cloneSelectionForClipboard(items: PlacedStructure[]): PlacedStructure[] {
  return items.map((item) => ({ ...item }));
}

export function selectionTopLeft(items: PlacedStructure[]) {
  if (items.length === 0) return null;
  return {
    x: Math.min(...items.map((item) => item.x)),
    y: Math.min(...items.map((item) => item.y)),
  };
}

export function offsetSelectionToAnchor(
  items: PlacedStructure[],
  anchorX: number,
  anchorY: number,
): ClipboardOffset {
  const topLeft = selectionTopLeft(items);
  if (!topLeft) return { dx: 0, dy: 0 };
  return {
    dx: Math.round(anchorX) - topLeft.x,
    dy: Math.round(anchorY) - topLeft.y,
  };
}

export function createPastedSelection(
  items: PlacedStructure[],
  dx: number,
  dy: number,
  makeId: () => string,
): PlacedStructure[] {
  return items.map((item) => ({
    ...item,
    instanceId: makeId(),
    x: item.x + dx,
    y: item.y + dy,
  }));
}
