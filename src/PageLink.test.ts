import { expect, test } from "bun:test";
import { PAGE_LINKS } from "./PageLink";
import { pageFor, ROUTES, type PageId } from "./router";

test("every page links to the other one, and back", () => {
  for (const page of Object.keys(ROUTES) as PageId[]) {
    const other = pageFor(PAGE_LINKS[page].href);
    expect(other).not.toBe(page);
    expect(PAGE_LINKS[other].href).toBe(ROUTES[page]);
  }
});
