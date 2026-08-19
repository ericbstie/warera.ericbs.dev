import { isFiniteNumber, type Transaction } from "./hooks";

export type Quote = {
  date: string;
  price: number;
  change: number;
  changePct: number;
  volume: number;
  vwap: number | null;
  open: number;
  high: number;
  low: number;
  close: number;
};

const COMPACT_UNITS = [
  { limit: 1e12, suffix: "T" },
  { limit: 1e9, suffix: "B" },
  { limit: 1e6, suffix: "M" },
  { limit: 1e3, suffix: "k" },
];

function finite(value: number): number {
  return isFiniteNumber(value) ? value : 0;
}

/** A previous price of 0 makes every move an infinite percentage; the header reads better flat. */
function percentChange(change: number, base: number): number {
  if (base === 0) return 0;
  const percent = (change / base) * 100;
  return Number.isFinite(percent) ? percent : 0;
}

/** null means "no price to average", which the header can label; Infinity would render as "Infinity". */
function volumeWeighted(totalValue: number, totalQuantity: number): number | null {
  if (totalQuantity === 0) return null;
  const vwap = totalValue / totalQuantity;
  return Number.isFinite(vwap) ? vwap : null;
}

export function quoteFor(transactions: Transaction[]): Quote | null {
  const last = transactions[transactions.length - 1];
  if (!last) return null;

  const close = finite(last.avgValue);
  // With a single day there is nothing to compare against, so the day opens
  // where it closes and reports a flat change rather than a fall from zero.
  const previous = transactions.length > 1 ? finite(transactions[transactions.length - 2]!.avgValue) : close;
  const change = close - previous;

  return {
    date: last.valueAt,
    price: close,
    change,
    changePct: percentChange(change, previous),
    volume: finite(last.totalQuantity),
    vwap: volumeWeighted(finite(last.totalValue), finite(last.totalQuantity)),
    open: previous,
    high: Math.max(previous, close),
    low: Math.min(previous, close),
    close,
  };
}

export function windowQuote(transactions: Transaction[]): Quote | null {
  const first = transactions[0];
  const last = transactions[transactions.length - 1];
  if (!first || !last) return null;

  const open = finite(first.avgValue);
  const close = finite(last.avgValue);
  const change = close - open;

  let high = open;
  let low = open;
  let totalValue = 0;
  let totalQuantity = 0;
  for (const transaction of transactions) {
    const price = finite(transaction.avgValue);
    if (price > high) high = price;
    if (price < low) low = price;
    totalValue += finite(transaction.totalValue);
    totalQuantity += finite(transaction.totalQuantity);
  }

  return {
    date: last.valueAt,
    price: close,
    change,
    changePct: percentChange(change, open),
    volume: totalQuantity,
    vwap: volumeWeighted(totalValue, totalQuantity),
    open,
    high,
    low,
    close,
  };
}

export function formatPrice(value: number, decimals = 3): string {
  const places = Math.min(100, Math.max(0, Math.trunc(finite(decimals))));
  return finite(value).toFixed(places);
}

export function formatCompact(value: number): string {
  const amount = finite(value);
  const magnitude = Math.abs(amount);
  const unit = COMPACT_UNITS.find(u => magnitude >= u.limit);
  const scaled = unit ? amount / unit.limit : amount;
  return trimTrailingZeros(scaled.toFixed(2)) + (unit?.suffix ?? "");
}

function trimTrailingZeros(value: string): string {
  const trimmed = value.includes(".") ? value.replace(/\.?0+$/, "") : value;
  // Rounding a tiny negative to two places leaves "-0", which reads as a typo.
  return trimmed === "-0" ? "0" : trimmed;
}

/**
 * A daily record is dated `2026-08-19`; a 15-minute one carries the whole
 * timestamp. Which of the two a bar is decides how it wants to be labelled.
 */
export function isTimestamp(at: string): boolean {
  return at.includes("T");
}

/** Both resolutions are kept in UTC, so a bar is never labelled with a day it isn't in. */
export function parseBarDate(at: string): Date {
  return new Date(isTimestamp(at) ? at : `${at}T00:00:00Z`);
}

export function formatTime(at: string): string {
  const parsed = parseBarDate(at);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
}

export function formatDay(date: string): string {
  const parsed = parseBarDate(date);
  if (Number.isNaN(parsed.getTime())) return ""; // an unparseable date reads better as blank than as "Invalid Date"
  // Pinned to en-GB so the label stays "9 Aug 2026" rather than following the viewer's locale.
  const day = parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return isTimestamp(date) ? `${day}, ${formatTime(date)}` : day;
}
