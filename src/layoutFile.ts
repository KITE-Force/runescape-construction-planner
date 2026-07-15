import { GRID_HEIGHT, GRID_WIDTH, structureById } from './data/structures.js';
import type {
  CurrentSavedLayout,
  LayoutZone,
  PlacedStructure,
  Rotation,
} from './types.js';
import { normalizeColorInput } from './color.js';

const VALID_ROTATIONS = new Set<Rotation>([0, 90, 180, 270]);
const MIN_CONSTRUCTION_LEVEL = 20;
const MAX_CONSTRUCTION_LEVEL = 120;
const DEFAULT_ZONE_COLOR = '#4a8063';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown, fieldName: string) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string when provided.`);
  }
  return value;
}

function requireInteger(value: unknown, fieldName: string) {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`${fieldName} must be an integer.`);
  }
  return value;
}

function parsePlacedStructure(value: unknown, index: number): PlacedStructure {
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
  if (typeof rotation !== 'number' || !VALID_ROTATIONS.has(rotation as Rotation)) {
    throw new Error(`Structure ${index + 1} has an invalid rotation. Use 0, 90, 180, or 270.`);
  }

  return {
    instanceId,
    structureId,
    x: requireInteger(value.x, `Structure ${index + 1} x`),
    y: requireInteger(value.y, `Structure ${index + 1} y`),
    rotation: rotation as Rotation,
    customLabel: optionalString(value.customLabel, `Structure ${index + 1} customLabel`),
    notes: optionalString(value.notes, `Structure ${index + 1} notes`),
    customColor: (() => {
      const rawColor = optionalString(value.customColor, `Structure ${index + 1} customColor`);
      if (rawColor === undefined) return undefined;
      const normalized = normalizeColorInput(rawColor);
      if (!normalized) {
        throw new Error(`Structure ${index + 1} customColor must be a valid hex or RGB color.`);
      }
      return normalized;
    })(),
  };
}

function parseZone(value: unknown, index: number): LayoutZone {
  if (!isRecord(value)) {
    throw new Error(`Zone ${index + 1} is not a valid object.`);
  }

  const zoneId = value.zoneId;
  if (typeof zoneId !== 'string' || zoneId.trim() === '') {
    throw new Error(`Zone ${index + 1} has no valid zoneId.`);
  }

  const x = requireInteger(value.x, `Zone ${index + 1} x`);
  const y = requireInteger(value.y, `Zone ${index + 1} y`);
  const width = requireInteger(value.width, `Zone ${index + 1} width`);
  const height = requireInteger(value.height, `Zone ${index + 1} height`);

  if (width < 1 || height < 1) {
    throw new Error(`Zone ${index + 1} width and height must be at least 1 tile.`);
  }
  if (x < 0 || y < 0 || x + width > GRID_WIDTH || y + height > GRID_HEIGHT) {
    throw new Error(`Zone ${index + 1} must stay within the ${GRID_WIDTH}×${GRID_HEIGHT} plot.`);
  }

  const rawLabel = optionalString(value.label, `Zone ${index + 1} label`) ?? `Zone ${index + 1}`;
  const rawColor = optionalString(value.color, `Zone ${index + 1} color`) ?? DEFAULT_ZONE_COLOR;
  const color = normalizeColorInput(rawColor);
  if (!color) {
    throw new Error(`Zone ${index + 1} color must be a valid hex or RGB color.`);
  }

  return {
    zoneId,
    x,
    y,
    width,
    height,
    label: rawLabel.slice(0, 80),
    color,
  };
}

export function parseLayoutJson(text: string): CurrentSavedLayout {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('The selected file is not valid JSON.');
  }

  if (!isRecord(parsed)) {
    throw new Error('The JSON root must be a layout object.');
  }
  if (parsed.version !== 1 && parsed.version !== 2) {
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

  const budget = parsed.budget === undefined
    ? undefined
    : requireInteger(parsed.budget, 'Budget');

  if (budget !== undefined && budget < 0) {
    throw new Error('Budget must be zero or greater.');
  }

  const structures = parsed.structures.map(parsePlacedStructure);
  const structureIds = new Set<string>();
  for (const structure of structures) {
    if (structureIds.has(structure.instanceId)) {
      throw new Error(`Duplicate structure instanceId: ${structure.instanceId}.`);
    }
    structureIds.add(structure.instanceId);
  }

  // Version 1 predates zoning. It is migrated in memory rather than rejected.
  const rawZones = parsed.version === 1 || parsed.zones === undefined ? [] : parsed.zones;
  if (!Array.isArray(rawZones)) {
    throw new Error('The layout zones list is invalid.');
  }
  const zones = rawZones.map(parseZone);
  const zoneIds = new Set<string>();
  for (const zone of zones) {
    if (zoneIds.has(zone.zoneId)) {
      throw new Error(`Duplicate zone zoneId: ${zone.zoneId}.`);
    }
    zoneIds.add(zone.zoneId);
  }

  return {
    version: 2,
    name: parsed.name.trim() || 'Imported layout',
    gridWidth: GRID_WIDTH,
    gridHeight: GRID_HEIGHT,
    constructionLevel,
    budget,
    structures,
    zones,
  };
}
