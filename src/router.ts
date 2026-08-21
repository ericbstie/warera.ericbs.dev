import { useEffect, useState } from "react";

export type PageId = "graph" | "bonuses" | "wages";

export const ROUTES: Record<PageId, string> = {
  graph: "/",
  bonuses: "/production-bonuses",
  wages: "/wage-calculator",
};

/** The server hands the app back for any path, so an unknown one lands on the chart. */
export function pageFor(path: string): PageId {
  const here = path.replace(/\/+$/, "");
  const match = (Object.keys(ROUTES) as PageId[]).find(page => ROUTES[page] === here);
  return match ?? "graph";
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
