import LZString from 'lz-string';
import type { SavedLayout } from './types.js';

const { compressToEncodedURIComponent, decompressFromEncodedURIComponent } = LZString;

const SHARE_PARAMETER = 'layout';

/**
 * Creates a self-contained share URL. The layout is compressed into the hash,
 * so GitHub Pages never needs a database or server-side storage.
 */
export function createShareUrl(
  layout: SavedLayout,
  currentUrl = window.location.href,
): string {
  const compressed = compressToEncodedURIComponent(JSON.stringify(layout));
  const url = new URL(currentUrl);
  url.hash = `${SHARE_PARAMETER}=${compressed}`;
  return url.toString();
}

/**
 * Reads a shared layout from a URL hash. Passing the hash explicitly keeps the
 * function easy to test while the browser default covers normal app usage.
 */
export function readSharedLayout(hash = window.location.hash): SavedLayout | null {
  const normalizedHash = hash.replace(/^#/, '');
  const prefix = `${SHARE_PARAMETER}=`;

  if (!normalizedHash.startsWith(prefix)) {
    return null;
  }

  const compressed = normalizedHash.slice(prefix.length);
  if (!compressed) {
    throw new Error('The shared layout link does not contain any layout data.');
  }

  const json = decompressFromEncodedURIComponent(compressed);
  if (!json) {
    throw new Error('The shared layout link is damaged or incomplete.');
  }

  try {
    return JSON.parse(json) as SavedLayout;
  } catch {
    throw new Error('The shared layout link contains invalid layout data.');
  }
}
