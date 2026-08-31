import { useEffect, useMemo, useRef, useState } from "react";
import { ItemPicker } from "./Header";
import { itemIcon, itemLabel, useItems } from "./hooks";
import { ItemListError, Panel } from "./Panel";
import { useSettlementData, type Country } from "./settlement";
import { formatPrice } from "./stats";
import { TitleBar } from "./TitleBar";
import {
  isProducible,
  rankPlacements,
  useWageData,
  wageFor,
  type Placement,
  type Region,
  type Wage,
} from "./wages";

const TOP_PLACEMENTS = 10;

function percent(value: number, sign = "") {
  return `${sign}${Number(value.toFixed(2))}%`;
}

/** The four numbers that answer the page, in one card rather than five. */
function WageSummary({ wage }: { wage: Wage }) {
  const rows: { label: string; value: string; note?: string; tone?: string }[] = [
    { label: "Sale price", value: formatPrice(wage.salePrice) },
    { label: "Production bonus", value: percent(wage.bonus.total, "+") },
    { label: "Wage", value: formatPrice(wage.posted) },
    {
      label: "Wage after taxes",
      value: formatPrice(wage.afterTax),
      note: `(${percent(wage.incomeTax)} tax)`,
      tone: "var(--up)",
    },
  ];

  return (
    <div className="rounded border border-edge bg-panel px-6 py-6">
      <dl className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4 lg:grid-cols-1">
        {rows.map(row => (
          <div key={row.label}>
            <dt className="text-xs tracking-wide text-muted">{row.label}</dt>
            <dd className="flex flex-wrap items-baseline gap-1.5 pt-1.5">
              <span className="text-base font-semibold tabular-nums" style={{ color: row.tone }}>
                {row.value}
              </span>
              {row.note && <span className="text-xs tabular-nums text-muted">{row.note}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Where the bonus came from, so a surprising total can be argued with. */
function BonusBreakdown({ wage }: { wage: Wage }) {
  const parts = [
    { label: "Strategic", value: wage.bonus.strategic },
    { label: "Ruling party", value: wage.bonus.ethic },
    { label: "Deposit", value: wage.bonus.deposit },
  ].filter(part => part.value > 0);

  if (!parts.length) return <p className="text-xs text-muted">No bonus applies here.</p>;

  return (
    <div className="flex flex-wrap gap-2">
      {parts.map(part => (
        <span key={part.label} className="rounded border border-edge px-2.5 py-1 text-xs text-muted">
          {part.label} <span className="font-medium tabular-nums text-ink">{percent(part.value, "+")}</span>
        </span>
      ))}
    </div>
  );
}

type Option = { region: Region; country: Country; wage: Wage };

function LocationPicker({
  options,
  selected,
  onSelect,
}: {
  options: Option[];
  selected: string;
  onSelect: (regionId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  // A click anywhere outside the picker closes it, same as the item one.
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

  const current = options.find(option => option.region.id === selected);
  const needle = filter.trim().toLowerCase();
  const listed = needle
    ? options.filter(option => `${option.region.name} ${option.country.name}`.toLowerCase().includes(needle))
    : options;

  const choose = (regionId: string) => {
    onSelect(regionId);
    setFilter("");
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative min-w-[13rem] flex-1 sm:max-w-sm">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Company location"
        className="flex w-full items-center gap-2.5 rounded border border-edge bg-surface px-3.5 py-2.5 text-left"
      >
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold">{current ? current.region.name : "Select a location"}</p>
          <p className="truncate text-xs tracking-wide text-muted">
            {current ? current.country.name : `${options.length} places`}
          </p>
        </div>
        <svg viewBox="0 0 12 8" width="11" height="8" aria-hidden className="ml-auto shrink-0 fill-muted">
          <path d="M1 1.5 6 6.5 11 1.5" stroke="currentColor" strokeWidth="1.6" fill="none" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-full min-w-[18rem] rounded border border-edge bg-panel shadow-lg">
          <input
            autoFocus
            value={filter}
            onChange={event => setFilter(event.target.value)}
            placeholder="Filter regions"
            aria-label="Filter regions"
            className="w-full border-b border-edge bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted"
          />
          <ul role="listbox" aria-label="Company location" className="max-h-72 overflow-y-auto py-1">
            {listed.map(option => (
              <li
                key={option.region.id}
                role="option"
                aria-selected={option.region.id === selected}
                onClick={() => choose(option.region.id)}
                className={`flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-sm ${
                  option.region.id === selected ? "bg-accent text-on-accent" : "text-ink hover:bg-surface"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">
                  {option.region.name}
                  <span className="pl-1.5 text-xs opacity-70">{option.country.name}</span>
                </span>
                <span className="shrink-0 tabular-nums text-xs">{formatPrice(option.wage.afterTax)}</span>
              </li>
            ))}
            {!listed.length && <li className="px-2.5 py-2 text-sm text-muted">Nothing matches that.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

function PlacementTable({ placements }: { placements: Placement[] }) {
  if (!placements.length) return <p className="text-sm text-muted">Nothing is priced well enough to rank yet.</p>;

  return (
    <div className="overflow-x-auto">
      {/* Fixed, so a long region name is cut rather than pushing the column the
          table is sorted by off the side of a phone. */}
      <table className="w-full table-fixed text-sm">
        <thead className="text-muted">
          <tr className="border-b border-edge">
            <th className="w-6 pb-3 text-left font-normal">#</th>
            <th className="w-24 pb-3 text-left font-normal sm:w-36">Item</th>
            <th className="pb-3 text-left font-normal">Where</th>
            {/* A phone has no room for the workings, only for the answer. */}
            <th className="hidden w-20 pb-3 text-right font-normal sm:table-cell">Bonus</th>
            <th className="hidden w-16 pb-3 text-right font-normal sm:table-cell">Tax</th>
            <th className="w-14 pb-3 text-right font-normal sm:w-20">Wage</th>
            <th className="w-16 pb-3 text-right font-normal sm:w-24">After tax</th>
          </tr>
        </thead>
        <tbody>
          {placements.map((placement, index) => (
            <tr key={`${placement.item.code}-${placement.region.id}`} className="border-b border-edge/60">
              <td className="py-2.5 tabular-nums text-muted">{index + 1}</td>
              <td className="py-2.5 pr-2">
                <span className="flex items-center gap-1.5">
                  <img src={itemIcon(placement.item.code)} alt="" width={18} height={18} className="shrink-0" />
                  <span className="truncate">{itemLabel(placement.item.code)}</span>
                </span>
              </td>
              <td className="py-2.5 pr-2">
                <span className="flex min-w-0 flex-col sm:flex-row sm:items-baseline sm:gap-1.5">
                  <span className="truncate">{placement.region.name}</span>
                  <span className="truncate text-xs text-muted">{placement.country.name}</span>
                </span>
              </td>
              <td className="hidden py-2.5 pl-1 text-right tabular-nums sm:table-cell">
                {percent(placement.wage.bonus.total, "+")}
              </td>
              <td className="hidden py-2.5 pl-1 text-right tabular-nums text-muted sm:table-cell">
                {percent(placement.wage.incomeTax)}
              </td>
              <td className="py-2.5 pl-1 text-right tabular-nums">{formatPrice(placement.wage.posted)}</td>
              <td className="py-2.5 pl-1 text-right font-semibold tabular-nums" style={{ color: "var(--up)" }}>
                {formatPrice(placement.wage.afterTax)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function WageCalculatorPage() {
  const { items, error, retry } = useItems();
  const { countries, industrialism, loading: settling, error: settlementError } = useSettlementData();

  const producible = useMemo(() => items.filter(isProducible), [items]);
  const { regions, prices, loading: pricing, error: marketError } = useWageData();

  const [itemCode, setItemCode] = useState("");
  const [regionId, setRegionId] = useState("");

  // A list that arrives or changes must never leave the page on an item it no
  // longer holds.
  useEffect(() => {
    setItemCode(current =>
      producible.some(item => item.code === current) ? current : (producible[0]?.code ?? ""),
    );
  }, [producible]);

  const item = producible.find(candidate => candidate.code === itemCode);

  // Every place the chosen item can be made, best paying first, which is both
  // the picker's list and where its default comes from.
  const options = useMemo<Option[]>(() => {
    if (!item) return [];
    const byId = new Map(countries.map(country => [country._id, country]));
    const found: Option[] = [];

    for (const region of regions) {
      const country = byId.get(region.countryId);
      if (!country) continue;
      const wage = wageFor(item, region, country, industrialism.levels[country._id] ?? 0, prices);
      if (wage) found.push({ region, country, wage });
    }

    return found.sort((a, b) => b.wage.afterTax - a.wage.afterTax);
  }, [item, regions, countries, industrialism, prices]);

  // Another item is another question, so the answer starts at the best place
  // for it rather than wherever the last one was being asked about.
  useEffect(() => setRegionId(""), [itemCode]);

  useEffect(() => {
    setRegionId(current =>
      options.some(option => option.region.id === current) ? current : (options[0]?.region.id ?? ""),
    );
  }, [options]);

  const chosen = options.find(option => option.region.id === regionId);
  const wage = chosen?.wage;

  const top = useMemo(
    () => rankPlacements(producible, regions, countries, industrialism.levels, prices, TOP_PLACEMENTS),
    [producible, regions, countries, industrialism, prices],
  );

  const loading = settling || pricing;
  const failed = settlementError ?? marketError;

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-edge bg-panel">
        <div className="mx-auto max-w-7xl px-4 pb-4 pt-4 sm:px-6 lg:px-8">
          <TitleBar title="Wage Calculator" />
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-10 px-4 pb-24 pt-10 sm:px-6 lg:px-8">
        <p className="max-w-2xl text-sm text-muted">
          The most a company can pay per production point and still break even, and what the worker keeps of it.
        </p>

        {error && <ItemListError onRetry={retry} />}
        {failed && <p className="text-sm text-down">Couldn't load the market and the map, so there is nothing to rank.</p>}

        {/* The card starts level with the pickers on a wide screen; on a narrow
            one it follows them, so the answer still sits above the workings. */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:grid-rows-[auto_minmax(0,1fr)] lg:gap-10">
          <div className="flex flex-wrap items-start gap-4 lg:col-start-1 lg:row-start-1">
            <ItemPicker items={producible} selected={itemCode} onSelect={setItemCode} />
            <LocationPicker options={options} selected={regionId} onSelect={setRegionId} />
          </div>

          <div className="lg:col-start-2 lg:row-start-1 lg:row-span-2">
            <Panel label="wage summary">
              {loading && !wage ? (
                <p className="text-sm text-muted">Loading the market and the map…</p>
              ) : !wage ? (
                <p className="text-sm text-muted">Nothing to price for this item yet.</p>
              ) : (
                <WageSummary wage={wage} />
              )}
            </Panel>
          </div>

          {wage && (
            <div className="lg:col-start-1 lg:row-start-2">
              <Panel label="wage workings">
                <BonusBreakdown wage={wage} />
              </Panel>
            </div>
          )}
        </div>

        <div>
          <h2 className="text-base font-semibold">Top ten placements</h2>
          <p className="pt-2 text-sm text-muted">
            The best paying region of every country, by what a worker keeps at break even.
          </p>
          <div className="pt-5">
            <Panel label="top placements">
              {loading && !top.length ? (
                <p className="text-sm text-muted">Ranking every item against every region…</p>
              ) : (
                <PlacementTable placements={top} />
              )}
            </Panel>
          </div>
        </div>
      </main>
    </>
  );
}
