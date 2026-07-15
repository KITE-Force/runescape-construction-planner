import { createShareUrl, readSharedLayout } from '../src/shareUrl.js';
import type { SavedLayout } from '../src/types.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectFailure(action: () => unknown, expectedText: RegExp) {
  try {
    action();
    throw new Error(`Expected failure matching ${expectedText}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(expectedText.test(message), `Expected ${expectedText}, received "${message}".`);
  }
}

const layout: SavedLayout = {
  version: 3,
  name: 'Shared test layout',
  gridWidth: 48,
  gridHeight: 48,
  constructionLevel: 120,
  budget: 1_500_000,
  zones: [
    {
      zoneId: 'zone-1',
      x: 4,
      y: 4,
      width: 12,
      height: 10,
      label: 'Garden',
      color: '#4a8063',
      polygons: [[[{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 6 }, { x: 6, y: 10 }, { x: 0, y: 10 }]]],
    },
  ],
  structures: [
    {
      instanceId: 'room-1',
      structureId: 'square',
      x: 8,
      y: 8,
      rotation: 90,
      customLabel: 'Workshop',
      notes: 'Shared notes survive compression.',
      customColor: '#4a9f72',
    },
  ],
};

const url = createShareUrl(
  layout,
  'https://example.com/runescape-construction-planner/?mode=test#old-value',
);
const parsedUrl = new URL(url);

assert(parsedUrl.origin === 'https://example.com', 'share URL should preserve the origin');
assert(parsedUrl.pathname === '/runescape-construction-planner/', 'share URL should preserve the GitHub Pages path');
assert(parsedUrl.hash.startsWith('#layout='), 'share URL should use the layout hash');
assert(
  JSON.stringify(readSharedLayout(parsedUrl.hash)) === JSON.stringify(layout),
  'shared layout should survive compression and decompression',
);
assert(readSharedLayout('#unrelated=value') === null, 'unrelated hashes should be ignored');
expectFailure(
  () => readSharedLayout('#layout='),
  /does not contain any layout data/,
);
expectFailure(
  () => readSharedLayout('#layout=not-valid-compressed-data'),
  /damaged or incomplete|invalid layout data/,
);

console.log('Share URL tests passed.');
