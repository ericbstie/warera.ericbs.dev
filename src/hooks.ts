import { useEffect, useMemo, useState } from "react";

export type Transaction = {
  valueAt: string;
  avgValue: number;
  totalValue: number;
  totalQuantity: number;
  transactionsCount: number;
};

export type PricePoint = { date: string; price: number };

export type MarketItem = { code: string; type: string };

export function itemIcon(code: string) {
  return `https://media.warera.io/images/items/${code}.png?v=33`;
}

/** `?? 0` lets NaN through, and NaN is what a malformed number usually arrives as. */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * A single unusable day would otherwise poison the chart's whole scale — one
 * NaN price turns the axis labels, the line and the candles into NaN — so drop
 * the days that can't be drawn and chart the rest.
 */
export function usableTransactions(values: unknown): Transaction[] {
  if (!Array.isArray(values)) return [];
  return values
    .filter((t): t is Transaction => isFiniteNumber(t?.avgValue) && typeof t?.valueAt === "string")
    .map(t => ({ ...t, totalQuantity: isFiniteNumber(t.totalQuantity) ? t.totalQuantity : 0 }));
}

export async function fetchTransactionHistory(itemCode: string): Promise<Transaction[]> {
  const input = encodeURIComponent(JSON.stringify({ itemCode }));
  const res = await fetch(`/api/trpc/itemTrading.getItemTrading?input=${input}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  // Reject an unrecognised shape rather than reading it as "never traded" —
  // an empty chart and a broken API should not look the same.
  if (!json?.result?.data) throw new Error("Price history came back in an unexpected shape");
  return usableTransactions(json.result.data.values ?? []);
}

/** Upstream takes tRPC calls in batches, so every item's history costs one request. */
export function tradingBatchPath(itemCodes: string[]): string {
  const procedures = Array(itemCodes.length).fill("itemTrading.getItemTrading").join(",");
  const input = JSON.stringify(Object.fromEntries(itemCodes.map((code, index) => [index, { itemCode: code }])));
  return `${procedures}?batch=1&input=${encodeURIComponent(input)}`;
}

export type Mover = { code: string; changePct: number };

/**
 * Days are only recorded when an item traded, so "seven days ago" is the record
 * a week back rather than seven entries back. Anything without both ends of the
 * window has no move to report.
 */
export function weeklyChangePct(transactions: Transaction[], days = 7): number | null {
  const last = transactions[transactions.length - 1];
  if (!last) return null;

  const cutoff = Date.parse(last.valueAt) - days * 24 * 60 * 60 * 1000;
  const earlier = transactions.filter(t => Date.parse(t.valueAt) <= cutoff).pop() ?? transactions[0];
  if (!earlier || earlier === last || !earlier.avgValue) return null;

  return ((last.avgValue - earlier.avgValue) / earlier.avgValue) * 100;
}

export async function fetchWeeklyMovers(itemCodes: string[]): Promise<Mover[]> {
  if (!itemCodes.length) return [];

  const res = await fetch(`/api/trpc/${tradingBatchPath(itemCodes)}`);
  const entries = await res.json();
  if (!Array.isArray(entries)) throw new Error("Batched price history came back in an unexpected shape");

  return itemCodes.flatMap((code, index) => {
    const changePct = weeklyChangePct(usableTransactions(entries[index]?.result?.data?.values));
    return changePct === null ? [] : [{ code, changePct }];
  });
}

export function useWeeklyMovers(itemCodes: string[]): Mover[] {
  const [movers, setMovers] = useState<Mover[]>([]);
  const key = itemCodes.join(",");

  useEffect(() => {
    if (!key) return;
    let cancelled = false;

    fetchWeeklyMovers(key.split(","))
      .then(values => {
        if (!cancelled) setMovers(values);
      })
      // The ticker is a garnish; a failure leaves it empty rather than shouting.
      .catch(err => console.error("[ticker] weekly movers failed to load:", err));

    return () => {
      cancelled = true;
    };
  }, [key]);

  return movers;
}

export function toPriceHistory(transactions: Transaction[]): PricePoint[] {
  return transactions.map(t => ({ date: t.valueAt, price: t.avgValue }));
}

export function useTransactionHistory(itemCode: string) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setTransactions([]);
    setError(null);
    if (!itemCode) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetchTransactionHistory(itemCode)
      .then(values => {
        if (!cancelled) setTransactions(values);
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

  return { transactions, loading, error };
}

export function usePriceHistory(itemCode: string) {
  const { transactions, loading, error } = useTransactionHistory(itemCode);
  const prices = useMemo(() => toPriceHistory(transactions), [transactions]);
  return { prices, loading, error };
}

/** Codes arrive as camelCase identifiers — "lightAmmo", "helmet1" — and the UI wants words. */
export function itemLabel(code: string): string {
  return code.replace(/([a-z])([A-Z0-9])/g, "$1 $2").replace(/^./, first => first.toUpperCase());
}

export async function fetchItems(): Promise<MarketItem[]> {
  const res = await fetch("/api/trpc/gameConfig.getGameConfig", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  const items = json?.result?.data?.items as
    | Record<string, { isTradable?: boolean; type?: string }>
    | undefined;
  if (!items) throw new Error("Item list came back in an unexpected shape");
  return Object.keys(items)
    .filter(code => items[code]?.isTradable)
    .sort()
    .map(code => ({ code, type: items[code]?.type ?? "" }));
}

/** Both pages are built out of this list, so both fetch it the same way. */
export function useItems() {
  const [items, setItems] = useState<MarketItem[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    fetchItems()
      .then(listed => {
        if (!cancelled) setItems(listed);
      })
      .catch(err => {
        if (cancelled) return;
        // Without this the page rendered as a healthy but empty shell: an empty
        // picker, and three panels each reporting "no data for this item".
        setItems([]);
        setError(err as Error);
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return { items, error, retry: () => setAttempt(current => current + 1) };
}
