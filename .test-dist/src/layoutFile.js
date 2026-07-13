import { GRID_HEIGHT, GRID_WIDTH, structureById } from './data/structures.js';
const VALID_ROTATIONS = new Set([0, 90, 180, 270]);
const MIN_CONSTRUCTION_LEVEL = 20;
const MAX_CONSTRUCTION_LEVEL = 120;
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function requireInteger(value, fieldName) {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw new Error(`${fieldName} must be an integer.`);
    }
    return value;
}
function parsePlacedStructure(value, index) {
    if (!isRecord(value)) {
        throw new Error(`Structure ${index + 1} is not a valid object.`);
    }
    const instanceId = value.instanceId;
    const structureId = value.structureId;
    const rotation = value.rotation;
    if (typeof instanceId !== 'string' || instanceId.trim() === '') {
        throw new Error(`Structure ${index + 1} has no valid instanceId.`);
    }
    if (typeof structureId !== 'string' || !structureById.has(structureId)) {
        throw new Error(`Structure ${index + 1} uses an unknown structureId: ${String(structureId)}.`);
    }
    if (typeof rotation !== 'number' || !VALID_ROTATIONS.has(rotation)) {
        throw new Error(`Structure ${index + 1} has an invalid rotation. Use 0, 90, 180, or 270.`);
    }
    return {
        instanceId,
        structureId,
        x: requireInteger(value.x, `Structure ${index + 1} x`),
        y: requireInteger(value.y, `Structure ${index + 1} y`),
        rotation: rotation,
    };
}
export function parseLayoutJson(text) {
    let parsed;
    try {
        parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
    }
    catch {
        throw new Error('The selected file is not valid JSON.');
    }
    if (!isRecord(parsed)) {
        throw new Error('The JSON root must be a layout object.');
    }
    if (parsed.version !== 1) {
        throw new Error(`Unsupported layout version: ${String(parsed.version)}.`);
    }
    if (parsed.gridWidth !== GRID_WIDTH || parsed.gridHeight !== GRID_HEIGHT) {
        throw new Error(`This planner only supports ${GRID_WIDTH}×${GRID_HEIGHT} layouts.`);
    }
    if (typeof parsed.name !== 'string') {
        throw new Error('The layout name is missing or invalid.');
    }
    if (!Array.isArray(parsed.structures)) {
        throw new Error('The layout structures list is missing or invalid.');
    }
    const constructionLevel = parsed.constructionLevel === undefined
        ? 99
        : requireInteger(parsed.constructionLevel, 'Construction level');
    if (constructionLevel < MIN_CONSTRUCTION_LEVEL || constructionLevel > MAX_CONSTRUCTION_LEVEL) {
        throw new Error(`Construction level must be between ${MIN_CONSTRUCTION_LEVEL} and ${MAX_CONSTRUCTION_LEVEL}.`);
    }
    const structures = parsed.structures.map(parsePlacedStructure);
    const instanceIds = new Set();
    for (const structure of structures) {
        if (instanceIds.has(structure.instanceId)) {
            throw new Error(`Duplicate structure instanceId: ${structure.instanceId}.`);
        }
        instanceIds.add(structure.instanceId);
    }
    return {
        version: 1,
        name: parsed.name.trim() || 'Imported layout',
        gridWidth: GRID_WIDTH,
        gridHeight: GRID_HEIGHT,
        constructionLevel,
        structures,
    };
}
