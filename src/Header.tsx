import { useEffect, useRef, useState } from "react";
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

export function ItemPicker({
  items,
  selected,
  onSelect,
}: {
  items: MarketItem[];
  selected: string;
  onSelect: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const current = items.find(item => item.code === selected);
  const listed = GROUPS.map(group => ({
    ...group,
    codes: items.filter(item => item.type === group.type).map(item => item.code),
  })).filter(group => group.codes.length);
  const ungrouped = items.filter(item => !GROUPS.some(group => group.type === item.type));

  // A click anywhere outside the picker closes it, same as a native <select>.
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

  const choose = (code: string) => {
    onSelect(code);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative min-w-[13rem] flex-1 sm:flex-none">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Traded item"
        className="flex w-full items-center gap-2.5 rounded border border-edge bg-surface px-3 py-1.5 text-left"
      >
        {selected && <img src={itemIcon(selected)} alt="" width={28} height={28} className="shrink-0" />}
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold">{itemLabel(selected) || "Select an item"}</p>
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted">{groupLabel(current?.type)}</p>
        </div>
        <svg viewBox="0 0 12 8" width="11" height="8" aria-hidden className="ml-auto shrink-0 fill-muted">
          <path d="M1 1.5 6 6.5 11 1.5" stroke="currentColor" strokeWidth="1.6" fill="none" />
        </svg>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Traded item"
          className="absolute left-0 top-full z-30 mt-1 max-h-80 w-full min-w-[16rem] overflow-y-auto rounded border border-edge bg-panel py-1 shadow-lg"
        >
          {listed.map(group => (
            <li key={group.type}>
              <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                {group.label}
              </p>
              <ul>
                {group.codes.map(code => (
                  <ItemOption key={code} code={code} selected={code === selected} onSelect={choose} />
                ))}
              </ul>
            </li>
          ))}
          {ungrouped.length > 0 && (
            <ul>
              {ungrouped.map(item => (
                <ItemOption
                  key={item.code}
                  code={item.code}
                  selected={item.code === selected}
                  onSelect={choose}
                />
              ))}
            </ul>
          )}
        </ul>
      )}
    </div>
  );
}

function ItemOption({
  code,
  selected,
  onSelect,
}: {
  code: string;
  selected: boolean;
  onSelect: (code: string) => void;
}) {
  return (
    <li
      role="option"
      aria-selected={selected}
      onClick={() => onSelect(code)}
      className={`flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-sm ${
        selected ? "bg-accent text-on-accent" : "text-ink hover:bg-surface"
      }`}
    >
      <img src={itemIcon(code)} alt="" width={20} height={20} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{itemLabel(code)}</span>
    </li>
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
