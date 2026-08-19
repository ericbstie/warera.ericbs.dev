import { type MarketItem } from "./hooks";
import { itemLabel } from "./hooks";

export type Match = { item: MarketItem; score: number };

/** How many rows the palette shows before anything is typed. */
export const DEFAULT_LIMIT = 8;

/**
 * Match quality, best first. Scores are compared, never displayed, so a tier
 * can be slotted in without touching the comparator; equal scores fall back to
 * the code so the list never reshuffles between identical queries.
 */
export const SCORE = {
  exact: 5,
  codePrefix: 4,
  labelPrefix: 3,
  contains: 2,
  subsequence: 1,
  none: 0,
} as const;

/** Queries arrive from a text input, so trim and case-fold before comparing. */
export function normalize(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/** "lam" finds "lightAmmo": every character of the query, in order, anywhere. */
export function isSubsequence(query: string, text: string): boolean {
  let index = 0;
  for (const char of text) {
    if (index === query.length) break;
    if (char === query[index]) index += 1;
  }
  return index === query.length;
}

export function scoreItem(item: MarketItem, query: string): number {
  const needle = normalize(query);
  const raw = typeof item?.code === "string" ? item.code.trim() : "";
  if (!needle || !raw) return SCORE.none;

  const code = raw.toLowerCase();
  // The label has to come from the camelCase code — "lightammo" would spell
  // itself "Lightammo" and never match a typed "light ammo".
  const label = normalize(itemLabel(raw));

  if (code === needle) return SCORE.exact;
  if (code.startsWith(needle)) return SCORE.codePrefix;
  if (label.startsWith(needle)) return SCORE.labelPrefix;
  if (code.includes(needle) || label.includes(needle)) return SCORE.contains;
  if (isSubsequence(needle, code)) return SCORE.subsequence;
  return SCORE.none;
}

/** Anything that isn't an item with a code can't be matched or rendered. */
function usableItems(items: MarketItem[]): MarketItem[] {
  return Array.isArray(items) ? items.filter(item => typeof item?.code === "string") : [];
}

export function rankItems(items: MarketItem[], query: string): Match[] {
  const needle = normalize(query);
  return usableItems(items)
    .map(item => ({ item, score: scoreItem(item, needle) }))
    .filter(match => match.score > SCORE.none)
    .sort((a, b) => b.score - a.score || a.item.code.localeCompare(b.item.code));
}

export function searchItems(
  items: MarketItem[],
  query: string,
  limit: number = DEFAULT_LIMIT,
): MarketItem[] {
  const cap = Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : DEFAULT_LIMIT;
  const needle = normalize(query);
  // Nothing typed yet: the palette opens on the head of the list as it stands.
  if (!needle) return usableItems(items).slice(0, cap);
  return rankItems(items, needle)
    .slice(0, cap)
    .map(match => match.item);
}
