import { useEffect, useMemo, useState } from "react";

export type Transaction = {
  valueAt: string;
  avgValue: number;
  totalValue: number;
  totalQuantity: number;
  transactionsCount: number;
};

export type PricePoint = { date: string; price: number };

export async function fetchTransactionHistory(itemCode: string): Promise<Transaction[]> {
  const input = encodeURIComponent(JSON.stringify({ itemCode }));
  const res = await fetch(`https://api2.warera.io/trpc/itemTrading.getItemTrading?input=${input}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result.data.values ?? [];
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
