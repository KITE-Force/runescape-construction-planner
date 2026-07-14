export const DEFAULT_STRUCTURE_COLOR = '#6c3e25';

function channelToHex(channel: number) {
  return channel.toString(16).padStart(2, '0');
}

export function normalizeColorInput(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  const shortHex = value.match(/^#?([0-9a-f]{3})$/i);
  if (shortHex) {
    const [red, green, blue] = shortHex[1].split('');
    return `#${red}${red}${green}${green}${blue}${blue}`.toLowerCase();
  }

  const fullHex = value.match(/^#?([0-9a-f]{6})$/i);
  if (fullHex) return `#${fullHex[1].toLowerCase()}`;

  const rgb = value.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i)
    ?? value.match(/^(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})$/);

  if (!rgb) return null;

  const channels = rgb.slice(1).map(Number);
  if (channels.some((channel) => channel < 0 || channel > 255)) return null;

  return `#${channels.map(channelToHex).join('')}`;
}

export const MAX_RECENT_COLORS = 8;

export function addRecentColor(
  current: readonly string[],
  rawColor: string,
  maximum = MAX_RECENT_COLORS,
): string[] {
  const normalized = normalizeColorInput(rawColor);
  if (!normalized || maximum <= 0) return [...current];

  return [
    normalized,
    ...current
      .map((color) => normalizeColorInput(color))
      .filter((color): color is string => Boolean(color) && color !== normalized),
  ].slice(0, maximum);
}

export function parseRecentColors(raw: string | null, maximum = MAX_RECENT_COLORS): string[] {
  if (!raw || maximum <= 0) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const colors: string[] = [];
    for (const value of parsed) {
      if (typeof value !== 'string') continue;
      const normalized = normalizeColorInput(value);
      if (!normalized || colors.includes(normalized)) continue;
      colors.push(normalized);
      if (colors.length >= maximum) break;
    }
    return colors;
  } catch {
    return [];
  }
}
