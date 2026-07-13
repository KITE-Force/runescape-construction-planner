export type Rotation = 0 | 90 | 180 | 270;

export type ShapeId =
  | 'rectangle'
  | 'cross'
  | 'corner'
  | 't-shape'
  | 'octagon'
  | 'end-rounded'
  | 'corner-rounded'
  | 'path-curved';

export type StructureCategory = 'room' | 'path' | 'portal';

export type DoorwaySide = 'north' | 'east' | 'south' | 'west';

export interface Point {
  x: number;
  y: number;
}

/**
 * A doorway is stored in the structure's unrotated local tile coordinates.
 * offset is the doorway center measured along its wall:
 * - north/south: distance from the structure's left edge
 * - east/west: distance from the structure's top edge
 */
export interface DoorwayDefinition {
  side: DoorwaySide;
  offset: number;
  width: number;
}

export interface StructureDefinition {
  id: string;
  name: string;
  category: StructureCategory;
  width: number;
  height: number;
  cost?: number;
  level?: number;
  shape: ShapeId;
  doorways: DoorwayDefinition[];
  referenceImage?: string;
  canvasImage?: string;
  notes?: string;
}

export interface PlacedStructure {
  instanceId: string;
  structureId: string;
  x: number;
  y: number;
  rotation: Rotation;
}

export interface TransformedDoorway extends DoorwayDefinition {
  structureWidth: number;
  structureHeight: number;
}

export interface WorldDoorway extends TransformedDoorway {
  key: string;
  instanceId: string;
  doorwayIndex: number;
  line: number;
  spanStart: number;
  spanEnd: number;
}

export interface DoorwayConnection {
  first: WorldDoorway;
  second: WorldDoorway;
}

export interface SavedLayout {
  version: 1;
  name: string;
  gridWidth: number;
  gridHeight: number;
  constructionLevel?: number;
  structures: PlacedStructure[];
}
