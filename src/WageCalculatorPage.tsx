import { useEffect, useRef, useState } from "react";
import { Chip } from "./Chip";
import { Header } from "./Header";
import { itemIcon, itemLabel } from "./hooks";
import { PAGE_COLUMN } from "./layout";
import { MarketWages } from "./MarketWages";
import { Panel } from "./Panel";
import { formatPrice } from "./stats";
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
  // Drawn like the requirement chips on the wage market, in the lime the chart
  // gives VWAP, so it reads as one of the same family rather than a box.
  return (
    <Chip
      tone="bg-mid/15 text-mid"
      title="This region's deposit adds to the bonus until it runs out"
      icon={
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </>
      }
    >
      Deposit{Number.isFinite(ends) && <> · {timeLeft(ends - now)}</>}
    </Chip>
  );
}

/** One place on the leaderboard, laid out like a market wage's row. */
function ItemRow({ row, rank, now }: { row: PlacementRow; rank: number; now: number }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-0 border-b border-edge/60 py-3 pr-2 sm:flex-nowrap sm:gap-x-4">
      <span className="w-6 shrink-0 text-right text-base tabular-nums text-muted">{rank}</span>
      <img src={itemIcon(row.itemCode)} alt="" width={40} height={40} className="h-8 w-8 shrink-0 sm:h-10 sm:w-10" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-3.5">
          <p className="truncate text-base sm:text-lg">{itemLabel(row.itemCode)}</p>
          {/* Beside the name only where there is room; on a phone it took all
              of the name's, so there it gets a line of its own. */}
          {row.deposit > 0 && (
            <span className="hidden shrink-0 sm:inline-flex">
              <DepositLabel row={row} now={now} />
            </span>
          )}
        </div>
        <p className="truncate text-base text-muted">
          {row.regionName}, {row.countryName}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xl font-semibold leading-tight tabular-nums text-up sm:text-2xl">
          {formatPrice(row.afterTax)}
        </p>
        <p className="text-sm tabular-nums text-muted">
          {formatPrice(row.posted)} · {percent(row.incomeTax)} tax
        </p>
      </div>
      {/* A line of its own on a phone, under the name and clear of the wage,
          lined up with the name past the rank and the icon. */}
      {row.deposit > 0 && (
        <div className="w-full pl-20 pt-1.5 sm:hidden">
          <DepositLabel row={row} now={now} />
        </div>
      )}
    </li>
  );
}

/** The most profitable items, each at the best place to make it. */
function TopItems() {
  const { rows, error } = useTopItems();
  const now = useNow();

  if (error) return <p className="text-base text-down">Couldn't load the top items.</p>;
  if (!rows.length) return null;

  return (
    <section className="min-w-0 pb-10">
      <h2 className="text-2xl font-semibold">Item market</h2>
      {/* As tall as the wage market beside it, about four rows with the next peeking in, and scrolled on its own. */}
      <ol className="mt-4 h-90 overflow-y-auto overscroll-contain border-t border-edge/60">
        {rows.map((row, index) => (
          <ItemRow key={row.itemCode} row={row} rank={index + 1} now={now} />
        ))}
      </ol>
    </section>
  );
}

function PlacementTable({ placements }: { placements: PlacementRow[] }) {
  if (!placements.length) return <p className="text-base text-muted">Nothing is priced well enough to rank yet.</p>;

  return (
    <div className="overflow-x-auto">
      {/* Fixed, so a long region name is cut rather than pushing the column the
          table is sorted by off the side of a phone. */}
      <table className="w-full table-fixed text-base">
        <thead className="text-sm text-muted">
          <tr className="border-b border-edge/60">
            <th className="w-10 pb-3 pr-4 text-right font-normal">#</th>
            {/* On a phone the place goes under the item, the way the market
                lists stack name over detail, rather than two cut-off columns. */}
            <th className="pb-3 text-left font-normal sm:w-36">Item</th>
            <th className="hidden pb-3 text-left font-normal sm:table-cell">Where</th>
            {/* A phone has no room for the workings, only for the answer. */}
            <th className="hidden w-20 pb-3 text-right font-normal sm:table-cell">Bonus</th>
            <th className="hidden w-16 pb-3 text-right font-normal sm:table-cell">Tax</th>
            <th className="w-14 pb-3 text-right font-normal sm:w-20">Wage</th>
            <th className="w-20 whitespace-nowrap pb-3 pr-2 text-right font-normal sm:w-26">After tax</th>
          </tr>
        </thead>
        <tbody>
          {placements.map((placement, index) => (
            <tr key={`${placement.itemCode}-${placement.regionId}`} className="border-b border-edge/60">
              <td className="py-2.5 pr-4 text-right tabular-nums text-muted">{index + 1}</td>
              <td className="py-2.5 pr-2">
                <span className="flex items-center gap-1.5">
                  <img src={itemIcon(placement.itemCode)} alt="" width={20} height={20} className="shrink-0" />
                  <span className="truncate">{itemLabel(placement.itemCode)}</span>
                </span>
                <span className="block truncate pl-[1.625rem] text-sm text-muted sm:hidden">
                  {placement.regionName}, {placement.countryName}
                </span>
              </td>
              <td className="hidden py-2.5 pr-2 sm:table-cell">
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <span className="truncate">{placement.regionName}</span>
                  <span className="truncate text-sm text-muted">{placement.countryName}</span>
                </span>
              </td>
              <td className="hidden py-2.5 pl-1 text-right tabular-nums sm:table-cell">
                {percent(placement.bonus, "+")}
              </td>
              <td className="hidden py-2.5 pl-1 text-right tabular-nums text-muted sm:table-cell">
                {percent(placement.incomeTax)}
              </td>
              <td className="py-2.5 pl-1 text-right tabular-nums">{formatPrice(placement.posted)}</td>
              <td className="py-2.5 pl-1 pr-2 text-right font-semibold tabular-nums text-up">
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
      <Header />

      <main className={`${PAGE_COLUMN} pb-24 pt-10`}>
        {/* Side by side where there is room for both lists, stacked on a phone. */}
        <div className="grid gap-x-16 lg:grid-cols-2">
          <MarketWages />
          <TopItems />
        </div>
        <h2 className="text-2xl font-semibold">Best placements</h2>
        <div className="pt-4">
          <Panel label="placements">
            {!rows.length && loading ? (
              <p className="text-base text-muted">Ranking every item against every region…</p>
            ) : !rows.length && error ? null : (
              <PlacementTable placements={rows} />
            )}
            {error ? (
              <p className="pt-4 text-base text-down">
                Couldn't load {rows.length ? "more placements" : "the placements"}.{" "}
                <button type="button" onClick={loadMore} className="underline">
                  Try again
                </button>
              </p>
            ) : (
              rows.length > 0 && !done && (
                // Mounted afresh after every page, so a list still too short to
                // reach the bottom of the screen keeps asking for more.
                loading ? <p className="pt-4 text-base text-muted">Loading more…</p> : <LoadMore onVisible={loadMore} />
              )
            )}
          </Panel>
        </div>
      </main>
    </>
  );
}
