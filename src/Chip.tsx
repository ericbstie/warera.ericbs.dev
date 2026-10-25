import type { ReactNode } from "react";

/**
 * A small tinted label with an icon, drawn the way the game draws a job's
 * requirements; every chip on the site is one of these, in its own colour.
 */
export function Chip({
  tone,
  title,
  icon,
  children,
}: {
  /** The background tint and text colour, as Tailwind classes. */
  tone: string;
  title?: string;
  /** The icon's paths, on a 24-unit grid. */
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-sm font-medium tabular-nums ${tone}`}
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        width={14}
        height={14}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {icon}
      </svg>
      {children}
    </span>
  );
}
