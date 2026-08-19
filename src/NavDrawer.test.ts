import { expect, test } from "bun:test";
import { NAV_LINKS } from "./NavDrawer";

test("the drawer lists the graph page and nothing else yet", () => {
  expect(NAV_LINKS).toEqual([{ href: "/", label: "Graph Analysis" }]);
});

test("every link carries somewhere to go and a name to show", () => {
  for (const link of NAV_LINKS) {
    expect(link.href.startsWith("/")).toBe(true);
    expect(link.label.trim().length).toBeGreaterThan(0);
  }
});
