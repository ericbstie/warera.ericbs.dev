import { useState, type ReactNode } from "react";
import { RANGES, type Range } from "./indicators";

export type Overlay = "sma5" | "sma10" | "sma20" | "vwap";

export const OVERLAYS: { id: Overlay; label: string }[] = [
  { id: "sma5", label: "SMA 5" },
  { id: "sma10", label: "SMA 10" },
  { id: "sma20", label: "SMA 20" },
  { id: "vwap", label: "VWAP" },
];

const VIEWS: { id: "line" | "candle"; label: string }[] = [
  { id: "line", label: "Line" },
  { id: "candle", label: "Candles" },
];

/** Selected controls read as filled *and* heavier, so the state survives a colour-blind eye. */
function Segment({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-7 px-2.5 text-xs ${active ? "bg-accent font-semibold text-white" : "bg-panel text-muted"}`}
    >
      {label}
    </button>
  );
}

function Group({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex items-center divide-x divide-edge overflow-hidden rounded border border-edge"
    >
      {children}
    </div>
  );
}

export function Toolbar({
  range,
  onRange,
  view,
  onView,
  overlays,
  onToggleOverlay,
}: {
  range: Range;
  onRange: (range: Range) => void;
  view: "line" | "candle";
  onView: (view: "line" | "candle") => void;
  overlays: Overlay[];
  onToggleOverlay: (overlay: Overlay) => void;
}) {
  // Narrow screens collapse the chips behind the button so the strip stays one
  // line; from `sm` up the chips are always on show and this only tracks the arrow.
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-edge bg-panel">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-2 gap-y-2 px-4 py-2">
        <Group label="Chart type">
          {VIEWS.map(entry => (
            <Segment
              key={entry.id}
              label={entry.label}
              active={view === entry.id}
              onClick={() => onView(entry.id)}
            />
          ))}
        </Group>

        <span aria-hidden className="hidden h-5 self-center border-l border-edge sm:block" />

        <Group label="Date range">
          {RANGES.map(entry => (
            <Segment
              key={entry}
              label={entry}
              active={range === entry}
              onClick={() => onRange(entry)}
            />
          ))}
        </Group>

        <button
          type="button"
          onClick={() => setOpen(current => !current)}
          aria-expanded={open}
          className={`flex h-7 items-center gap-1.5 rounded border border-edge px-2.5 text-xs ${
            overlays.length ? "bg-surface font-semibold text-ink" : "text-muted"
          }`}
        >
          Indicators
          {overlays.length > 0 && <span className="tabular-nums text-accent">{overlays.length}</span>}
          <svg
            viewBox="0 0 12 8"
            width="9"
            height="6"
            aria-hidden
            className={`sm:hidden ${open ? "rotate-180" : ""}`}
          >
            <path d="M1 1.5 6 6.5 11 1.5" stroke="currentColor" strokeWidth="1.6" fill="none" />
          </svg>
        </button>

        <div
          className={`${open ? "flex" : "hidden"} flex-nowrap items-center gap-x-2 overflow-x-auto sm:flex`}
        >
          {OVERLAYS.map(overlay => {
            const active = overlays.includes(overlay.id);
            return (
              <button
                key={overlay.id}
                type="button"
                onClick={() => onToggleOverlay(overlay.id)}
                aria-pressed={active}
                className={`h-7 shrink-0 rounded border px-2.5 text-xs ${
                  active
                    ? "border-edge bg-accent font-semibold text-white"
                    : "border-edge bg-panel text-muted"
                }`}
              >
                {overlay.label}
              </button>
            );
          })}
        </div>

      </div>
    </div>
  );
}
