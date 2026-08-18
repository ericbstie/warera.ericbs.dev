import { useEffect, useMemo, useState } from "react";

export type Transaction = {
  valueAt: string;
  avgValue: number;
  totalValue: number;
  totalQuantity: number;
  transactionsCount: number;
};

export type PricePoint = { date: string; price: number };

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
