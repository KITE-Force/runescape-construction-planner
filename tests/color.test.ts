import { addRecentColor, parseRecentColors } from '../src/color.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const first = addRecentColor([], '#4A90E2');
assert(first.join(',') === '#4a90e2', 'new colors should be normalized');

const reordered = addRecentColor(['#112233', '#4a90e2', '#abcdef'], 'rgb(74, 144, 226)');
assert(
  reordered.join(',') === '#4a90e2,#112233,#abcdef',
  'reusing a color should move it to the front without duplicates',
);

const limited = addRecentColor(['#111111', '#222222', '#333333'], '#444444', 3);
assert(limited.join(',') === '#444444,#111111,#222222', 'recent colors should respect the maximum');

const parsed = parseRecentColors(JSON.stringify(['#111', 'rgb(1, 2, 3)', 'invalid', '#111111']));
assert(parsed.join(',') === '#111111,#010203', 'stored recent colors should be normalized and deduplicated');
assert(parseRecentColors('not json').length === 0, 'invalid stored data should be ignored');

console.log('Recent color history tests passed.');
