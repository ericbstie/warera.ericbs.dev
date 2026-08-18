import { itemIcon, itemLabel, useWeeklyMovers, type Mover } from "./hooks";

function Entry({ mover }: { mover: Mover }) {
  const rising = mover.changePct >= 0;

  return (
    <span className="flex shrink-0 items-center gap-1.5" title={itemLabel(mover.code)}>
      <img src={itemIcon(mover.code)} alt={itemLabel(mover.code)} width={18} height={18} />
      <span className={`text-xs font-medium tabular-nums ${rising ? "text-up" : "text-down"}`}>
        {rising ? "+" : ""}
        {mover.changePct.toFixed(2)}%
      </span>
    </span>
  );
}

/**
 * The run is rendered twice and slid by exactly half its width, so the second
 * copy is in the first one's place when the animation loops and the scroll
 * reads as continuous.
 */
export function Ticker({ items }: { items: string[] }) {
  const movers = useWeeklyMovers(items);
  if (!movers.length) return null;

  return (
    <div className="min-w-0 basis-full overflow-hidden sm:flex-1 sm:basis-40" aria-label="7 day change">
      <div className="flex w-max animate-ticker gap-6">
        {[0, 1].map(copy => (
          <div key={copy} className="flex shrink-0 gap-6 pr-6" aria-hidden={copy === 1}>
            {movers.map(mover => (
              <Entry key={mover.code} mover={mover} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
