import { useEffect, useMemo, useState } from "react";
import { isIntraday, rangeDays, type Range } from "./indicators";

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

/**
 * The server's own record rather than upstream's: upstream publishes 30 days of
 * daily averages and nothing finer, while this reaches back as far as the
 * poller has been running and down to the quarter-hour.
 */
export function historyPath(itemCode: string, range: Range): string {
  const days = rangeDays(range);
  const params = new URLSearchParams({ itemCode });
  if (days !== null) params.set("days", String(days));
  if (isIntraday(range)) params.set("intraday", "1");
  return `/api/history?${params}`;
}

export async function fetchTransactionHistory(itemCode: string, range: Range): Promise<Transaction[]> {
  const res = await fetch(historyPath(itemCode, range));
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  // Reject an unrecognised shape rather than reading it as "never traded" —
  // an empty chart and a broken API should not look the same.
  if (!Array.isArray(json?.bars)) throw new Error("Price history came back in an unexpected shape");
  return usableTransactions(json.bars);
}

export type Mover = { code: string; changePct: number };

/**
 * Days are only recorded when an item traded, so "seven days ago" is the record
 * a week back rather than seven entries back. Anything without both ends of the
 * window has no move to report. The server runs this over its own records now,
 * so the ticker means the same thing wherever it is computed.
 */
export function weeklyChangePct(transactions: Transaction[], days = 7): number | null {
  const last = transactions[transactions.length - 1];
  if (!last) return null;

  const cutoff = Date.parse(last.valueAt) - days * 24 * 60 * 60 * 1000;
  const earlier = transactions.filter(t => Date.parse(t.valueAt) <= cutoff).pop() ?? transactions[0];
  if (!earlier || earlier === last || !earlier.avgValue) return null;

  return ((last.avgValue - earlier.avgValue) / earlier.avgValue) * 100;
}

/**
 * One request for the whole strip: the server already holds every item's week
 * and compares them there, where it used to be one batched upstream call per
 * page load.
 */
export async function fetchWeeklyMovers(itemCodes: string[]): Promise<Mover[]> {
  if (!itemCodes.length) return [];

  const res = await fetch("/api/movers");
  const json = await res.json();
  if (!Array.isArray(json?.movers)) throw new Error("Weekly movers came back in an unexpected shape");

  // The strip only shows what the picker lists, so an item the record still
  // holds but the game no longer trades stays off it.
  const listed = new Set(itemCodes);
  return (json.movers as Mover[]).filter(mover => listed.has(mover.code) && isFiniteNumber(mover.changePct));
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

export function useTransactionHistory(itemCode: string, range: Range) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Switching item makes the bars on screen wrong outright. Switching range
  // only asks the same story at another resolution, so those stay up until the
  // new ones land rather than blinking through an empty chart.
  useEffect(() => setTransactions([]), [itemCode]);

  useEffect(() => {
    setError(null);
    if (!itemCode) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetchTransactionHistory(itemCode, range)
      .then(values => {
        if (!cancelled) setTransactions(values);
      })
      .catch(err => {
        if (cancelled) return;
        // Keeping the last range's bars up here would label a failed request as
        // a successful one, so a failure clears them and says so instead.
        setTransactions([]);
        setError(err as Error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [itemCode, range]);

  return { transactions, loading, error };
}

export function usePriceHistory(itemCode: string, range: Range) {
  const { transactions, loading, error } = useTransactionHistory(itemCode, range);
  const prices = useMemo(() => toPriceHistory(transactions), [transactions]);
  return { prices, loading, error };
}

/** Codes arrive as camelCase identifiers — "lightAmmo", "helmet1" — and the UI wants words. */
export function itemLabel(code: string): string {
  return code.replace(/([a-z])([A-Z0-9])/g, "$1 $2").replace(/^./, first => first.toUpperCase());
}
