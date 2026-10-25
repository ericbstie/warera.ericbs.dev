import { Caret } from "./Caret";
import { INTERVALS, RANGES, type Interval, type Range } from "./indicators";

export type Overlay = "sma5" | "sma10" | "sma20" | "vwap";

export const OVERLAYS: { id: Overlay; label: string }[] = [
  { id: "sma5", label: "SMA 5" },
  { id: "sma10", label: "SMA 10" },
  { id: "sma20", label: "SMA 20" },
  { id: "vwap", label: "VWAP" },
];

/**
 * Selected controls read as heavier *and* underlined, so the state survives a
 * colour-blind eye without a box drawn around every button.
 */
function Segment({
  label,
  active,
  disabled = false,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      disabled={disabled}
      className={`h-10 border-b-2 px-2 text-base disabled:opacity-35 sm:px-2.5 sm:text-lg ${
        active ? "border-ink font-semibold text-ink" : "border-transparent text-muted enabled:hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

/** What stands between one cluster of controls and the next in the chart's row. */
export function Divider({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`h-5 w-0.5 shrink-0 rounded-full bg-edge ${className}`} />;
}

/**
 * The range says how far back the chart looks; this says how wide a candle in
 * it is. A native select is what a phone wants here, and it costs no room; the
 * browser's own arrow is swapped for the item picker's caret, so the two
 * dropdowns in the row look like one kind of thing.
 */
function IntervalSelect({
  interval,
  onInterval,
}: {
  interval: Interval;
  onInterval: (interval: Interval) => void;
}) {
  return (
    <span className="group relative flex h-10 shrink-0 items-center">
      <select
        aria-label="Candle interval"
        value={interval}
        onChange={event => onInterval(event.target.value as Interval)}
        className="h-10 cursor-pointer appearance-none bg-transparent pl-2 pr-5 [field-sizing:content] text-base text-ink sm:text-lg [&>option]:bg-panel"
      >
        {INTERVALS.map(entry => (
          <option key={entry} value={entry}>
            {entry}
          </option>
        ))}
      </select>
      <Caret className="pointer-events-none absolute right-1 group-hover:text-ink" />
    </span>
  );
}

export function Toolbar({
  range,
  ranges,
  onRange,
  interval,
  onInterval,
}: {
  range: Range;
  /** The ranges the chosen interval can fill; the rest show but can't be picked. */
  ranges: Range[];
  onRange: (range: Range) => void;
  interval: Interval;
  onInterval: (interval: Interval) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-x-1">
      <div role="group" aria-label="Date range" className="flex items-center">
        {RANGES.map(entry => (
          <Segment
            key={entry}
            label={entry}
            active={range === entry}
            disabled={!ranges.includes(entry)}
            onClick={() => onRange(entry)}
          />
        ))}
      </div>

      <IntervalSelect interval={interval} onInterval={onInterval} />
    </div>
  );
}
