// The chart keeps a stretch of empty room past its last bar, so a level or a
// measurement can be drawn where the price hasn't been yet. Panning into it is
// what these work out: how far right the view may go, and what date a column
// carries once it is past the end of the record.

import { isTimestamp, parseBarDate } from "./stats";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A window's worth of room ahead: 30 days of history scroll on into the next
 * 30. The view spans `count - 1` gaps, so that is the reach as well.
 */
export function futureSpan(count: number): number {
  return Math.max(count - 1, 0);
}

/** The rightmost index the view can reach — the record, and the same again. */
export function lastIndex(count: number): number {
  return Math.max(count - 1, 0) + futureSpan(count);
}

/** Offset 0 puts the newest bar hard against the right edge, which is where the chart opens. */
export function clampOffset(offset: number, count: number): number {
  if (!Number.isFinite(offset)) return 0;
  return Math.min(Math.max(offset, 0), futureSpan(count));
}

/**
 * How far apart bars sit, by the middle gap rather than the mean: a record with
 * a poll missing, or a day the item didn't trade, shouldn't stretch the future.
 */
export function stepMs(dates: string[]): number {
  const gaps: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    const gap = parseBarDate(dates[i]!).getTime() - parseBarDate(dates[i - 1]!).getTime();
    if (Number.isFinite(gap) && gap > 0) gaps.push(gap);
  }
  if (gaps.length === 0) return DAY_MS;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)]!;
}

/**
 * The date a column stands for, projected past the end of the record at the
 * spacing the record kept — and in its own format, so a daily chart labels the
 * future with days and an intraday one with times.
 */
export function barDateAt(dates: string[], index: number): string {
  const inRecord = dates[index];
  if (inRecord !== undefined) return inRecord;

  const last = dates[dates.length - 1];
  if (last === undefined) return "";
  const from = parseBarDate(last);
  if (Number.isNaN(from.getTime())) return "";

  const projected = new Date(from.getTime() + (index - dates.length + 1) * stepMs(dates));
  return isTimestamp(last) ? projected.toISOString() : projected.toISOString().slice(0, 10);
}
