// Upstream only keeps 30 days of trading, one row per day, and its order book
// is the live one — neither is history. This walks every tradable item on a
// timer and writes what it sees into SQLite, so the record keeps growing after
// upstream has forgotten it.

import type { Database } from "bun:sqlite";
import { recordDailyTrading, recordSnapshots } from "./db";
import { dailyRows, latestDay, snapshotFromBook, type DayTotals } from "./history";
import { batchPath, chunk, TRPC_UPSTREAM, UPSTREAM_TIMEOUT_MS } from "./trpc";

export const POLL_INTERVAL_MS = 15 * 60 * 1000;

// One request per item would be 100+ calls a poll; upstream takes them in
// batches, so send them in chunks that keep the URL a sane length.
export const POLL_BATCH_SIZE = 20;

/** Unwraps a batched response into one payload per item, in the order asked. */
async function batchFetch(procedure: string, itemCodes: string[]): Promise<unknown[]> {
  const url = `${TRPC_UPSTREAM}/${batchPath(procedure, itemCodes.map(itemCode => ({ itemCode })))}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${procedure} batch answered ${res.status}`);

  const entries = await res.json();
  // A short batch would line payloads up against the wrong items, which is
  // worse than recording nothing for this round.
  if (!Array.isArray(entries) || entries.length !== itemCodes.length) {
    throw new Error(`${procedure} batch came back in an unexpected shape`);
  }
  return entries.map(entry => entry?.result?.data);
}

export async function fetchTradableItems(): Promise<string[]> {
  const res = await fetch(`${TRPC_UPSTREAM}/gameConfig.getGameConfig`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Item list answered ${res.status}`);

  const json = await res.json();
  const items = json?.result?.data?.items as Record<string, { isTradable?: boolean }> | undefined;
  if (!items || typeof items !== "object") throw new Error("Item list came back in an unexpected shape");
  return Object.keys(items).filter(code => items[code]?.isTradable).sort();
}

/**
 * Every item in a round shares one timestamp, so a snapshot lines up across
 * items rather than smearing over however long the walk took. A batch that
 * fails costs its own items this round and nothing else.
 */
export async function pollOnce(db: Database, capturedAt = Date.now()): Promise<{ snapshots: number; days: number }> {
  const itemCodes = await fetchTradableItems();
  let snapshots = 0;
  let days = 0;

  for (const group of chunk(itemCodes, POLL_BATCH_SIZE)) {
    // Trading first: the snapshot carries the day's totals as they stood when
    // the book was read, so it has to know them before it is built.
    const today = new Map<string, DayTotals>();
    try {
      const trading = (await batchFetch("itemTrading.getItemTrading", group)) as Array<{ values?: unknown } | undefined>;
      const rows = group.flatMap((code, index) => {
        const parsed = dailyRows(code, trading[index]?.values);
        today.set(code, latestDay(parsed));
        return parsed;
      });
      days += recordDailyTrading(db, rows);
    } catch (err) {
      console.error("[history] trading batch failed:", err);
    }

    try {
      const books = await batchFetch("tradingOrder.getTopOrders", group);
      snapshots += recordSnapshots(
        db,
        group.map((code, index) => snapshotFromBook(code, books[index], capturedAt, today.get(code))),
      );
    } catch (err) {
      console.error("[history] order book batch failed:", err);
    }
  }

  return { snapshots, days };
}

/** Returns the handle that stops the timer, which `bun --hot` needs on reload. */
export function startPolling(db: Database, intervalMs = POLL_INTERVAL_MS): { stop: () => void } {
  let running = false;

  const run = async () => {
    // A poll slower than the interval would otherwise stack up behind itself.
    if (running) return;
    running = true;
    try {
      const { snapshots, days } = await pollOnce(db);
      console.log(`[history] recorded ${snapshots} book snapshots and ${days} days of trading`);
    } catch (err) {
      console.error("[history] poll failed:", err);
    } finally {
      running = false;
    }
  };

  void run();
  const timer = setInterval(run, intervalMs);
  return { stop: () => clearInterval(timer) };
}
