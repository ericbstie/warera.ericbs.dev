import { useEffect, useState } from "react";

export type PageId = "graph" | "wages";

export const ROUTES: Record<PageId, string> = {
  wages: "/",
  graph: "/graph",
};

/**
 * The server hands the app back for any path, so an unknown one lands on the
 * front page, the wages. That includes /wage-calculator, where the wages lived
 * before they were the front page, so old links still reach them.
 */
export function pageFor(path: string): PageId {
  const here = path.replace(/\/+$/, "") || "/";
  const match = (Object.keys(ROUTES) as PageId[]).find(page => ROUTES[page] === here);
  return match ?? "wages";
}

/** The Graph page opened on one item, for a link from a page that can't chart it itself. */
export function graphOf(itemCode: string): string {
  return `${ROUTES.graph}?${new URLSearchParams({ item: itemCode })}`;
}

/**
 * The item a link asked the Graph page to open on, read once. The query is
 * dropped from the address straight after, since picking another item doesn't
 * keep it up to date.
 */
export function takeLinkedItem(): string {
  const params = new URLSearchParams(window.location.search);
  const item = params.get("item") ?? "";
  if (item) window.history.replaceState(null, "", window.location.pathname);
  return item;
}

/**
 * `pushState` alone changes the URL without telling anyone, and only `popstate`
 * reaches a listener. Announcing the push is what lets the page re-render.
 */
export function navigate(to: string) {
  if (to === window.location.pathname) return;
  window.history.pushState(null, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function usePath(): string {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return path;
}
