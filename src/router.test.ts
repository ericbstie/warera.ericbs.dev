import { expect, test } from "bun:test";
import { pageFor, ROUTES } from "./router";

test("reads the page out of its path", () => {
  expect(pageFor(ROUTES.graph)).toBe("graph");
  expect(pageFor(ROUTES.bonuses)).toBe("bonuses");
});

test("a trailing slash is the same page", () => {
  expect(pageFor(`${ROUTES.bonuses}/`)).toBe("bonuses");
});

test("an unknown path falls back to the chart the server just served", () => {
  expect(pageFor("/nothing-here")).toBe("graph");
  expect(pageFor("")).toBe("graph");
});
