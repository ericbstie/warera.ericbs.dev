import { expect, test } from "bun:test";
import type { Transaction } from "./hooks";
import { formatCompact, formatDay, formatPrice, quoteFor, windowQuote } from "./stats";

function day(
  valueAt: string,
  avgValue: number,
  totalValue: number,
  totalQuantity: number,
): Transaction {
  return { valueAt, avgValue, totalValue, totalQuantity, transactionsCount: 1 };
}

const series = [
  day("2026-08-15", 2, 200, 100),
  day("2026-08-16", 2.5, 400, 200),
  day("2026-08-17", 3, 900, 300),
];

test("quoteFor returns null for an empty history", () => {
  expect(quoteFor([])).toBeNull();
});

test("windowQuote returns null for an empty history", () => {
  expect(windowQuote([])).toBeNull();
});

test("quoteFor reports the last day against the day before it", () => {
  expect(quoteFor(series)).toEqual({
    date: "2026-08-17",
    price: 3,
    change: 0.5,
    changePct: 20,
    volume: 300,
    vwap: 3,
    open: 2.5,
    high: 3,
    low: 2.5,
    close: 3,
  });
});

test("quoteFor reports a fall as a negative change and swaps high/low", () => {
  const falling = [day("2026-08-16", 4, 400, 100), day("2026-08-17", 3, 300, 100)];
  const quote = quoteFor(falling)!;

  expect(quote.change).toBe(-1);
  expect(quote.changePct).toBe(-25);
  expect(quote.high).toBe(4);
  expect(quote.low).toBe(3);
});

test("quoteFor treats a single day as flat", () => {
  expect(quoteFor([day("2026-08-17", 2, 200, 100)])).toEqual({
    date: "2026-08-17",
    price: 2,
    change: 0,
    changePct: 0,
    volume: 100,
    vwap: 2,
    open: 2,
    high: 2,
    low: 2,
    close: 2,
  });
});

test("quoteFor reports 0% rather than Infinity when the previous price was 0", () => {
  const quote = quoteFor([day("2026-08-16", 0, 0, 0), day("2026-08-17", 5, 50, 10)])!;

  expect(quote.change).toBe(5);
  expect(quote.changePct).toBe(0);
  expect(Number.isFinite(quote.changePct)).toBe(true);
});

test("quoteFor has no vwap for a day that traded no units", () => {
  const quote = quoteFor([day("2026-08-16", 2, 200, 100), day("2026-08-17", 2, 0, 0)])!;

  expect(quote.vwap).toBeNull();
  expect(quote.volume).toBe(0);
});

test("windowQuote summarises the whole range as one session", () => {
  expect(windowQuote(series)).toEqual({
    date: "2026-08-17",
    price: 3,
    change: 1,
    changePct: 50,
    volume: 600,
    vwap: 2.5,
    open: 2,
    high: 3,
    low: 2,
    close: 3,
  });
});

test("windowQuote takes high and low from the middle of the range too", () => {
  const swings = [
    day("2026-08-15", 2, 200, 100),
    day("2026-08-16", 9, 900, 100),
    day("2026-08-17", 1, 100, 100),
    day("2026-08-18", 3, 300, 100),
  ];
  const quote = windowQuote(swings)!;

  expect(quote.high).toBe(9);
  expect(quote.low).toBe(1);
  expect(quote.open).toBe(2);
  expect(quote.close).toBe(3);
  expect(quote.change).toBe(1);
  expect(quote.changePct).toBe(50);
});

test("windowQuote treats a single day as flat", () => {
  expect(windowQuote([day("2026-08-17", 2, 200, 100)])).toEqual({
    date: "2026-08-17",
    price: 2,
    change: 0,
    changePct: 0,
    volume: 100,
    vwap: 2,
    open: 2,
    high: 2,
    low: 2,
    close: 2,
  });
});

test("windowQuote reports 0% rather than Infinity when the range opened at 0", () => {
  const quote = windowQuote([day("2026-08-16", 0, 0, 0), day("2026-08-17", 5, 50, 10)])!;

  expect(quote.changePct).toBe(0);
  expect(quote.vwap).toBe(5);
});

test("windowQuote has no vwap when nothing traded across the range", () => {
  const quiet = [day("2026-08-16", 2, 0, 0), day("2026-08-17", 2, 0, 0)];
  const quote = windowQuote(quiet)!;

  expect(quote.vwap).toBeNull();
  expect(quote.volume).toBe(0);
});

test("formatPrice defaults to three decimals and honours an override", () => {
  expect(formatPrice(1.23456)).toBe("1.235");
  expect(formatPrice(2)).toBe("2.000");
  expect(formatPrice(1.23456, 1)).toBe("1.2");
  expect(formatPrice(12.3, 0)).toBe("12");
});

test("formatPrice never renders NaN or Infinity", () => {
  expect(formatPrice(NaN)).toBe("0.000");
  expect(formatPrice(Infinity)).toBe("0.000");
});

test("formatCompact abbreviates large volumes", () => {
  expect(formatCompact(1234)).toBe("1.23k");
  expect(formatCompact(1_234_567)).toBe("1.23M");
  expect(formatCompact(1_234_567_890)).toBe("1.23B");
  expect(formatCompact(1.5e12)).toBe("1.5T");
  expect(formatCompact(1000)).toBe("1k");
});

test("formatCompact leaves small numbers unsuffixed and drops trailing zeros", () => {
  expect(formatCompact(12)).toBe("12");
  expect(formatCompact(12.5)).toBe("12.5");
  expect(formatCompact(12.345)).toBe("12.35");
  expect(formatCompact(999)).toBe("999");
  expect(formatCompact(0)).toBe("0");
});

test("formatCompact handles negatives without producing -0", () => {
  expect(formatCompact(-1234)).toBe("-1.23k");
  expect(formatCompact(-12.5)).toBe("-12.5");
  expect(formatCompact(-0.001)).toBe("0");
  expect(formatCompact(NaN)).toBe("0");
});

test("formatDay renders a short UTC label", () => {
  expect(formatDay("2026-08-09")).toBe("9 Aug 2026");
  expect(formatDay("2026-12-31")).toBe("31 Dec 2026");
  expect(formatDay("2026-08-09T23:45:00.000Z")).toBe("9 Aug 2026");
});

test("formatDay returns a blank rather than Invalid Date", () => {
  expect(formatDay("not-a-date")).toBe("");
  expect(formatDay("")).toBe("");
});
