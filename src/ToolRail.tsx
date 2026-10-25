import { type ReactElement } from "react";
import { TOOLS, type ToolId } from "./tools";

const ICONS: Record<ToolId, ReactElement> = {
  crosshair: (
    <>
      <path d="M8 1.5v13M1.5 8h13" />
      <circle cx="8" cy="8" r="2.5" />
    </>
  ),
  line: (
    <>
      <path d="M2.5 13.5 13.5 2.5" />
      <circle cx="2.5" cy="13.5" r="1.5" />
      <circle cx="13.5" cy="2.5" r="1.5" />
    </>
  ),
  measure: (
    <>
      <rect x="2" y="3.5" width="12" height="9" rx="1" />
      <path d="M8 3.5v9" />
    </>
  ),
};

function Glyph({ children }: { children: ReactElement }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="18"
      height="18"
      aria-hidden
      fill="none"
      stroke="currentColor"
      // 1.5px once drawn, the weight of every icon on the site.
      strokeWidth="1.35"
      strokeLinecap="round"
    >
      {children}
    </svg>
  );
}

export function ToolRail({
  tool,
  onTool,
  onClear,
  hasDrawings,
}: {
  tool: ToolId;
  onTool: (tool: ToolId) => void;
  onClear: () => void;
  hasDrawings: boolean;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Chart tools"
      className="flex shrink-0 items-center gap-1"
    >
      {TOOLS.map(({ id, label, hint }) => {
        const active = tool === id;
        return (
          <button
            key={id}
            type="button"
            title={hint}
            aria-label={label}
            aria-pressed={active}
            onClick={() => onTool(id)}
            className={`grid h-10 w-9 place-items-center border-b-2 ${
              active ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            <Glyph>{ICONS[id]}</Glyph>
          </button>
        );
      })}

      <button
        type="button"
        title="Clear what's drawn on the chart"
        aria-label="Clear drawings"
        onClick={onClear}
        disabled={!hasDrawings}
        className="grid h-10 w-9 place-items-center text-muted hover:text-ink disabled:opacity-40 disabled:hover:text-muted"
      >
        <Glyph>
          <path d="M3.5 4.5h9M6 4.5V3h4v1.5M5 4.5l.6 8h4.8l.6-8" />
        </Glyph>
      </button>
    </div>
  );
}

/** Lets the chart and its controls fill the page under the header, and back. */
export function FullscreenButton({ full, onToggle }: { full: boolean; onToggle: () => void }) {
  const label = full ? "Exit full screen" : "Full screen";
  return (
    <button
      type="button"
      title={`${label} (F)`}
      aria-label={label}
      aria-pressed={full}
      onClick={onToggle}
      className="grid h-10 w-9 shrink-0 place-items-center text-muted hover:text-ink"
    >
      <Glyph>
        {full ? (
          <path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4" />
        ) : (
          <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" />
        )}
      </Glyph>
    </button>
  );
}
