import { expect, test } from "bun:test";
import { barDateAt, clampOffset, futureSpan, lastIndex, stepMs } from "./pan";

const days = (count: number) =>
  Array.from({ length: count }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));

test("reaches one window past the record, and no further", () => {
  expect(futureSpan(30)).toBe(29);
  expect(lastIndex(30)).toBe(58);
  expect(clampOffset(40, 30)).toBe(29);
  expect(clampOffset(-5, 30)).toBe(0);
  expect(clampOffset(NaN, 30)).toBe(0);
});

test("has nowhere to scroll without at least two bars", () => {
  expect(futureSpan(1)).toBe(0);
  expect(lastIndex(1)).toBe(0);
  expect(lastIndex(0)).toBe(0);
  expect(clampOffset(3, 1)).toBe(0);
});

test("takes the middle gap, so a missing bar doesn't stretch the future", () => {
  expect(stepMs(["2026-01-01", "2026-01-02", "2026-01-09", "2026-01-10"])).toBe(24 * 60 * 60 * 1000);
  expect(stepMs(["2026-01-01T00:00:00Z", "2026-01-01T00:15:00Z", "2026-01-01T00:30:00Z"])).toBe(15 * 60 * 1000);
  expect(stepMs(["2026-01-01"])).toBe(24 * 60 * 60 * 1000);
  expect(stepMs([])).toBe(24 * 60 * 60 * 1000);
});

test("labels the future in the record's own format", () => {
  const dates = days(3); // 1st, 2nd, 3rd of January
  expect(barDateAt(dates, 1)).toBe("2026-01-02");
  expect(barDateAt(dates, 3)).toBe("2026-01-04");
  expect(barDateAt(dates, 5)).toBe("2026-01-06");

  const polls = ["2026-01-01T00:00:00.000Z", "2026-01-01T00:15:00.000Z"];
  expect(barDateAt(polls, 3)).toBe("2026-01-01T00:45:00.000Z");
});

test("has no date to project without a record", () => {
  expect(barDateAt([], 4)).toBe("");
  expect(barDateAt(["not a date"], 4)).toBe("");
});
