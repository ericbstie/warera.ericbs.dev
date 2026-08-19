import { useEffect, useRef, useState, type MouseEvent } from "react";
import { navigate, pageFor, ROUTES, usePath, type PageId } from "./router";

export type NavLink = { page: PageId; href: string; label: string };

export const NAV_LINKS: NavLink[] = [
  { page: "graph", href: ROUTES.graph, label: "Graph Analysis" },
  { page: "bonuses", href: ROUTES.bonuses, label: "Production Bonuses" },
];

function MenuGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="15"
      height="15"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    >
      <path d="M2 4h12M2 8h12M2 12h12" />
    </svg>
  );
}

function Drawer({ onClose }: { onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const here = pageFor(usePath());

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    // Escape and the arrow keys should act on the drawer, not on whatever the
    // page had focused before it opened.
    panelRef.current?.focus();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const follow = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    onClose();
    // A modified click means "open this somewhere else", which is the browser's
    // job; only the plain ones become an in-place page swap.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(href);
  };

  return (
    <div
      // A black scrim would be invisible on the dark theme, so dim with the
      // page's own surface colour and let the theme decide what that is.
      style={{ background: "color-mix(in srgb, var(--surface) 84%, transparent)" }}
      className="fixed inset-0 z-40 flex justify-end"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        tabIndex={-1}
        className="drawer-in flex h-full w-72 max-w-[80vw] flex-col border-l border-edge bg-panel shadow-2xl outline-none"
      >
        <div className="flex items-center justify-between border-b border-edge px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted">Menu</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="grid h-8 w-8 place-items-center rounded border border-edge text-ink"
          >
            <svg
              viewBox="0 0 16 16"
              width="15"
              height="15"
              aria-hidden
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            >
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        <nav aria-label="Pages" className="flex flex-col p-2">
          {NAV_LINKS.map(link => {
            const current = here === link.page;
            return (
              <a
                key={link.href}
                href={link.href}
                aria-current={current ? "page" : undefined}
                onClick={event => follow(event, link.href)}
                className={`flex min-h-10 items-center rounded px-3 py-2 text-sm ${
                  current ? "bg-accent font-semibold text-on-accent" : "text-ink"
                }`}
              >
                {link.label}
              </a>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

/** Sits beside the title on a desktop; floats over the page where the row is full. */
export function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="hidden h-8 w-8 place-items-center rounded border border-edge bg-accent text-on-accent sm:grid"
      >
        <MenuGlyph />
      </button>

      {/* A phone header has no room left beside the title, so the trigger floats
          over the page within thumb reach instead. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="fixed bottom-4 right-4 z-20 grid h-12 w-12 place-items-center rounded-full border border-edge bg-accent text-on-accent shadow-lg sm:hidden"
      >
        <MenuGlyph />
      </button>

      {open && <Drawer onClose={() => setOpen(false)} />}
    </>
  );
}
