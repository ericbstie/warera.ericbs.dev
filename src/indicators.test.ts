import { expect, test } from "bun:test";
import type { Transaction } from "./hooks";
import {
  bucketBars,
  INTERVALS,
  intervalMs,
  isIntradayInterval,
  pointOfControl,
  RANGES,
  rangeDays,
  isIntraday,
  sma,
  volumeProfile,
  vwapSeries,
  type VolumeBucket,
} from "./indicators";

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    valueAt: "2026-08-17T00:00:00.000Z",
    avgValue: 0.08,
    totalValue: 8,
    totalQuantity: 100,
    transactionsCount: 4,
    ...overrides,
  };
}

function bucket(overrides: Partial<VolumeBucket>): VolumeBucket {
  return { low: 0, high: 0, volume: 0, upVolume: 0, downVolume: 0, ...overrides };
}

test("sma leaves the warm-up period null and averages the rest", () => {
  expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
});

test("sma of period 1 is the series itself", () => {
  expect(sma([4, 8], 1)).toEqual([4, 8]);
});

test("sma returns all nulls when the period is out of bounds", () => {
  expect(sma([1, 2, 3], 5)).toEqual([null, null, null]);
  expect(sma([1, 2, 3], 0)).toEqual([null, null, null]);
  expect(sma([1, 2, 3], -2)).toEqual([null, null, null]);
  expect(sma([], 3)).toEqual([]);
});

test("vwapSeries stays null until something trades, then anchors to the cumulative average", () => {
  const result = vwapSeries([
    tx({ totalValue: 0, totalQuantity: 0 }),
    tx({ totalValue: 0, totalQuantity: 0 }),
    tx({ totalValue: 10, totalQuantity: 100 }),
    tx({ totalValue: 30, totalQuantity: 100 }),
  ]);

  expect(result[0]).toBeNull();
  expect(result[1]).toBeNull();
  expect(result[2]).toBeCloseTo(0.1, 10);
  expect(result[3]).toBeCloseTo(0.2, 10);
});

test("RANGES lists every range shortest first and rangeDays maps them", () => {
  expect(RANGES).toEqual(["1D", "7D", "30D", "ALL"]);
  expect(RANGES.map(rangeDays)).toEqual([1, 7, 30, null]);
});

test("only the short ranges are drawn at the polled resolution", () => {
  expect(RANGES.filter(isIntraday)).toEqual(["1D", "7D"]);
  // A year of quarter-hours would be tens of thousands of candles.
  expect(isIntraday("ALL")).toBe(false);
});

test("volumeProfile bands prices low to high and puts the highest price in the last bucket", () => {
  const profile = volumeProfile(
    [
      tx({ avgValue: 10, totalQuantity: 1 }),
      tx({ avgValue: 20, totalQuantity: 2 }),
      tx({ avgValue: 30, totalQuantity: 4 }),
    ],
    2,
  );

  expect(profile).toEqual([
    bucket({ low: 10, high: 20, volume: 1, upVolume: 1, downVolume: 0 }),
    bucket({ low: 20, high: 30, volume: 6, upVolume: 6, downVolume: 0 }),
  ]);
});

test("volumeProfile splits into 24 buckets by default", () => {
  const transactions = Array.from({ length: 50 }, (_, i) => tx({ avgValue: i + 1, totalQuantity: 1 }));
  const profile = volumeProfile(transactions);

  expect(profile).toHaveLength(24);
  expect(profile.reduce((sum, b) => sum + b.volume, 0)).toBe(50);
});

test("volumeProfile collapses to one bucket when every price is identical", () => {
  const profile = volumeProfile([
    tx({ avgValue: 0.08, totalQuantity: 10 }),
    tx({ avgValue: 0.08, totalQuantity: 20 }),
  ]);

  expect(profile).toEqual([
    bucket({ low: 0.08, high: 0.08, volume: 30, upVolume: 30, downVolume: 0 }),
  ]);
});

