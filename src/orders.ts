import { useEffect, useState } from "react";
import { isFiniteNumber } from "./hooks";

export type Order = {
  _id: string;
  user: string;
  itemCode: string;
  quantity: number;
  price: number;
  offerAt: string;
  type: "buy" | "sell";
};

export type OrderBook = { buyOrders: Order[]; sellOrders: Order[] };

export type PriceLevel = { price: number; quantity: number };

export async function fetchOrders(itemCode: string): Promise<OrderBook> {
  const input = encodeURIComponent(JSON.stringify({ itemCode }));
  const res = await fetch(`/api/trpc/tradingOrder.getTopOrders?input=${input}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  // An unrecognised shape is a failure, not an empty book.
  if (!json?.result?.data) throw new Error("Order book came back in an unexpected shape");
  return {
    buyOrders: json.result.data.buyOrders ?? [],
    sellOrders: json.result.data.sellOrders ?? [],
  };
}

export function groupOrdersByPrice(orders: Order[]): PriceLevel[] {
  const totals = new Map<number, number>();
  for (const order of orders) {
    // An order missing a price used to throw on .toFixed() and take the page
    // down with it; one missing a quantity summed to NaN and rendered as "NaN".
    if (!isFiniteNumber(order?.price) || !isFiniteNumber(order?.quantity)) continue;
    totals.set(order.price, (totals.get(order.price) ?? 0) + order.quantity);
  }
  return Array.from(totals, ([price, quantity]) => ({ price, quantity })).sort((a, b) => b.price - a.price);
}

export function useTransactions(itemCode: string) {
  const [buyOrders, setBuyOrders] = useState<Order[]>([]);
  const [sellOrders, setSellOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setBuyOrders([]);
    setSellOrders([]);
    setError(null);
    if (!itemCode) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetchOrders(itemCode)
      .then(book => {
        if (!cancelled) {
          setBuyOrders(book.buyOrders);
          setSellOrders(book.sellOrders);
        }
      })
      .catch(err => {
        if (!cancelled) setError(err as Error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [itemCode]);

  return { buyOrders, sellOrders, loading, error };
}

// --- best prices across many items ----------------------------------------
// The wage calculator prices a whole item list at once. One request per item
// would be 100+ calls; upstream takes them in batches, so send them in chunks
// that keep the URL a sane length.

export const ORDER_BOOK_BATCH_SIZE = 20;

/** The top of each side of the book: what a seller is bid, what a buyer is asked. */
export type BestPrices = { bids: Record<string, number>; asks: Record<string, number> };

/**
 * Upstream takes one procedure per comma-separated name and indexes the inputs
 * to match, so a batch of n books is the name repeated n times.
 */
export function topOrdersBatchPath(itemCodes: string[]): string {
  const procedures = Array(itemCodes.length).fill("tradingOrder.getTopOrders").join(",");
  const input = JSON.stringify(Object.fromEntries(itemCodes.map((itemCode, index) => [index, { itemCode }])));
  return `/api/trpc/${procedures}?batch=1&input=${encodeURIComponent(input)}`;
}

function best(orders: unknown, pick: (a: number, b: number) => number): number | null {
  if (!Array.isArray(orders)) return null;
  const prices = orders.map(order => order?.price).filter(price => isFiniteNumber(price) && price > 0);
  // reduce hands its callback the index and the array too, and Math.max would
  // take those as further numbers and answer NaN.
  return prices.length ? prices.reduce((chosen, price) => pick(chosen, price)) : null;
}

/**
 * Maps a batched book response back onto the items that asked for it. A book
 * that failed or arrived in an unexpected shape leaves that item unpriced,
 * which reads the same as an item nobody is trading.
 */
export function bestPricesFromBatch(itemCodes: string[], entries: unknown): BestPrices {
  const prices: BestPrices = { bids: {}, asks: {} };
  if (!Array.isArray(entries) || entries.length !== itemCodes.length) {
    throw new Error("Batched order books came back in an unexpected shape");
  }

  itemCodes.forEach((code, index) => {
    const book = (entries[index] as { result?: { data?: OrderBook } } | undefined)?.result?.data;
    if (!book) return;
    const bid = best(book.buyOrders, Math.max);
    const ask = best(book.sellOrders, Math.min);
    if (bid !== null) prices.bids[code] = bid;
    if (ask !== null) prices.asks[code] = ask;
  });
  return prices;
}

/** The top of the book for every item named, in as few requests as upstream allows. */
export async function fetchBestPrices(itemCodes: string[]): Promise<BestPrices> {
  const prices: BestPrices = { bids: {}, asks: {} };

  for (let i = 0; i < itemCodes.length; i += ORDER_BOOK_BATCH_SIZE) {
    const group = itemCodes.slice(i, i + ORDER_BOOK_BATCH_SIZE);
    const res = await fetch(topOrdersBatchPath(group));
    const json = await res.json();
    if (json?.error) throw new Error(json.error.message);
    const batch = bestPricesFromBatch(group, json);
    Object.assign(prices.bids, batch.bids);
    Object.assign(prices.asks, batch.asks);
  }

  return prices;
}
