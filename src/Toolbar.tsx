import { type ReactNode } from "react";
import { INTERVALS, RANGES, type Interval, type Range } from "./indicators";

export type Overlay = "sma5" | "sma10" | "sma20" | "vwap";

export const OVERLAYS: { id: Overlay; label: string }[] = [
  { id: "sma5", label: "SMA 5" },
  { id: "sma10", label: "SMA 10" },
  { id: "sma20", label: "SMA 20" },
  { id: "vwap", label: "VWAP" },
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

/**
 * The range says how far back the chart looks; this says how wide a candle in
 * it is. A native select is what a phone wants here, and it costs no room.
 */
function IntervalSelect({
  interval,
  onInterval,
}: {
  interval: Interval;
  onInterval: (interval: Interval) => void;
}) {
  return (
    <select
      aria-label="Candle interval"
      value={interval}
      onChange={event => onInterval(event.target.value as Interval)}
      className="h-7 shrink-0 rounded border border-edge bg-panel px-1.5 text-xs text-ink"
    >
      {INTERVALS.map(entry => (
        <option key={entry} value={entry}>
          {entry}
        </option>
      ))}
    </select>
  );
}

export function Toolbar({
  range,
  onRange,
  interval,
  onInterval,
}: {
  range: Range;
  onRange: (range: Range) => void;
  interval: Interval;
  onInterval: (interval: Interval) => void;
}) {
  return (
    <div className="border-b border-edge bg-panel">
      <div className="flex flex-nowrap items-center gap-x-2 overflow-x-auto px-2 py-2">
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

        <IntervalSelect interval={interval} onInterval={onInterval} />
      </div>
    </div>
  );
}
