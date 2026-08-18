import { expect, test } from "bun:test";
import { OVERLAYS, type Overlay } from "./Toolbar";

test("OVERLAYS lists the four chart overlays in order", () => {
  const ids: Overlay[] = ["sma5", "sma10", "sma20", "vwap"];
  expect(OVERLAYS.map(overlay => overlay.id)).toEqual(ids);
});

test("every overlay carries a label to put on its chip", () => {
  for (const overlay of OVERLAYS) {
    expect(overlay.label.trim().length).toBeGreaterThan(0);
  }
});
