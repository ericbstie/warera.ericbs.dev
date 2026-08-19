import { Ticker } from "./Ticker";
import { TitleBar } from "./TitleBar";
import { itemIcon, itemLabel, type MarketItem } from "./hooks";
import { formatCompact, formatDay, formatPrice, type Quote } from "./stats";

/** The upstream config groups items by a bare `type`; the picker shows them under headings. */
const GROUPS: { type: string; label: string }[] = [
  { type: "raw", label: "Resources" },
  { type: "product", label: "Products" },
  { type: "weapon", label: "Weapons" },
  { type: "equipment", label: "Equipment" },
  { type: "case", label: "Cases" },
];

function groupLabel(type: string | undefined) {
  return GROUPS.find(group => group.type === type)?.label ?? "Market";
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-xs text-muted">
      {label} <span className="font-medium tabular-nums text-ink">{value}</span>
    </span>
  );
}

function ItemPicker({
  items,
  selected,
  onSelect,
}: {
  items: MarketItem[];
  selected: string;
  onSelect: (code: string) => void;
}) {
  const current = items.find(item => item.code === selected);
  const listed = GROUPS.map(group => ({
    ...group,
    codes: items.filter(item => item.type === group.type).map(item => item.code),
  })).filter(group => group.codes.length);
  const ungrouped = items.filter(item => !GROUPS.some(group => group.type === item.type));

  return (
    <div className="relative flex min-w-[13rem] flex-1 items-center gap-2.5 rounded border border-edge bg-surface px-3 py-1.5 sm:flex-none">
      {selected && <img src={itemIcon(selected)} alt="" width={28} height={28} className="shrink-0" />}
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-semibold">{itemLabel(selected) || "Select an item"}</p>
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted">{groupLabel(current?.type)}</p>
      </div>
      <svg viewBox="0 0 12 8" width="11" height="8" aria-hidden className="ml-auto shrink-0 fill-muted">
        <path d="M1 1.5 6 6.5 11 1.5" stroke="currentColor" strokeWidth="1.6" fill="none" />
      </svg>
      <select
        value={selected}
        onChange={event => onSelect(event.target.value)}
        aria-label="Traded item"
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        {listed.map(group => (
          <optgroup key={group.type} label={group.label}>
            {group.codes.map(code => (
              <option key={code} value={code}>
                {itemLabel(code)}
              </option>
            ))}
          </optgroup>
        ))}
        {ungrouped.map(item => (
          <option key={item.code} value={item.code}>
            {itemLabel(item.code)}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Header({
  items,
  selected,
  onSelect,
  quote,
  loading,
}: {
  items: MarketItem[];
  selected: string;
  onSelect: (code: string) => void;
  quote: Quote | null;
  loading: boolean;
}) {
  const rising = (quote?.change ?? 0) >= 0;
  const sign = rising ? "+" : "";
  const tone = rising ? "text-up" : "text-down";

  return (
    <header className="sticky top-0 z-20 shrink-0 border-b border-edge bg-panel">
      <div className="flex flex-col gap-y-3 px-3 pb-3 pt-4 sm:px-4">
        <TitleBar />

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <Ticker items={items.map(item => item.code)} onSelect={onSelect} />
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <ItemPicker items={items} selected={selected} onSelect={onSelect} />

          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-2xl font-semibold tabular-nums">
                {quote ? formatPrice(quote.price) : loading ? "…" : "—"}
              </span>
              {quote && (
                <span
                  className={`rounded px-1.5 py-0.5 text-xs font-medium tabular-nums ${tone}`}
                  style={{ background: `color-mix(in srgb, currentColor 14%, transparent)` }}
                >
                  {sign}
                  {formatPrice(quote.change)} ({sign}
                  {quote.changePct.toFixed(2)}%)
                </span>
              )}
            </div>
            {quote && (
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-xs text-muted">{formatDay(quote.date)}</span>
                <Stat label="Vol" value={formatCompact(quote.volume)} />
                <Stat label="VWAP" value={quote.vwap === null ? "—" : formatPrice(quote.vwap)} />
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
