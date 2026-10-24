import { useMemo } from "react";
import { itemIcon, itemLabel, useItems } from "./hooks";
import { ItemListError, Panel } from "./Panel";
import { useSettlementData } from "./settlement";
import { formatPrice } from "./stats";
import { TitleBar } from "./TitleBar";
import {
  isProducible,
  rankPlacements,
  useWageData,
  type Placement,
} from "./wages";

const TOP_PLACEMENTS = 10;

function percent(value: number, sign = "") {
  return `${sign}${Number(value.toFixed(2))}%`;
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
  // Every item, not only the producible ones: a recipe is priced off the raw
  // materials it eats as much as off what it makes.
  const codes = useMemo(() => items.map(item => item.code), [items]);
  const { regions, market, loading: pricing, error: marketError } = useWageData(codes);

  const top = useMemo(
    () => rankPlacements(producible, regions, countries, industrialism.levels, market, TOP_PLACEMENTS),
    [producible, regions, countries, industrialism, market],
  );

  const loading = settling || pricing;
  const failed = settlementError ?? marketError;

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-edge bg-panel">
        <div className="mx-auto max-w-7xl px-4 pb-4 pt-4 sm:px-6 lg:px-8">
          <TitleBar />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-24 pt-10 sm:px-6 lg:px-8">
        {error && <ItemListError onRetry={retry} />}
        {failed && <p className="text-sm text-down">Couldn't load the market and the map, so there is nothing to rank.</p>}

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
      </main>
    </>
  );
}
