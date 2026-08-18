import { useMemo } from "react";
import { itemIcon } from "./hooks";
import { rankPlacements, useSettlementData, type Placement } from "./settlement";

const VISIBLE_ROWS = 5;
const ROW_HEIGHT = 20;

/**
 * A country missing its taxes or bonuses used to throw here and blank the whole
 * page. An unknown number reads as "—" instead — absent, not zero.
 */
function percent(value: number | undefined, sign = "") {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${sign}${Number(value.toFixed(2))}%`;
}

function bonusColor(totalBonus: number) {
  if (totalBonus >= 50) return "var(--up)";
  if (totalBonus > 30) return "var(--mid)";
  return undefined;
}

function PlacementTable({ itemCode, placements }: { itemCode: string; placements: Placement[] }) {
  return (
    <div className="rounded border border-edge bg-panel p-2">
      <div className="flex items-center gap-1.5 pb-1.5">
        <img src={itemIcon(itemCode)} alt="" width={16} height={16} className="shrink-0" />
        <span className="truncate text-xs">{itemCode}</span>
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: (VISIBLE_ROWS + 1) * ROW_HEIGHT }}>
        <table className="w-full table-fixed text-[10px]">
          <thead className="sticky top-0 bg-panel text-muted">
            <tr style={{ height: ROW_HEIGHT }}>
              <th className="text-left font-normal">Area</th>
              <th className="w-12 text-right font-normal">Bonus</th>
              <th className="w-14 text-right font-normal">Tax</th>
            </tr>
          </thead>
          <tbody>
            {placements.map(placement => (
              <tr key={placement.country} style={{ height: ROW_HEIGHT }}>
                <td className="truncate pr-1" title={placement.country}>
                  {placement.country}
                </td>
                <td className="text-right tabular-nums" style={{ color: bonusColor(placement.totalBonus) }}>
                  {percent(placement.totalBonus, "+")}
                </td>
                <td className="text-right tabular-nums text-muted">{percent(placement.taxes?.income)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SettlementGrid({ items }: { items: string[] }) {
  const { countries, industrialism, loading, error } = useSettlementData();

  const rankings = useMemo(
    () => items.map(item => ({ item, placements: rankPlacements(countries, industrialism.levels, item) })),
    [items, countries, industrialism],
  );

  if (loading) return <p className="text-sm text-muted">Loading settlement bonuses…</p>;
  if (error) return <p className="text-sm text-muted">Couldn't load settlement bonuses.</p>;

  return (
    <section className="flex flex-col gap-2">
      <p className="text-xs text-muted">
        Best countries to settle a company, by production bonus. Tax is income tax.
      </p>
      {!industrialism.complete && (
        <p className="text-xs text-down">
          Some specialization data didn't load, so a few countries may be ranked lower than they should be.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
        {rankings.map(({ item, placements }) => (
          <PlacementTable key={item} itemCode={item} placements={placements} />
        ))}
      </div>
    </section>
  );
}
