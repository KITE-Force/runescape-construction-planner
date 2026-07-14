export const EXPERIMENTAL_MAX_BUDGET = 3_750_000;
export const EXPERIMENTAL_MAX_DESCRIPTION = '25 Octagons arranged as a connected 5×5 room grid under the planner’s current rules and costs.';

/**
 * Parses optional RuneScape-style coin amounts.
 * Examples: 1000, 1,000, 1k, 1.5m, 2b.
 */
export function parseCoinAmount(input: string): number | undefined {
  const trimmed = input.trim();
  if (trimmed === '') return undefined;

  const normalized = trimmed
    .replace(/^\$/u, '')
    .replace(/[,_\s]/gu, '')
    .toLowerCase();
  const match = normalized.match(/^(\d+(?:\.\d+)?)([kmb])?$/u);
  if (!match) return undefined;

  const amount = Number(match[1]);
  const multiplier = match[2] === 'k'
    ? 1_000
    : match[2] === 'm'
      ? 1_000_000
      : match[2] === 'b'
        ? 1_000_000_000
        : 1;
  const value = amount * multiplier;

  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) return undefined;
  return value;
}

export function compactCoinAmount(value: number) {
  if (value >= 1_000_000_000 && value % 1_000_000_000 === 0) return `${value / 1_000_000_000}b`;
  if (value >= 1_000_000 && value % 1_000_000 === 0) return `${value / 1_000_000}m`;
  if (value >= 1_000 && value % 1_000 === 0) return `${value / 1_000}k`;
  return value.toLocaleString('en-US');
}
