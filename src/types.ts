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
  customLabel?: string;
  notes?: string;
  customColor?: string;
}

export type ZoneRing = Point[];
export type ZonePolygon = ZoneRing[];

export interface LayoutZone {
  zoneId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  color: string;
  /**
   * Optional polygon geometry stored relative to x/y. Each polygon contains an
   * outer ring followed by any hole rings. Missing geometry represents the
   * full rectangular x/y/width/height bounds used by version 2 layouts.
   */
  polygons?: ZonePolygon[];
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

interface SavedLayoutBase {
  name: string;
  gridWidth: number;
  gridHeight: number;
  constructionLevel?: number;
  budget?: number;
  structures: PlacedStructure[];
}

export interface SavedLayoutV1 extends SavedLayoutBase {
  version: 1;
}

export interface SavedLayoutV2 extends SavedLayoutBase {
  version: 2;
  zones: LayoutZone[];
}

export interface SavedLayoutV3 extends SavedLayoutBase {
  version: 3;
  zones: LayoutZone[];
}

export type SavedLayout = SavedLayoutV1 | SavedLayoutV2 | SavedLayoutV3;
export type CurrentSavedLayout = SavedLayoutV3;
