import type { MouseEvent } from "react";
import { navigate, pageFor, ROUTES, usePath, type PageId } from "./router";

export type NavLink = { page: PageId; href: string; label: string };

export const NAV_LINKS: NavLink[] = [
  { page: "graph", href: ROUTES.graph, label: "Graph" },
  { page: "wages", href: ROUTES.wages, label: "Wages" },
];

/** A segmented switch between the pages; the lit half is where you are. */
export function PageToggle() {
  const here = pageFor(usePath());

  const follow = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    // A modified click means "open this somewhere else", which is the browser's
    // job; only the plain ones become an in-place page swap.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(href);
  };

  return (
    <nav aria-label="Pages" className="flex rounded-md border border-edge bg-surface p-0.5">
      {NAV_LINKS.map(link => {
        const current = here === link.page;
        return (
          <a
            key={link.href}
            href={link.href}
            aria-current={current ? "page" : undefined}
            onClick={event => follow(event, link.href)}
            className={`flex min-h-8 items-center whitespace-nowrap rounded px-3 py-1 text-sm transition-colors ${
              current ? "bg-accent font-semibold text-on-accent" : "text-muted hover:text-ink"
            }`}
          >
            {link.label}
          </a>
        );
      })}
    </nav>
  );
}
