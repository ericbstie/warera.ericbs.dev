import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";

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
  const match = (Object.keys(ROUTES) as PageId[]).find((page) => ROUTES[page] === here);
  return match ?? "wages";
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

/** Everything that reads the path, told together so one transition covers them all. */
const watchers = new Set<() => void>();

function announce() {
  for (const watcher of watchers) watcher();
}

/**
 * Swaps the page inside a view transition where the browser has them, so the
 * old page fades into the new one rather than blinking out. The browser
 * snapshots the page on either side of the update, so the new page has to be
 * in the DOM by the time the update returns, which a React render only is
 * under flushSync. Without them the page simply swaps.
 */
function swap(update: () => void) {
  if (!document.startViewTransition) return update();
  document.startViewTransition(() => flushSync(update));
}

function onPopState(event: PopStateEvent) {
  // A swipe back on a phone already slides the old page away; fading it out
  // as well would play the change twice.
  if (event.hasUAVisualTransition) announce();
  else swap(announce);
}

function subscribe(watcher: () => void) {
  if (!watchers.size) window.addEventListener("popstate", onPopState);
  watchers.add(watcher);
  return () => {
    watchers.delete(watcher);
    if (!watchers.size) window.removeEventListener("popstate", onPopState);
  };
}

/**
 * `pushState` changes the URL without telling anyone, so the push is announced
 * here to let the page re-render. Like following a real link, the new page
 * starts at its top rather than wherever the old one was scrolled to.
 */
export function navigate(to: string) {
  if (to === window.location.pathname) return;
  window.history.pushState(null, "", to);
  swap(() => {
    announce();
    window.scrollTo(0, 0);
  });
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname);
}
