import type { MouseEvent } from "react";
import { PAGE_COLUMN } from "./layout";
import { navigate, ROUTES, type PageId } from "./router";

type Side = "left" | "right";

/**
 * Each page links to the other. The Graph lies to the right of the Wages, so
 * each link sits on the side its arrow points to.
 */
export const PAGE_LINKS: Record<PageId, { href: string; label: string; side: Side }> = {
  wages: { href: ROUTES.graph, label: "Graph analysis", side: "right" },
  graph: { href: ROUTES.wages, label: "Wages", side: "left" },
};

function Arrow({ side }: { side: Side }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 transition-transform ${
        side === "right" ? "group-hover:translate-x-0.5" : "group-hover:-translate-x-0.5"
      }`}
    >
      <path d={side === "right" ? "M5 12h14M13 6l6 6-6 6" : "M19 12H5M11 6l-6 6 6 6"} />
    </svg>
  );
}

/** The way to the other page, as a plain label with an arrow, in the page column. */
export function PageLink({ page }: { page: PageId }) {
  const link = PAGE_LINKS[page];

  const follow = (event: MouseEvent<HTMLAnchorElement>) => {
    // A modified click means "open this somewhere else", which is the browser's
    // job; only the plain ones become an in-place page swap.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(link.href);
  };

  return (
    <nav
      aria-label="Pages"
      className={`${PAGE_COLUMN} flex ${link.side === "right" ? "justify-end" : "justify-start"}`}
    >
      <a
        href={link.href}
        onClick={follow}
        className="group flex min-h-11 items-center gap-2 whitespace-nowrap text-lg tracking-wide text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        {link.side === "left" && <Arrow side="left" />}
        {link.label}
        {link.side === "right" && <Arrow side="right" />}
      </a>
    </nav>
  );
}
