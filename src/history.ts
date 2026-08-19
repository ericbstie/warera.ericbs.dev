// Shapes for the locally recorded market history. The upstream trading
// endpoint only ever answers with the last 30 days, one row per day, so
// anything longer or finer than that has to be observed and kept here.

import { isFiniteNumber, usableTransactions } from "./hooks";
import type { Order, OrderBook } from "./orders";

/** One observation of an item's order book, as stored. */
export type BookSnapshot = {
  itemCode: string;
  capturedAt: number;
  bestBid: number | null;
  bestAsk: number | null;
  bidDepth: number;
  askDepth: number;
};

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
export function snapshotFromBook(itemCode: string, book: unknown, capturedAt: number): BookSnapshot {
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
  };
}

/** The mid is derived rather than stored; a one-sided book has no mid at all. */
export function midPrice(snapshot: Pick<BookSnapshot, "bestBid" | "bestAsk">): number | null {
  const { bestBid, bestAsk } = snapshot;
  if (bestBid === null || bestAsk === null) return null;
  return (bestBid + bestAsk) / 2;
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
