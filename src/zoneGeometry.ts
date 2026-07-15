import polygonClipping, { type MultiPolygon as ClippingMultiPolygon } from 'polygon-clipping';

const { union } = polygonClipping;
import type { LayoutZone, Point, ZonePolygon, ZoneRing } from './types.js';

const EPSILON = 1e-7;

function nearlyEqual(first: number, second: number) {
  return Math.abs(first - second) <= EPSILON;
}

export function samePoint(first: Point, second: Point) {
  return nearlyEqual(first.x, second.x) && nearlyEqual(first.y, second.y);
}

export function removeClosingPoint(ring: ZoneRing): ZoneRing {
  if (ring.length > 1 && samePoint(ring[0], ring[ring.length - 1])) {
    return ring.slice(0, -1);
  }
  return [...ring];
}

function closeRing(ring: ZoneRing): [number, number][] {
  const open = removeClosingPoint(ring);
  if (open.length === 0) return [];
  return [...open, open[0]].map((point) => [point.x, point.y]);
}

export function rectangleZonePolygons(zone: Pick<LayoutZone, 'x' | 'y' | 'width' | 'height'>): ZonePolygon[] {
  return [[[
    { x: zone.x, y: zone.y },
    { x: zone.x + zone.width, y: zone.y },
    { x: zone.x + zone.width, y: zone.y + zone.height },
    { x: zone.x, y: zone.y + zone.height },
  ]]];
}

export function zoneAbsolutePolygons(zone: LayoutZone): ZonePolygon[] {
  if (!zone.polygons || zone.polygons.length === 0) return rectangleZonePolygons(zone);
  return zone.polygons.map((polygon) => polygon.map((ring) => ring.map((point) => ({
    x: point.x + zone.x,
    y: point.y + zone.y,
  }))));
}

export function zoneSvgPath(zone: LayoutZone, scale = 1): string {
  return zoneAbsolutePolygons(zone)
    .flatMap((polygon) => polygon.map((ring) => {
      const open = removeClosingPoint(ring);
      if (open.length < 3) return '';
      return `${open.map((point, index) => (
        `${index === 0 ? 'M' : 'L'} ${point.x * scale} ${point.y * scale}`
      )).join(' ')} Z`;
    }))
    .filter(Boolean)
    .join(' ');
}

function signedRingArea(ring: ZoneRing) {
  const open = removeClosingPoint(ring);
  if (open.length < 3) return 0;
  let doubledArea = 0;
  for (let index = 0; index < open.length; index += 1) {
    const current = open[index];
    const next = open[(index + 1) % open.length];
    doubledArea += current.x * next.y - next.x * current.y;
  }
  return doubledArea / 2;
}

export function zoneArea(zone: LayoutZone) {
  return zoneAbsolutePolygons(zone).reduce((total, polygon) => {
    const [outer, ...holes] = polygon;
    if (!outer) return total;
    return total + Math.abs(signedRingArea(outer))
      - holes.reduce((holeTotal, ring) => holeTotal + Math.abs(signedRingArea(ring)), 0);
  }, 0);
}

function orientation(first: Point, second: Point, third: Point) {
  const cross = (second.y - first.y) * (third.x - second.x)
    - (second.x - first.x) * (third.y - second.y);
  if (nearlyEqual(cross, 0)) return 0;
  return cross > 0 ? 1 : 2;
}

function pointOnSegment(first: Point, point: Point, second: Point) {
  return point.x <= Math.max(first.x, second.x) + EPSILON
    && point.x + EPSILON >= Math.min(first.x, second.x)
    && point.y <= Math.max(first.y, second.y) + EPSILON
    && point.y + EPSILON >= Math.min(first.y, second.y);
}

function segmentsIntersect(firstStart: Point, firstEnd: Point, secondStart: Point, secondEnd: Point) {
  const o1 = orientation(firstStart, firstEnd, secondStart);
  const o2 = orientation(firstStart, firstEnd, secondEnd);
  const o3 = orientation(secondStart, secondEnd, firstStart);
  const o4 = orientation(secondStart, secondEnd, firstEnd);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && pointOnSegment(firstStart, secondStart, firstEnd)) return true;
  if (o2 === 0 && pointOnSegment(firstStart, secondEnd, firstEnd)) return true;
  if (o3 === 0 && pointOnSegment(secondStart, firstStart, secondEnd)) return true;
  if (o4 === 0 && pointOnSegment(secondStart, firstEnd, secondEnd)) return true;
  return false;
}

