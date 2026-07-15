import {
  clampZoneTranslation,
  geometryFromRing,
  isSimpleZoneRing,
  mergeZoneGeometry,
  zoneArea,
  zoneSvgPath,
} from '../src/zoneGeometry.js';
import type { LayoutZone } from '../src/types.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const rectangle: LayoutZone = {
  zoneId: 'rectangle',
  x: 4,
  y: 5,
  width: 6,
  height: 3,
  label: 'Rectangle',
  color: '#4a8063',
};
assert(zoneArea(rectangle) === 18, 'rectangular zone area should use its bounds');
assert(zoneSvgPath(rectangle).includes('M 4 5'), 'rectangular zones should render as paths');

const polygonGeometry = geometryFromRing([
  { x: 2, y: 2 },
  { x: 8, y: 2 },
  { x: 8, y: 5 },
  { x: 5, y: 5 },
  { x: 5, y: 9 },
  { x: 2, y: 9 },
]);
assert(polygonGeometry !== null, 'valid snapped polygon should create geometry');
const polygon: LayoutZone = {
  zoneId: 'polygon',
  ...polygonGeometry,
  label: 'Polygon',
  color: '#4f6f91',
};
assert(zoneArea(polygon) === 30, 'polygon area should use its actual outline');

assert(!isSimpleZoneRing([
  { x: 0, y: 0 },
  { x: 4, y: 4 },
  { x: 0, y: 4 },
  { x: 4, y: 0 },
]), 'self-intersecting polygons should be rejected');

const merged = mergeZoneGeometry([
  rectangle,
  {
    zoneId: 'overlap',
    x: 8,
    y: 5,
    width: 5,
    height: 3,
    label: 'Overlap',
    color: '#8a6a3f',
  },
]);
assert(merged !== null, 'overlapping zones should merge');
const mergedZone: LayoutZone = {
  zoneId: 'merged',
  ...merged,
  label: 'Merged',
  color: '#4a8063',
};
assert(zoneArea(mergedZone) === 27, 'merged zone should remove overlap from its area');

const disconnected = mergeZoneGeometry([
  rectangle,
  {
    zoneId: 'far-away',
    x: 20,
    y: 20,
    width: 3,
    height: 3,
    label: 'Far away',
    color: '#76548f',
  },
]);
assert(disconnected?.polygons?.length === 2, 'disconnected zones should remain two components in one geometry');

const clamped = clampZoneTranslation([rectangle], -99, 99, 48, 48);
assert(clamped.dx === -4, 'zone movement should clamp at the west plot edge');
assert(clamped.dy === 40, 'zone movement should clamp at the south plot edge');

console.log('Zone polygon, movement, and union tests passed.');
