import { useEffect, useRef, useState, type ReactNode } from "react";
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
      className={`h-7 px-2.5 text-xs ${active ? "bg-accent font-semibold text-on-accent" : "bg-panel text-muted"}`}
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
      className="flex shrink-0 items-center divide-x divide-edge overflow-hidden rounded border border-edge"
    >
      {children}
    </div>
  );
}

function Divider() {
  return <span aria-hidden className="h-5 shrink-0 self-center border-l border-edge" />;
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
  // The chips live behind the button at every width: the strip stays one line
  // and scrolls, so anything as wide as four chips has to float over the chart.
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // A click anywhere outside the dropdown closes it, same as the item picker.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative border-b border-edge bg-panel">
      <div className="flex flex-nowrap items-center gap-x-2 overflow-x-auto px-2 py-2">
        <button
          type="button"
          onClick={() => setOpen(current => !current)}
          aria-expanded={open}
          aria-controls="toolbar-overlays"
          className={`flex h-7 shrink-0 items-center gap-1.5 rounded border border-edge px-2.5 text-xs ${
            overlays.length ? "bg-surface font-semibold text-ink" : "text-muted"
          }`}
        >
          Indicators
          {overlays.length > 0 && <span className="tabular-nums text-accent">{overlays.length}</span>}
          <svg viewBox="0 0 12 8" width="9" height="6" aria-hidden className={open ? "rotate-180" : ""}>
            <path d="M1 1.5 6 6.5 11 1.5" stroke="currentColor" strokeWidth="1.6" fill="none" />
          </svg>
        </button>

        <Divider />

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

        <Divider />

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
      </div>

      {/* Anchored to the bar rather than the button, which scrolls away with the strip. */}
      {open && (
        <div
          id="toolbar-overlays"
          className="absolute left-2 top-full z-20 mt-1 flex max-w-[calc(100%-1rem)] flex-wrap gap-2 rounded border border-edge bg-panel p-2 shadow-lg"
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
                    ? "border-edge bg-accent font-semibold text-on-accent"
                    : "border-edge bg-panel text-muted"
                }`}
              >
                {overlay.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
