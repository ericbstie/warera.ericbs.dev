import { afterAll, beforeAll, expect, test } from "bun:test";
import { openDatabase, readDailyTrading, readSnapshots } from "./db";

// TRPC_UPSTREAM is read when ./trpc is first evaluated, so the stub has to be
// listening and pointed at before the poller is imported.
const upstream = Bun.serve({
  port: 0,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/trpc/gameConfig.getGameConfig") {
      return Response.json({
        result: { data: { items: { lightAmmo: { isTradable: true }, medal: { isTradable: false } } } },
      });
    }

    const procedures = decodeURIComponent(url.pathname.replace("/trpc/", "")).split(",");
    const inputs = JSON.parse(url.searchParams.get("input") ?? "{}") as Record<string, { itemCode: string }>;
    return Response.json(
      procedures.map((procedure, index) => {
        const itemCode = inputs[index]!.itemCode;
        if (procedure === "tradingOrder.getTopOrders") {
          return {
            result: {
              data: {
                buyOrders: [{ itemCode, price: 1, quantity: 4 }, { itemCode, price: 1.1, quantity: 6 }],
                sellOrders: [{ itemCode, price: 1.3, quantity: 2 }],
              },
            },
          };
        }
        return { result: { data: { values: [{ valueAt: "2026-08-19", avgValue: 1.2, totalValue: 12, totalQuantity: 10, transactionsCount: 3 }] } } };
      }),
    );
  },
});

process.env.WARERA_TRPC_UPSTREAM = `${upstream.url.origin}/trpc`;
const { fetchTradableItems, pollOnce } = await import("./poller");

afterAll(() => upstream.stop(true));

test("only the tradable items are polled", async () => {
  expect(await fetchTradableItems()).toEqual(["lightAmmo"]);
});

test("a poll records the book and the daily totals it saw", async () => {
  const db = openDatabase(":memory:");
  expect(await pollOnce(db, 1_700_000_000_000)).toEqual({ snapshots: 1, days: 1 });

  expect(readSnapshots(db, "lightAmmo")).toEqual([
    { capturedAt: 1_700_000_000_000, bestBid: 1.1, bestAsk: 1.3, bidDepth: 10, askDepth: 2, dayValue: 12, dayQuantity: 10 },
  ]);
  expect(readDailyTrading(db, "lightAmmo")).toEqual([
    { valueAt: "2026-08-19", avgValue: 1.2, totalValue: 12, totalQuantity: 10, transactionsCount: 3 },
  ]);
  db.close();
});

test("polling again adds a point rather than replacing the last one", async () => {
  const db = openDatabase(":memory:");
  await pollOnce(db, 1_000);
  await pollOnce(db, 2_000);

  expect(readSnapshots(db, "lightAmmo").map(row => row.capturedAt)).toEqual([1_000, 2_000]);
  // The day upstream keeps re-reporting stays one row, refreshed in place.
  expect(readDailyTrading(db, "lightAmmo")).toHaveLength(1);
  db.close();
});
