// Shapes for the locally recorded market history. The upstream trading
// endpoint only ever answers with the last 30 days, one row per day, so
// anything longer or finer than that has to be observed and kept here.

import { isFiniteNumber, usableTransactions, type Transaction } from "./hooks";
import type { Order, OrderBook } from "./orders";

/**
 * One observation of an item's order book, as stored. The day's running trade
 * totals ride along because the daily row they come from is overwritten as the
 * day fills in — kept here, the difference between two polls is what traded
 * between them, which is the only way to a volume finer than a day.
 */
export type BookSnapshot = {
  itemCode: string;
  capturedAt: number;
  bestBid: number | null;
  bestAsk: number | null;
  bidDepth: number;
  askDepth: number;
  dayValue: number;
  dayQuantity: number;
};

/** The running totals of the day a snapshot was taken in, as upstream reports them. */
export type DayTotals = { totalValue: number; totalQuantity: number };

/** The same totals once they are on a snapshot, which is what a lead-in is. */
export type SnapshotTotals = Pick<BookSnapshot, "dayValue" | "dayQuantity">;

/** A day of upstream trading totals, kept past the point upstream drops it. */
export type DailyRow = {
  itemCode: string;
  valueAt: string;
  avgValue: number;
  totalValue: number;
  totalQuantity: number;
  transactionsCount: number;
};

/** An order without a usable price or quantity can't move a best or a depth. */
function usableOrders(orders: unknown): Order[] {
  if (!Array.isArray(orders)) return [];
  return orders.filter((order): order is Order => isFiniteNumber(order?.price) && isFiniteNumber(order?.quantity));
}

/**
 * A book with nothing on a side has no best price there — null rather than 0,
 * which would chart as a real quote at zero.
 */
export function snapshotFromBook(
  itemCode: string,
  book: unknown,
  capturedAt: number,
  day: DayTotals = { totalValue: 0, totalQuantity: 0 },
): BookSnapshot {
  const buys = usableOrders((book as OrderBook | undefined)?.buyOrders);
  const sells = usableOrders((book as OrderBook | undefined)?.sellOrders);

  const best = (orders: Order[], pick: (a: number, b: number) => number) =>
    orders.length ? orders.reduce((chosen, order) => pick(chosen, order.price), orders[0]!.price) : null;
  const depth = (orders: Order[]) => orders.reduce((total, order) => total + order.quantity, 0);

  return {
    itemCode,
    capturedAt,
    bestBid: best(buys, Math.max),
    bestAsk: best(sells, Math.min),
    bidDepth: depth(buys),
    askDepth: depth(sells),
    dayValue: day.totalValue,
    dayQuantity: day.totalQuantity,
  };
}

/** The mid is derived rather than stored; a one-sided book has no mid at all. */
export function midPrice(snapshot: Pick<BookSnapshot, "bestBid" | "bestAsk">): number | null {
  const { bestBid, bestAsk } = snapshot;
  if (bestBid === null || bestAsk === null) return null;
  return (bestBid + bestAsk) / 2;
}

/** The day still in progress, which is the last one upstream reports. */
export function latestDay(rows: DailyRow[]): DayTotals {
  const last = rows[rows.length - 1];
  return { totalValue: last?.totalValue ?? 0, totalQuantity: last?.totalQuantity ?? 0 };
}

export function dailyRows(itemCode: string, values: unknown): DailyRow[] {
  return usableTransactions(values).map(transaction => ({
    itemCode,
    valueAt: transaction.valueAt,
    avgValue: transaction.avgValue,
    totalValue: isFiniteNumber(transaction.totalValue) ? transaction.totalValue : 0,
    totalQuantity: transaction.totalQuantity,
    transactionsCount: isFiniteNumber(transaction.transactionsCount) ? transaction.transactionsCount : 0,
  }));
}

/**
 * The polled series as the chart reads it: a mid price and what traded since
 * the previous poll. `valueAt` carries a full timestamp here where a daily row
 * carries a date, which is what tells the two apart downstream.
 */
export function intradayBars(
  snapshots: Array<Omit<BookSnapshot, "itemCode">>,
  leadIn: SnapshotTotals | null = null,
): Transaction[] {
  const bars: Transaction[] = [];
  // The poll before the window, so the bar at the left edge reports what traded
  // in its own quarter-hour rather than everything since midnight.
  let previous: SnapshotTotals | null = leadIn;

  for (const snapshot of snapshots) {
    // Totals count up through a day and start again at midnight, so a fall
    // means a new day rather than negative volume.
    const carried = previous !== null && snapshot.dayQuantity >= previous.dayQuantity;
    const totalValue = carried ? snapshot.dayValue - previous!.dayValue : snapshot.dayValue;
    const totalQuantity = carried ? snapshot.dayQuantity - previous!.dayQuantity : snapshot.dayQuantity;
    // Advanced even for a snapshot that draws no bar, so the next bar still
    // measures against the poll before it rather than one further back.
    previous = snapshot;

    const price = midPrice(snapshot);
    // A moment with nothing quoted on one side has no price to plot, and a gap
    // reads better than a line dropped to whatever the other side asked.
    if (price === null) continue;

    bars.push({
      valueAt: new Date(snapshot.capturedAt).toISOString(),
      avgValue: price,
      totalValue,
      totalQuantity,
      transactionsCount: 0,
    });
  }

  return bars;
}
