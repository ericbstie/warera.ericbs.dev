import { expect, test } from "bun:test";
import { isTheme, parseTheme } from "./theme";

test("recognises the two themes", () => {
  expect(isTheme("dark")).toBe(true);
  expect(isTheme("light")).toBe(true);
  expect(isTheme("sepia")).toBe(false);
});

test("falls back to dark for anything unrecognised", () => {
  expect(parseTheme(undefined)).toBe("dark");
  expect(parseTheme("")).toBe("dark");
  expect(parseTheme("sepia")).toBe("dark");
  expect(parseTheme("light")).toBe("light");
});
