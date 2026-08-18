import type { Transaction } from "./hooks";

/**
 * A period longer than the series is normal, not a bug: the range filter can
 * leave fewer days on the chart than the moving average asks for, and the
 * overlay should simply not draw rather than take the chart down.
 */
export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (!Number.isFinite(period) || period < 1 || period > values.length) return out;

  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function vwapSeries(transactions: Transaction[]): (number | null)[] {
  const out: (number | null)[] = [];
  let value = 0;
  let quantity = 0;
  for (const t of transactions) {
    value += t.totalValue;
    quantity += t.totalQuantity;
    // Days before the first trade have no average price to report — a zero
    // there would draw the VWAP line down to the axis.
    out.push(quantity > 0 ? value / quantity : null);
  }
  return out;
}

export type Range = "7D" | "14D" | "30D" | "ALL";

/** Upstream keeps 30 days of daily records, so a longer window than that has nothing to show. */
export const RANGES: Range[] = ["7D", "14D", "30D", "ALL"];

export function rangeDays(range: Range): number | null {
  switch (range) {
    case "7D":
      return 7;
    case "14D":
      return 14;
    case "30D":
      return 30;
    case "ALL":
      return null;
  }
}

export function sliceRange<T>(values: T[], range: Range): T[] {
  const days = rangeDays(range);
  return days === null ? values.slice() : values.slice(-days);
}

export type VolumeBucket = {
  low: number;
  high: number;
  volume: number;
  upVolume: number;
  downVolume: number;
};

export function volumeProfile(transactions: Transaction[], buckets = 24): VolumeBucket[] {
  if (transactions.length === 0) return [];

  let low = Infinity;
  let high = -Infinity;
  for (const t of transactions) {
    if (t.avgValue < low) low = t.avgValue;
    if (t.avgValue > high) high = t.avgValue;
  }

  const count = Number.isFinite(buckets) ? Math.max(1, Math.trunc(buckets)) : 24;
  const span = high - low;
  // An item that traded at one price all week has no span to divide up, so it
  // collapses to a single band instead of a division by zero.
  const banded = span > 0;
  const width = banded ? span / count : 0;

  const profile: VolumeBucket[] = Array.from({ length: banded ? count : 1 }, (_, i) => ({
    low: banded ? low + i * width : low,
    high: banded ? low + (i + 1) * width : high,
    volume: 0,
    upVolume: 0,
    downVolume: 0,
  }));

  for (let i = 0; i < transactions.length; i++) {
    const t = transactions[i]!;
    // The highest price sits exactly on the top edge and would land one band
    // past the end, so the last band owns it.
    const index = banded ? Math.min(profile.length - 1, Math.floor((t.avgValue - low) / width)) : 0;
    const bucket = profile[index]!;
    const previous = transactions[i - 1];
    const up = previous === undefined || t.avgValue >= previous.avgValue;

    bucket.volume += t.totalQuantity;
    if (up) bucket.upVolume += t.totalQuantity;
    else bucket.downVolume += t.totalQuantity;
  }

  return profile;
}

export function pointOfControl(profile: VolumeBucket[]): VolumeBucket | null {
  let best: VolumeBucket | null = null;
  for (const bucket of profile) {
    if (best === null || bucket.volume > best.volume) best = bucket;
  }
  return best;
}
