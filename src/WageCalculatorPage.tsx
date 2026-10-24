import { useEffect, useRef, useState } from "react";
import { itemIcon, itemLabel } from "./hooks";
import { Panel } from "./Panel";
import { formatPrice } from "./stats";
import { TitleBar } from "./TitleBar";
import { usePlacements, useTopItems, type PlacementRow } from "./wages";

function percent(value: number, sign = "") {
  return `${sign}${Number(value.toFixed(2))}%`;
}

/** Ticks once a second, for anything counting down. */
function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** The two largest units left, so a deposit days out doesn't tick seconds at you. */
export function timeLeft(ms: number): string {
  if (ms <= 0) return "ending";
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function DepositLabel({ row, now }: { row: PlacementRow; now: number }) {
  if (!row.deposit) return null;
  const ends = row.depositEndsAt ? Date.parse(row.depositEndsAt) : NaN;
  return (
    <span className="rounded border border-accent px-1.5 py-0.5 text-[11px] font-medium text-accent">
      Deposit{Number.isFinite(ends) && <span className="tabular-nums"> · {timeLeft(ends - now)}</span>}
    </span>
  );
}

function ItemCard({ row, rank, now }: { row: PlacementRow; rank: number; now: number }) {
  return (
    <li className="relative flex w-52 shrink-0 snap-start flex-col gap-3 overflow-hidden rounded border border-edge bg-panel p-4">
      {/* Tucked into the corner, flush with the card's own edges. */}
      <span className="absolute right-0 top-0 rounded-bl border-b border-l border-edge bg-surface px-2.5 py-1 text-sm font-semibold tabular-nums">
        #{rank}
      </span>
      <img src={itemIcon(row.itemCode)} alt={itemLabel(row.itemCode)} title={itemLabel(row.itemCode)} width={48} height={48} />
      <div>
        <p className="text-2xl font-semibold tabular-nums" style={{ color: "var(--up)" }}>
          {formatPrice(row.afterTax)}
        </p>
        <p className="pt-1 text-sm">
          <span className="font-semibold tabular-nums">{formatPrice(row.posted)}</span>
          <span className="pl-1 text-xs tabular-nums text-muted">({percent(row.incomeTax)} tax)</span>
        </p>
      </div>
      <div className="min-w-0 text-xs leading-tight">
        <p className="truncate">{row.regionName}</p>
        <p className="truncate text-muted">{row.countryName}</p>
      </div>
      {row.deposit > 0 && (
        <div className="mt-auto">
          <DepositLabel row={row} now={now} />
        </div>
      )}
    </li>
  );
}

/** The most profitable items, each at the best place to make it, in a row that scrolls sideways. */
function TopItems() {
  const { rows, error } = useTopItems();
  const now = useNow();

  if (error) return <p className="text-sm text-down">Couldn't load the top items.</p>;
  if (!rows.length) return null;

  return (
    <section className="pb-10">
      <h2 className="text-base font-semibold">Top items</h2>
      <p className="pt-2 text-sm text-muted">The most profitable items to produce, each where it pays best.</p>
      <ol className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 pt-5 sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:-mx-8 lg:scroll-px-8 lg:px-8">
        {rows.map((row, index) => (
          <ItemCard key={row.itemCode} row={row} rank={index + 1} now={now} />
        ))}
      </ol>
    </section>
  );
}

function PlacementTable({ placements }: { placements: PlacementRow[] }) {
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
            <tr key={`${placement.itemCode}-${placement.regionId}`} className="border-b border-edge/60">
              <td className="py-2.5 tabular-nums text-muted">{index + 1}</td>
              <td className="py-2.5 pr-2">
                <span className="flex items-center gap-1.5">
                  <img src={itemIcon(placement.itemCode)} alt="" width={18} height={18} className="shrink-0" />
                  <span className="truncate">{itemLabel(placement.itemCode)}</span>
                </span>
              </td>
              <td className="py-2.5 pr-2">
                <span className="flex min-w-0 flex-col sm:flex-row sm:items-baseline sm:gap-1.5">
                  <span className="truncate">{placement.regionName}</span>
                  <span className="truncate text-xs text-muted">{placement.countryName}</span>
                </span>
              </td>
              <td className="hidden py-2.5 pl-1 text-right tabular-nums sm:table-cell">
                {percent(placement.bonus, "+")}
              </td>
              <td className="hidden py-2.5 pl-1 text-right tabular-nums text-muted sm:table-cell">
                {percent(placement.incomeTax)}
              </td>
              <td className="py-2.5 pl-1 text-right tabular-nums">{formatPrice(placement.posted)}</td>
              <td className="py-2.5 pl-1 text-right font-semibold tabular-nums" style={{ color: "var(--up)" }}>
                {formatPrice(placement.afterTax)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Asks for the next page whenever the end of the list scrolls into view. */
function LoadMore({ onVisible }: { onVisible: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    // Well before the end, so the next page is usually there before it is wanted.
    const observer = new IntersectionObserver(entries => entries[0]?.isIntersecting && onVisible(), {
      rootMargin: "600px",
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [onVisible]);

  return <div ref={ref} aria-hidden className="h-px" />;
}

export function WageCalculatorPage() {
  const { rows, loading, error, done, loadMore } = usePlacements();

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-edge bg-panel">
        <div className="mx-auto max-w-7xl px-4 pb-4 pt-4 sm:px-6 lg:px-8">
          <TitleBar />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-24 pt-10 sm:px-6 lg:px-8">
        <TopItems />
        <h2 className="text-base font-semibold">Best placements</h2>
        <p className="pt-2 text-sm text-muted">
          The best paying region of every country for every item, by what a worker keeps at break even.
        </p>
        <div className="pt-5">
          <Panel label="placements">
            {!rows.length && loading ? (
              <p className="text-sm text-muted">Ranking every item against every region…</p>
            ) : !rows.length && error ? null : (
              <PlacementTable placements={rows} />
            )}
            {error ? (
              <p className="pt-4 text-sm text-down">
                Couldn't load {rows.length ? "more placements" : "the placements"}.{" "}
                <button type="button" onClick={loadMore} className="underline">
                  Try again
                </button>
              </p>
            ) : (
              rows.length > 0 && !done && (
                // Mounted afresh after every page, so a list still too short to
                // reach the bottom of the screen keeps asking for more.
                loading ? <p className="pt-4 text-sm text-muted">Loading more…</p> : <LoadMore onVisible={loadMore} />
              )
            )}
          </Panel>
        </div>
      </main>
    </>
  );
}
