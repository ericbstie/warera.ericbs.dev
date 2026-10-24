import type { MouseEvent } from "react";
import { navigate, pageFor, ROUTES, usePath, type PageId } from "./router";

export type NavLink = { page: PageId; href: string; label: string };

export const NAV_LINKS: NavLink[] = [
  { page: "graph", href: ROUTES.graph, label: "Graph" },
  { page: "wages", href: ROUTES.wages, label: "Wages" },
];

/**
 * The pages as plain words with room to breathe; the one you are on is lit and
 * underlined, the others brighten and pick up a faint underline on hover.
 */
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
    <nav aria-label="Pages" className="flex items-center gap-1 sm:gap-3">
      {NAV_LINKS.map(link => {
        const current = here === link.page;
        return (
          <a
            key={link.href}
            href={link.href}
            aria-current={current ? "page" : undefined}
            onClick={event => follow(event, link.href)}
            className={`relative flex min-h-11 items-center whitespace-nowrap px-5 text-base tracking-wide transition-colors after:absolute after:inset-x-5 after:bottom-1 after:h-0.5 after:rounded-full after:transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
              current
                ? "font-semibold text-ink after:bg-ink"
                : "text-muted after:bg-transparent hover:text-ink hover:after:bg-muted/60"
            }`}
          >
            {link.label}
          </a>
        );
      })}
    </nav>
  );
}
