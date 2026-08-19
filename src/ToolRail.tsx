import { type ReactElement } from "react";
import { TOOLS, type ToolId } from "./tools";

const ICONS: Record<ToolId, ReactElement> = {
  crosshair: (
    <>
      <path d="M8 1.5v13M1.5 8h13" />
      <circle cx="8" cy="8" r="2.5" />
    </>
  ),
  line: <path d="M1.5 8h13M4 5.5v5M12 5.5v5" />,
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
      width="15"
      height="15"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
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
      aria-orientation="vertical"
      // A rail down the side would eat a third of a phone screen, so below `sm`
      // the same buttons run across the top instead.
      className="flex shrink-0 flex-row gap-1 border-b border-edge bg-panel p-1 sm:flex-col sm:border-b-0 sm:border-r"
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
            className={`grid h-8 w-8 place-items-center rounded ${
              active ? "bg-accent text-on-accent" : "text-muted"
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
        className="grid h-8 w-8 place-items-center rounded text-muted disabled:opacity-40 sm:mt-auto"
      >
        <Glyph>
          <path d="M3.5 4.5h9M6 4.5V3h4v1.5M5 4.5l.6 8h4.8l.6-8" />
        </Glyph>
      </button>
    </div>
  );
}
