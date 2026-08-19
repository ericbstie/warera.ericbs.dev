import { expect, test } from "bun:test";
import { NAV_LINKS } from "./NavDrawer";
import { pageFor } from "./router";

test("the drawer lists both pages", () => {
  expect(NAV_LINKS.map(link => link.label)).toEqual(["Graph Analysis", "Production Bonuses"]);
});

test("every link goes where it says it does", () => {
  for (const link of NAV_LINKS) {
    expect(link.href.startsWith("/")).toBe(true);
    expect(pageFor(link.href)).toBe(link.page);
    expect(link.label.trim().length).toBeGreaterThan(0);
  }
});
