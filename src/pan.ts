// The chart keeps a stretch of empty room past its last bar, so a level or a
// measurement can be drawn where the price hasn't been yet. Panning into it is
// what these work out: how far right the view may go, and what date a column
// carries once it is past the end of the record — and, since a pinch decides how
// much of the record the view holds, what the limits of that are.

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

/**
 * Offset 0 puts the newest bar hard against the right edge, which is where the
 * chart opens. Zoomed in the view holds fewer gaps than the record, so there is
 * that much more of it to scroll through before the far edge is reached.
 */
export function clampOffset(offset: number, count: number, span = futureSpan(count)): number {
  if (!Number.isFinite(offset)) return 0;
  return Math.min(Math.max(offset, 0), Math.max(lastIndex(count) - span, 0));
}

/** Fewer than this on screen and a chart is a handful of bars floating in space. */
const MIN_VISIBLE_GAPS = 4;

/**
 * How many gaps the view spans. Zooming out stops at the whole record — the
 * chart already opens there — and zooming in stops a few bars short of one.
 */
export function clampSpan(span: number, count: number): number {
  const whole = futureSpan(count);
  if (!Number.isFinite(span)) return whole;
  return Math.min(Math.max(span, Math.min(MIN_VISIBLE_GAPS, whole)), whole);
}

/** How far the price scale may be pulled: 1 is the whole range in the pane. */
const MAX_STRETCH = 10;

export function clampStretch(stretch: number): number {
  if (!Number.isFinite(stretch)) return 1;
  return Math.min(Math.max(stretch, 1), MAX_STRETCH);
}

/**
 * How far the price window may be pushed off where the bars put it, counted in
 * windows: three quarters leaves a good stretch of empty room above or below to
 * draw a level in, and still keeps a corner of the range on the pane.
 */
const MAX_SHIFT = 0.75;

export function clampShift(shift: number): number {
  if (!Number.isFinite(shift)) return 0;
  return Math.min(Math.max(shift, -MAX_SHIFT), MAX_SHIFT);
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
