import { expect, test } from "bun:test";
import { pageFor, ROUTES } from "./router";

test("reads the page out of its path", () => {
  expect(pageFor(ROUTES.graph)).toBe("graph");
  expect(pageFor(ROUTES.wages)).toBe("wages");
});

test("a trailing slash is the same page", () => {
  expect(pageFor(`${ROUTES.graph}/`)).toBe("graph");
  expect(pageFor("//")).toBe("wages");
});

test("an unknown path falls back to the front page, the wages", () => {
  expect(pageFor("/nothing-here")).toBe("wages");
  expect(pageFor("")).toBe("wages");
});

test("the wages' old address still reaches them", () => {
  expect(pageFor("/wage-calculator")).toBe("wages");
});
