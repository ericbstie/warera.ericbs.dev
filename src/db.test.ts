import { expect, test } from "bun:test";
import { openDatabase, readDailyTrading, readSnapshots, recordDailyTrading, recordSnapshots } from "./db";

const snapshot = (capturedAt: number, bestBid: number | null = 1) => ({
  itemCode: "lightAmmo",
  capturedAt,
  bestBid,
  bestAsk: 2,
  bidDepth: 10,
  askDepth: 20,
  dayValue: 5,
  dayQuantity: 50,
});

const day = (valueAt: string, avgValue: number) => ({
  itemCode: "lightAmmo",
  valueAt,
  avgValue,
  totalValue: 100,
  totalQuantity: 50,
  transactionsCount: 5,
});

test("keeps snapshots per item, in time order", () => {
  const db = openDatabase(":memory:");
  recordSnapshots(db, [snapshot(200), snapshot(100), { ...snapshot(150), itemCode: "ironOre" }]);

  expect(readSnapshots(db, "lightAmmo").map(row => row.capturedAt)).toEqual([100, 200]);
  expect(readSnapshots(db, "ironOre")).toHaveLength(1);
  db.close();
});

test("a repeated snapshot leaves the recorded one alone", () => {
  const db = openDatabase(":memory:");
  recordSnapshots(db, [snapshot(100, 1)]);
  recordSnapshots(db, [snapshot(100, 9)]);

  expect(readSnapshots(db, "lightAmmo")).toEqual([
    { capturedAt: 100, bestBid: 1, bestAsk: 2, bidDepth: 10, askDepth: 20, dayValue: 5, dayQuantity: 50 },
  ]);
  db.close();
});

test("an empty side round-trips as null rather than zero", () => {
  const db = openDatabase(":memory:");
  recordSnapshots(db, [snapshot(100, null)]);
  expect(readSnapshots(db, "lightAmmo")[0]?.bestBid).toBeNull();
  db.close();
});

test("only reads back the window asked for", () => {
  const db = openDatabase(":memory:");
  recordSnapshots(db, [snapshot(100), snapshot(200), snapshot(300)]);
  expect(readSnapshots(db, "lightAmmo", 200).map(row => row.capturedAt)).toEqual([200, 300]);

  recordDailyTrading(db, [day("2026-08-01", 1), day("2026-08-10", 2)]);
  expect(readDailyTrading(db, "lightAmmo", "2026-08-05").map(row => row.valueAt)).toEqual(["2026-08-10"]);
  db.close();
});

test("a day still filling in is overwritten by its later reading", () => {
  const db = openDatabase(":memory:");
  recordDailyTrading(db, [day("2026-08-19", 1)]);
  recordDailyTrading(db, [{ ...day("2026-08-19", 2), totalQuantity: 900 }]);

  expect(readDailyTrading(db, "lightAmmo")).toEqual([
    { valueAt: "2026-08-19", avgValue: 2, totalValue: 100, totalQuantity: 900, transactionsCount: 5 },
  ]);
  db.close();
});

test("history outlives the 30 days upstream keeps", () => {
  const db = openDatabase(":memory:");
  recordDailyTrading(db, [day("2026-01-01", 1), day("2026-08-19", 2)]);
  // Upstream would have dropped January long ago; the stored copy still has it.
  expect(readDailyTrading(db, "lightAmmo")).toHaveLength(2);
  db.close();
});
