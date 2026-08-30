import type { Transaction } from "./hooks";

/**
 * A period longer than the series is normal, not a bug: a short range, or a
 * record that hasn't been collecting long, can leave fewer bars on the chart
 * than the moving average asks for, and the overlay should simply not draw
 * rather than take the chart down.
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
    // Bars before the first trade have no average price to report — a zero
    // there would draw the VWAP line down to the axis.
    out.push(quantity > 0 ? value / quantity : null);
  }
  return out;
}

export type Range = "1D" | "7D" | "30D" | "ALL";

/**
 * The server's own record reaches back as far as it has been running, so these
 * are no longer capped at the 30 days upstream publishes.
 */
export const RANGES: Range[] = ["1D", "7D", "30D", "ALL"];

/** null asks for everything on file. */
export function rangeDays(range: Range): number | null {
  switch (range) {
    case "1D":
      return 1;
    case "7D":
      return 7;
    case "30D":
      return 30;
    case "ALL":
      return null;
  }
}

/**
 * Resolution follows the range, the way a trading terminal does it: a week or
 * less is drawn from the 15-minute poll — 672 candles at the outside — and
 * anything longer from the daily records, since a year of quarter-hours would
 * be 35,000 candles in a chart 800px wide.
 */
export function isIntraday(range: Range): boolean {
  const days = rangeDays(range);
  return days !== null && days <= 7;
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

/**
 * How wide a candle is, independent of how far back the chart looks. The poll
 * writes a snapshot every 15 minutes, so that is the finest bar there is; the
 * rest are those bars grouped up.
 */
export type Interval = "15m" | "30m" | "2h" | "8h" | "1d";

export const INTERVALS: Interval[] = ["15m", "30m", "2h", "8h", "1d"];

const MINUTE_MS = 60 * 1000;

export function intervalMs(interval: Interval): number {
  switch (interval) {
    case "15m":
      return 15 * MINUTE_MS;
    case "30m":
      return 30 * MINUTE_MS;
    case "2h":
      return 120 * MINUTE_MS;
    case "8h":
      return 480 * MINUTE_MS;
    case "1d":
      return 1440 * MINUTE_MS;
  }
}

/** Anything under a day has to come from the polled series rather than the daily records. */
export function isIntradayInterval(interval: Interval): boolean {
  return interval !== "1d";
}

/**
 * Groups the polled bars into candles of the chosen width. A daily series is
 * left alone: a day can't be cut any finer than it was recorded, and its bars
 * are dated rather than timestamped, which is what labels them by day.
 */
export function bucketBars(transactions: Transaction[], interval: Interval): Transaction[] {
  if (transactions.length === 0) return transactions;
  if (transactions.some(t => !t.valueAt.includes("T"))) return transactions;

  const step = intervalMs(interval);
  const bars: Transaction[] = [];
  let startedAt = -Infinity;
  // The prices behind the bucket's average, for when nothing traded in it and
  // there is no volume to weight by.
  let prices: number[] = [];

  for (const t of transactions) {
    const at = Date.parse(t.valueAt);
    if (!Number.isFinite(at)) continue;

    const bucketAt = Math.floor(at / step) * step;
    if (bucketAt !== startedAt) {
      startedAt = bucketAt;
      prices = [];
      const stamp = new Date(bucketAt).toISOString();
      bars.push({
        // A day-wide candle is dated like a daily record so the axis labels it
        // with the day rather than with a midnight it shares with every other.
        valueAt: step >= 1440 * MINUTE_MS ? stamp.slice(0, 10) : stamp,
        avgValue: 0,
        totalValue: 0,
        totalQuantity: 0,
        transactionsCount: 0,
      });
    }

    const bar = bars[bars.length - 1]!;
    bar.totalValue += t.totalValue;
    bar.totalQuantity += t.totalQuantity;
    bar.transactionsCount += t.transactionsCount;
    prices.push(t.avgValue);
    bar.avgValue =
      bar.totalQuantity > 0
        ? bar.totalValue / bar.totalQuantity
        : prices.reduce((sum, price) => sum + price, 0) / prices.length;
  }

  return bars;
}
