import { rotatedSize } from './geometry.js';
export function selectionBounds(items, definitions) {
    if (items.length === 0)
        return null;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const item of items) {
        const definition = definitions.get(item.structureId);
        if (!definition)
            continue;
        const size = rotatedSize(definition, item.rotation);
        minX = Math.min(minX, item.x);
        minY = Math.min(minY, item.y);
        maxX = Math.max(maxX, item.x + size.width);
        maxY = Math.max(maxY, item.y + size.height);
    }
    if (!Number.isFinite(minX))
        return null;
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
export function translateSelection(items, dx, dy) {
    return items.map((item) => ({ ...item, x: item.x + dx, y: item.y + dy }));
}
/**
 * Rotates the complete selection 90 degrees clockwise while anchoring the
 * resulting group's top-left corner to the previous group's top-left corner.
 * All positions remain integer tile coordinates.
 */
export function rotateSelectionClockwise(items, definitions) {
    const group = selectionBounds(items, definitions);
    if (!group)
        return items;
    return items.map((item) => {
        const definition = definitions.get(item.structureId);
        if (!definition)
            return item;
        const size = rotatedSize(definition, item.rotation);
        const relativeX = item.x - group.x;
        const relativeY = item.y - group.y;
        return {
            ...item,
            x: group.x + group.height - relativeY - size.height,
            y: group.y + relativeX,
            rotation: ((item.rotation + 90) % 360),
        };
    });
}
/**
 * Rotates the complete selection 90 degrees counter-clockwise while keeping
 * the resulting group's top-left corner anchored to the previous top-left.
 */
export function rotateSelectionCounterClockwise(items, definitions) {
    const group = selectionBounds(items, definitions);
    if (!group)
        return items;
    return items.map((item) => {
        const definition = definitions.get(item.structureId);
        if (!definition)
            return item;
        const size = rotatedSize(definition, item.rotation);
        const relativeX = item.x - group.x;
        const relativeY = item.y - group.y;
        return {
            ...item,
            x: group.x + relativeY,
            y: group.y + group.width - relativeX - size.width,
            rotation: ((item.rotation + 270) % 360),
        };
    });
}
function nudgeDirectionPriority(dx, dy) {
    // Clockwise rotations in the game commonly shift an irregular room's
    // placement origin down or right. Prefer those directions when two equally
    // small valid nudges exist, while keeping the result deterministic.
    if (dx === 0 && dy > 0)
        return 0;
    if (dx > 0 && dy === 0)
        return 1;
    if (dx === 0 && dy < 0)
        return 2;
    if (dx < 0 && dy === 0)
        return 3;
    if (dx > 0 && dy > 0)
        return 4;
    if (dx > 0 && dy < 0)
        return 5;
    if (dx < 0 && dy < 0)
        return 6;
    return 7;
}
/**
 * Finds the nearest valid translated position for an already-transformed
 * selection. The exact transformed position is tried first. If it is invalid,
 * integer-tile translations are searched by increasing Manhattan distance.
 *
 * This mirrors the game's effective rotation behaviour for irregular rooms:
 * rotating can change the internal placement origin, so a visually natural
 * rotation may need a small automatic tile adjustment to preserve a legal
 * doorway alignment.
 */
export function findNearestValidSelectionPlacement(transformedItems, isValid, maximumNudge = 4) {
    if (transformedItems.length === 0)
        return null;
    if (isValid(transformedItems)) {
        return { items: transformedItems, dx: 0, dy: 0 };
    }
    for (let distance = 1; distance <= maximumNudge; distance += 1) {
        const offsets = [];
        for (let dy = -distance; dy <= distance; dy += 1) {
            const remainingX = distance - Math.abs(dy);
            if (remainingX === 0) {
                offsets.push({ dx: 0, dy });
            }
            else {
                offsets.push({ dx: remainingX, dy }, { dx: -remainingX, dy });
            }
        }
        offsets.sort((first, second) => {
            const priorityDifference = nudgeDirectionPriority(first.dx, first.dy)
                - nudgeDirectionPriority(second.dx, second.dy);
            if (priorityDifference !== 0)
                return priorityDifference;
            if (Math.abs(first.dy) !== Math.abs(second.dy)) {
                return Math.abs(second.dy) - Math.abs(first.dy);
            }
            return Math.abs(second.dx) - Math.abs(first.dx);
        });
        for (const { dx, dy } of offsets) {
            const translated = translateSelection(transformedItems, dx, dy);
            if (isValid(translated))
                return { items: translated, dx, dy };
        }
    }
    return null;
}