test("volumeProfile counts a falling day as down volume and a flat day as up", () => {
  const profile = volumeProfile(
    [
      tx({ avgValue: 10, totalQuantity: 1 }),
      tx({ avgValue: 8, totalQuantity: 2 }),
      tx({ avgValue: 8, totalQuantity: 4 }),
    ],
    1,
  );

  expect(profile).toEqual([bucket({ low: 8, high: 10, volume: 7, upVolume: 5, downVolume: 2 })]);
});

test("volumeProfile returns an empty profile for no transactions", () => {
  expect(volumeProfile([])).toEqual([]);
});

test("pointOfControl returns the heaviest bucket, the first one on a tie", () => {
  const profile = [
    bucket({ low: 1, high: 2, volume: 5 }),
    bucket({ low: 2, high: 3, volume: 9 }),
    bucket({ low: 3, high: 4, volume: 9 }),
  ];

  expect(pointOfControl(profile)).toBe(profile[1]!);
});

test("pointOfControl returns null for an empty profile", () => {
  expect(pointOfControl([])).toBeNull();
});

test("INTERVALS lists the candle widths narrowest first", () => {
  expect(INTERVALS).toEqual(["15m", "30m", "2h", "8h", "1d"]);
  expect(INTERVALS.map(intervalMs)).toEqual([
    15 * 60_000,
    30 * 60_000,
    120 * 60_000,
    480 * 60_000,
    1440 * 60_000,
  ]);
});

test("only a day-wide candle can be drawn from the daily records", () => {
  expect(INTERVALS.filter(isIntradayInterval)).toEqual(["15m", "30m", "2h", "8h"]);
});

test("bucketBars groups the polled bars into the chosen width and weights price by volume", () => {
  const bars = bucketBars(
    [
      tx({ valueAt: "2026-08-17T00:00:00.000Z", avgValue: 0.1, totalValue: 10, totalQuantity: 100 }),
      tx({ valueAt: "2026-08-17T00:15:00.000Z", avgValue: 0.3, totalValue: 90, totalQuantity: 300 }),
      tx({ valueAt: "2026-08-17T00:30:00.000Z", avgValue: 0.2, totalValue: 4, totalQuantity: 20 }),
    ],
    "30m",
  );

  expect(bars).toHaveLength(2);
  expect(bars[0]!.valueAt).toBe("2026-08-17T00:00:00.000Z");
  expect(bars[0]!.avgValue).toBeCloseTo(0.25, 10);
  expect(bars[0]!.totalQuantity).toBe(400);
  expect(bars[1]!.valueAt).toBe("2026-08-17T00:30:00.000Z");
  expect(bars[1]!.avgValue).toBeCloseTo(0.2, 10);
});

test("bucketBars averages the mids when a bucket traded nothing", () => {
  const bars = bucketBars(
    [
      tx({ valueAt: "2026-08-17T00:00:00.000Z", avgValue: 0.1, totalValue: 0, totalQuantity: 0 }),
      tx({ valueAt: "2026-08-17T00:15:00.000Z", avgValue: 0.3, totalValue: 0, totalQuantity: 0 }),
    ],
    "2h",
  );

  expect(bars).toHaveLength(1);
  expect(bars[0]!.avgValue).toBeCloseTo(0.2, 10);
});

test("a day-wide candle is dated like a daily record so the axis labels it by day", () => {
  const bars = bucketBars(
    [
      tx({ valueAt: "2026-08-17T09:00:00.000Z" }),
      tx({ valueAt: "2026-08-18T09:00:00.000Z" }),
    ],
    "1d",
  );

  expect(bars.map(bar => bar.valueAt)).toEqual(["2026-08-17", "2026-08-18"]);
});

test("bucketBars leaves a daily series alone — a day can't be cut finer than it was recorded", () => {
  const daily = [tx({ valueAt: "2026-08-17" }), tx({ valueAt: "2026-08-18" })];
  expect(bucketBars(daily, "15m")).toBe(daily);
  expect(bucketBars([], "15m")).toEqual([]);
});