export function isSimpleZoneRing(ring: ZoneRing) {
  const open = removeClosingPoint(ring);
  if (open.length < 3) return false;

  for (let firstIndex = 0; firstIndex < open.length; firstIndex += 1) {
    const firstStart = open[firstIndex];
    const firstEnd = open[(firstIndex + 1) % open.length];
    if (samePoint(firstStart, firstEnd)) return false;

    for (let secondIndex = firstIndex + 1; secondIndex < open.length; secondIndex += 1) {
      const adjacent = secondIndex === firstIndex
        || secondIndex === (firstIndex + 1) % open.length
        || firstIndex === (secondIndex + 1) % open.length;
      if (adjacent) continue;

      const secondStart = open[secondIndex];
      const secondEnd = open[(secondIndex + 1) % open.length];
      if (segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd)) return false;
    }
  }

  return Math.abs(signedRingArea(open)) > EPSILON;
}

function zoneToClippingGeometry(zone: LayoutZone): ClippingMultiPolygon {
  return zoneAbsolutePolygons(zone).map((polygon) => polygon.map(closeRing)) as ClippingMultiPolygon;
}

function roundCoordinate(value: number) {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export interface ZoneGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  polygons?: ZonePolygon[];
}

export function geometryFromMultiPolygon(multiPolygon: ClippingMultiPolygon): ZoneGeometry | null {
  const normalized = multiPolygon
    .map((polygon) => polygon
      .map((ring) => removeClosingPoint(ring.map(([x, y]) => ({
        x: roundCoordinate(x),
        y: roundCoordinate(y),
      }))))
      .filter((ring) => ring.length >= 3))
    .filter((polygon) => polygon.length > 0);

  const allPoints = normalized.flat(2);
  if (allPoints.length < 3) return null;

  const x = Math.min(...allPoints.map((point) => point.x));
  const y = Math.min(...allPoints.map((point) => point.y));
  const right = Math.max(...allPoints.map((point) => point.x));
  const bottom = Math.max(...allPoints.map((point) => point.y));
  if (right - x <= EPSILON || bottom - y <= EPSILON) return null;

  return {
    x: roundCoordinate(x),
    y: roundCoordinate(y),
    width: roundCoordinate(right - x),
    height: roundCoordinate(bottom - y),
    polygons: normalized.map((polygon) => polygon.map((ring) => ring.map((point) => ({
      x: roundCoordinate(point.x - x),
      y: roundCoordinate(point.y - y),
    })))),
  };
}

export function geometryFromRing(ring: ZoneRing): ZoneGeometry | null {
  const open = removeClosingPoint(ring);
  if (!isSimpleZoneRing(open)) return null;
  return geometryFromMultiPolygon([[closeRing(open)]]);
}

export function mergeZoneGeometry(zones: LayoutZone[]): ZoneGeometry | null {
  if (zones.length === 0) return null;
  const [first, ...rest] = zones.map(zoneToClippingGeometry);
  return geometryFromMultiPolygon(union(first, ...rest));
}

export function translateZone(zone: LayoutZone, dx: number, dy: number): LayoutZone {
  return { ...zone, x: zone.x + dx, y: zone.y + dy };
}

export function clampZoneTranslation(
  zones: LayoutZone[],
  dx: number,
  dy: number,
  gridWidth: number,
  gridHeight: number,
) {
  if (zones.length === 0) return { dx: 0, dy: 0 };
  const left = Math.min(...zones.map((zone) => zone.x));
  const top = Math.min(...zones.map((zone) => zone.y));
  const right = Math.max(...zones.map((zone) => zone.x + zone.width));
  const bottom = Math.max(...zones.map((zone) => zone.y + zone.height));
  return {
    dx: Math.max(-left, Math.min(dx, gridWidth - right)),
    dy: Math.max(-top, Math.min(dy, gridHeight - bottom)),
  };
}

export function mergeZoneLayout(source: LayoutZone[], candidates: LayoutZone[]) {
  const candidateById = new Map(candidates.map((zone) => [zone.zoneId, zone]));
  return source.map((zone) => candidateById.get(zone.zoneId) ?? zone);
}

export function zoneBoundsIntersect(
  zone: LayoutZone,
  rectangle: { x: number; y: number; width: number; height: number },
) {
  return zone.x <= rectangle.x + rectangle.width
    && zone.x + zone.width >= rectangle.x
    && zone.y <= rectangle.y + rectangle.height
    && zone.y + zone.height >= rectangle.y;
}
