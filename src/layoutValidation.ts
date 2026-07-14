import { GRID_HEIGHT, GRID_WIDTH, structureById } from './data/structures.js';
import { getFurnitureLimit, getRoomLimit } from './data/limits.js';
import {
  rectanglesOverlap,
  roomMeetsGlobalConnectionOrSpacingRule,
  rotatedSize,
} from './geometry.js';
import type { PlacedStructure, StructureDefinition } from './types.js';

const isHallwayFamily = (structureId: string) => structureId.startsWith('hallway');
const isVerticalRotation = (rotation: PlacedStructure['rotation']) => rotation === 90 || rotation === 270;

function placementMargins(item: PlacedStructure) {
  return {
    west: isHallwayFamily(item.structureId) && isVerticalRotation(item.rotation) ? 4 : 1,
    north: 2,
    east: 2,
    south: 1,
  };
}

function boundsFor(item: PlacedStructure, definition: StructureDefinition) {
  const size = rotatedSize(definition, item.rotation);
  return { x: item.x, y: item.y, ...size };
}

function canShareSpace(first: StructureDefinition, second: StructureDefinition) {
  return (first.category === 'room' && second.category !== 'room')
    || (second.category === 'room' && first.category !== 'room');
}

function itemLabel(item: PlacedStructure, definition?: StructureDefinition) {
  return item.customLabel?.trim()
    || definition?.name
    || item.structureId;
}

/**
 * Re-checks the complete saved layout against the planner's current rules.
 * This catches stale imports and layouts that become invalid after lowering
 * the selected Construction level.
 */
export function validateLayout(
  placed: PlacedStructure[],
  constructionLevel: number,
  definitions: ReadonlyMap<string, StructureDefinition> = structureById,
) {
  const issues: string[] = [];
  const seenIds = new Set<string>();

  for (const item of placed) {
    if (seenIds.has(item.instanceId)) {
      issues.push(`Duplicate structure ID found for ${itemLabel(item)}.`);
    }
    seenIds.add(item.instanceId);

    const definition = definitions.get(item.structureId);
    if (!definition) {
      issues.push(`Unknown structure type: ${item.structureId}.`);
      continue;
    }

    if (definition.level !== undefined && definition.level > constructionLevel) {
      issues.push(`${itemLabel(item, definition)} requires Construction level ${definition.level}.`);
    }

    const bounds = boundsFor(item, definition);
    const margins = placementMargins(item);
    if (
      bounds.x < margins.west
      || bounds.y < margins.north
      || bounds.x + bounds.width > GRID_WIDTH - margins.east
      || bounds.y + bounds.height > GRID_HEIGHT - margins.south
    ) {
      issues.push(`${itemLabel(item, definition)} at (${item.x}, ${item.y}) violates a plot-edge rule.`);
    }
  }

  const roomCount = placed.filter((item) => definitions.get(item.structureId)?.category === 'room').length;
  const furnitureCount = placed.filter((item) => {
    const category = definitions.get(item.structureId)?.category;
    return category === 'path' || category === 'portal';
  }).length;
  const roomLimit = getRoomLimit(constructionLevel);
  const furnitureLimit = getFurnitureLimit(constructionLevel);

  if (roomLimit !== undefined && roomCount > roomLimit) {
    issues.push(`Room limit exceeded: ${roomCount}/${roomLimit} at Construction level ${constructionLevel}.`);
  }
  if (furnitureLimit !== undefined && furnitureCount > furnitureLimit) {
    issues.push(`Furniture limit exceeded: ${furnitureCount}/${furnitureLimit} at Construction level ${constructionLevel}.`);
  }

  const roomIdsWithOverlap = new Set<string>();
  for (let firstIndex = 0; firstIndex < placed.length; firstIndex += 1) {
    const first = placed[firstIndex];
    const firstDefinition = definitions.get(first.structureId);
    if (!firstDefinition) continue;

    for (let secondIndex = firstIndex + 1; secondIndex < placed.length; secondIndex += 1) {
      const second = placed[secondIndex];
      const secondDefinition = definitions.get(second.structureId);
      if (!secondDefinition) continue;

      if (
        rectanglesOverlap(
          boundsFor(first, firstDefinition),
          boundsFor(second, secondDefinition),
        )
        && !canShareSpace(firstDefinition, secondDefinition)
      ) {
        issues.push(`${itemLabel(first, firstDefinition)} overlaps ${itemLabel(second, secondDefinition)}.`);
        if (firstDefinition.category === 'room') roomIdsWithOverlap.add(first.instanceId);
        if (secondDefinition.category === 'room') roomIdsWithOverlap.add(second.instanceId);
      }
    }
  }

  for (const item of placed) {
    const definition = definitions.get(item.structureId);
    if (!definition || definition.category !== 'room' || roomIdsWithOverlap.has(item.instanceId)) continue;

    if (!roomMeetsGlobalConnectionOrSpacingRule(
      item,
      placed.filter((other) => other.instanceId !== item.instanceId),
      definitions,
    )) {
      issues.push(`${itemLabel(item, definition)} has an invalid doorway contact or room spacing.`);
    }
  }

  return [...new Set(issues)];
}
