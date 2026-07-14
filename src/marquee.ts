export interface RectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PointLike {
  x: number;
  y: number;
}

export function rectangleFromPoints(first: PointLike, second: PointLike): RectLike {
  const x = Math.min(first.x, second.x);
  const y = Math.min(first.y, second.y);
  return {
    x,
    y,
    width: Math.max(first.x, second.x) - x,
    height: Math.max(first.y, second.y) - y,
  };
}

export function rectanglesIntersectOrTouch(first: RectLike, second: RectLike) {
  return first.x <= second.x + second.width
    && first.x + first.width >= second.x
    && first.y <= second.y + second.height
    && first.y + first.height >= second.y;
}

export function isMeaningfulMarquee(rectangle: RectLike, minimumSize = 0.25) {
  return rectangle.width >= minimumSize || rectangle.height >= minimumSize;
}
