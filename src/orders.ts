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
