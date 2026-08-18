import { expect, test } from "bun:test";
import { measurementOf, TOOLS, toolLabel, type Drawing } from "./tools";

const span = (fromPrice: number, toPrice: number, fromIndex = 2, toIndex = 9): Extract<Drawing, { kind: "measure" }> => ({
  kind: "measure",
  fromIndex,
  toIndex,
  fromPrice,
  toPrice,
});

test("measures a rise across bars", () => {
  const result = measurementOf(span(0.16, 0.167));

  expect(result.change).toBeCloseTo(0.007, 10);
  expect(result.changePct).toBeCloseTo(4.375, 10);
  expect(result.bars).toBe(7);
  expect(result.rising).toBe(true);
});

test("measures a fall, counting bars in either direction", () => {
  const result = measurementOf(span(0.2, 0.15, 9, 2));

  expect(result.change).toBeCloseTo(-0.05, 10);
  expect(result.changePct).toBeCloseTo(-25, 10);
  expect(result.bars).toBe(7);
  expect(result.rising).toBe(false);
});

test("reports no percentage rather than infinity from a zero start", () => {
  expect(measurementOf(span(0, 0.5)).changePct).toBe(0);
});

test("names every tool, and falls back for an unknown one", () => {
  expect(TOOLS.map(tool => tool.id)).toEqual(["crosshair", "line", "measure"]);
  expect(TOOLS.every(tool => tool.label && tool.hint)).toBe(true);
  expect(toolLabel("measure")).toBe("Measure");
  expect(toolLabel("nope" as never)).toBe("Crosshair");
});
