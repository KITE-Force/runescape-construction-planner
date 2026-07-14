import {
  isMeaningfulMarquee,
  rectangleFromPoints,
  rectanglesIntersectOrTouch,
} from '../src/marquee.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const forward = rectangleFromPoints({ x: 2, y: 3 }, { x: 8, y: 10 });
assert(forward.x === 2 && forward.y === 3 && forward.width === 6 && forward.height === 7, 'forward drag rectangle should normalize');

const reverse = rectangleFromPoints({ x: 8, y: 10 }, { x: 2, y: 3 });
assert(reverse.x === 2 && reverse.y === 3 && reverse.width === 6 && reverse.height === 7, 'reverse drag rectangle should normalize');

assert(
  rectanglesIntersectOrTouch(
    { x: 0, y: 0, width: 4, height: 4 },
    { x: 4, y: 2, width: 2, height: 2 },
  ),
  'marquee selection should include a structure touched at its edge',
);

assert(
  !rectanglesIntersectOrTouch(
    { x: 0, y: 0, width: 4, height: 4 },
    { x: 4.1, y: 2, width: 2, height: 2 },
  ),
  'separated rectangles should not intersect',
);

assert(!isMeaningfulMarquee({ x: 1, y: 1, width: 0.1, height: 0.1 }), 'a click-sized gesture should not count as a marquee');
assert(isMeaningfulMarquee({ x: 1, y: 1, width: 1, height: 0.1 }), 'a horizontal drag should count as a marquee');

console.log('Marquee selection tests passed.');
