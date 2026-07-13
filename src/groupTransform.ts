import { rotatedSize } from './geometry.js';
import type { PlacedStructure, StructureDefinition } from './types.js';

export interface SelectionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function selectionBounds(
  items: PlacedStructure[],
  definitions: ReadonlyMap<string, StructureDefinition>,
): SelectionBounds | null {
  if (items.length === 0) return null;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const item of items) {
    const definition = definitions.get(item.structureId);
    if (!definition) continue;
    const size = rotatedSize(definition, item.rotation);
    minX = Math.min(minX, item.x);
    minY = Math.min(minY, item.y);
    maxX = Math.max(maxX, item.x + size.width);
    maxY = Math.max(maxY, item.y + size.height);
  }

  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function translateSelection(
  items: PlacedStructure[],
  dx: number,
  dy: number,
): PlacedStructure[] {
  return items.map((item) => ({ ...item, x: item.x + dx, y: item.y + dy }));
}

/**
 * Rotates the complete selection 90 degrees clockwise while anchoring the
 * resulting group's top-left corner to the previous group's top-left corner.
 * All positions remain integer tile coordinates.
 */
export function rotateSelectionClockwise(
  items: PlacedStructure[],
  definitions: ReadonlyMap<string, StructureDefinition>,
): PlacedStructure[] {
  const group = selectionBounds(items, definitions);
  if (!group) return items;

  return items.map((item) => {
    const definition = definitions.get(item.structureId);
    if (!definition) return item;

    const size = rotatedSize(definition, item.rotation);
    const relativeX = item.x - group.x;
    const relativeY = item.y - group.y;

    return {
      ...item,
      x: group.x + group.height - relativeY - size.height,
      y: group.y + relativeX,
      rotation: ((item.rotation + 90) % 360) as PlacedStructure['rotation'],
    };
  });
}
