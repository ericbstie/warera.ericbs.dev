import { expect, test } from "bun:test";
import { dailyRows, intradayBars, latestDay, midPrice, snapshotFromBook } from "./history";

const book = {
  buyOrders: [
    { price: 1, quantity: 10 },
    { price: 1.2, quantity: 5 },
  ],
  sellOrders: [
    { price: 1.5, quantity: 3 },
    { price: 1.4, quantity: 7 },
  ],
};

test("takes the best of each side and the depth behind it", () => {
  expect(snapshotFromBook("lightAmmo", book, 100)).toEqual({
    itemCode: "lightAmmo",
    capturedAt: 100,
    bestBid: 1.2,
    bestAsk: 1.4,
    bidDepth: 15,
    askDepth: 10,
    dayValue: 0,
    dayQuantity: 0,
  });
});

test("an empty side has no best price rather than a zero one", () => {
  const snapshot = snapshotFromBook("lightAmmo", { buyOrders: [], sellOrders: book.sellOrders }, 100);
  expect(snapshot.bestBid).toBeNull();
  expect(snapshot.bidDepth).toBe(0);
  expect(snapshot.bestAsk).toBe(1.4);
});

test("a missing or malformed book records as an empty one", () => {
  expect(snapshotFromBook("lightAmmo", undefined, 100)).toMatchObject({ bestBid: null, bestAsk: null });
  expect(snapshotFromBook("lightAmmo", { buyOrders: "nope" }, 100)).toMatchObject({ bidDepth: 0 });
});

test("orders without a usable price or quantity are left out", () => {
  const snapshot = snapshotFromBook(
    "lightAmmo",
    { buyOrders: [{ price: 9, quantity: null }, { price: 1, quantity: 4 }], sellOrders: [] },
    100,
  );
  expect(snapshot).toMatchObject({ bestBid: 1, bidDepth: 4 });
});

test("the mid needs both sides", () => {
  expect(midPrice({ bestBid: 1, bestAsk: 2 })).toBe(1.5);
  expect(midPrice({ bestBid: null, bestAsk: 2 })).toBeNull();
  expect(midPrice({ bestBid: 1, bestAsk: null })).toBeNull();
});

test("daily rows carry the item code and default their missing totals", () => {
  const rows = dailyRows("lightAmmo", [
    { valueAt: "2026-08-18", avgValue: 0.16, totalValue: 10, totalQuantity: 5, transactionsCount: 2 },
    { valueAt: "2026-08-19", avgValue: 0.17 },
    { valueAt: "2026-08-20", avgValue: "broken" },
  ]);

  expect(rows).toEqual([
    { itemCode: "lightAmmo", valueAt: "2026-08-18", avgValue: 0.16, totalValue: 10, totalQuantity: 5, transactionsCount: 2 },
    { itemCode: "lightAmmo", valueAt: "2026-08-19", avgValue: 0.17, totalValue: 0, totalQuantity: 0, transactionsCount: 0 },
  ]);
});

const snap = (capturedAt: number, dayQuantity: number, dayValue: number, bestBid: number | null = 1) => ({
  capturedAt,
  bestBid,
  bestAsk: 2,
  bidDepth: 5,
  askDepth: 5,
  dayValue,
  dayQuantity,
});

test("an intraday bar prices at the mid and times to the minute", () => {
  const [bar] = intradayBars([snap(Date.UTC(2026, 7, 19, 13, 30), 100, 10)]);

  expect(bar).toMatchObject({ valueAt: "2026-08-19T13:30:00.000Z", avgValue: 1.5 });
});

test("volume is what traded since the previous poll, not the day's running total", () => {
  const bars = intradayBars([snap(1_000, 100, 10), snap(2_000, 250, 30), snap(3_000, 300, 36)]);

  expect(bars.map(bar => bar.totalQuantity)).toEqual([100, 150, 50]);
  expect(bars.map(bar => bar.totalValue)).toEqual([10, 20, 6]);
});

test("totals starting again at midnight read as a new day, never as negative volume", () => {
  const bars = intradayBars([snap(1_000, 900, 90), snap(2_000, 40, 4)]);

  expect(bars[1]).toMatchObject({ totalQuantity: 40, totalValue: 4 });
});

test("a moment with one side of the book unquoted has no bar", () => {
  expect(intradayBars([snap(1_000, 100, 10, null), snap(2_000, 200, 20)])).toHaveLength(1);
});

test("the day a snapshot rides along with is the one still filling in", () => {
  expect(latestDay([])).toEqual({ totalValue: 0, totalQuantity: 0 });
  expect(
    latestDay([
      { itemCode: "iron", valueAt: "2026-08-18", avgValue: 1, totalValue: 5, totalQuantity: 5, transactionsCount: 1 },
      { itemCode: "iron", valueAt: "2026-08-19", avgValue: 2, totalValue: 9, totalQuantity: 4, transactionsCount: 2 },
    ]),
  ).toEqual({ totalValue: 9, totalQuantity: 4 });
});

test("a lead-in poll keeps the first bar from carrying the whole day", () => {
  const window = [snap(2_000, 250, 30), snap(3_000, 300, 36)];

  expect(intradayBars(window, { dayValue: 10, dayQuantity: 100 })[0]).toMatchObject({
    totalQuantity: 150,
    totalValue: 20,
  });
  // Without one there is nothing to difference against, so it reports the day so far.
  expect(intradayBars(window)[0]).toMatchObject({ totalQuantity: 250 });
});

test("a skipped moment's trading lands on the next bar rather than an earlier baseline", () => {
  const bars = intradayBars([snap(1_000, 100, 10), snap(2_000, 250, 30, null), snap(3_000, 300, 36)]);

  expect(bars).toHaveLength(2);
  // 300 - 250, measuring against the unplottable poll rather than the one before it.
  expect(bars[1]).toMatchObject({ totalQuantity: 50 });
});
