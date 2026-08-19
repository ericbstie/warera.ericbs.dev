import { expect, test } from "bun:test";
import { dailyRows, midPrice, snapshotFromBook } from "./history";

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
