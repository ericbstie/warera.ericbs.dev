import { itemIcon, itemLabel } from "./hooks";
import { companyUrl, MAX_ENERGY, MAX_PRODUCTION, useMarketWages, type JobRow } from "./jobs";
import { formatPrice } from "./stats";

/** Built like the top item cards, so the two rows read as one design; this one opens the company in the game. */
function JobCard({ job, rank }: { job: JobRow; rank: number }) {
  return (
    <li className="w-52 shrink-0 snap-start">
      <a
        href={companyUrl(job.companyId)}
        target="_blank"
        rel="noreferrer"
        className="relative flex h-full flex-col gap-3 overflow-hidden rounded border border-edge bg-panel p-4 transition-colors hover:border-muted"
      >
        {/* Tucked into the corner, flush with the card's own edges. */}
        <span className="absolute right-0 top-0 rounded-bl border-b border-l border-edge bg-surface px-2.5 py-1 text-sm font-semibold tabular-nums">
          #{rank}
        </span>
        {job.itemCode ? (
          <img src={itemIcon(job.itemCode)} alt={itemLabel(job.itemCode)} title={itemLabel(job.itemCode)} width={48} height={48} />
        ) : (
          <span aria-hidden className="h-12 w-12" />
        )}
        <div>
          <p className="text-2xl font-semibold tabular-nums" style={{ color: "var(--up)" }}>
            {formatPrice(job.afterTax)}
          </p>
          <p className="pt-1 text-sm">
            <span className="font-semibold tabular-nums">{formatPrice(job.wage)}</span>
            {job.incomeTax !== null && (
              <span className="pl-1 text-xs tabular-nums text-muted">({Number(job.incomeTax.toFixed(2))}% tax)</span>
            )}
          </p>
        </div>
        <div className="min-w-0 text-xs leading-tight">
          <p className="truncate">{job.companyName}</p>
          <p className="truncate text-muted">{job.playerName}</p>
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] tabular-nums text-muted">
          <span>{job.openings} open</span>
          {job.minLevel && <span>· level {job.minLevel}+</span>}
        </div>
      </a>
    </li>
  );
}

/** The best wages on the job market right now, for a worker every offer is open to. */
export function MarketWages() {
  const { rows, error } = useMarketWages();

  if (error) return <p className="pb-10 text-sm text-down">Couldn't load the market wages.</p>;
  if (!rows.length) return null;

  return (
    <section className="pb-10">
      <h2 className="text-xl font-semibold">Market wage</h2>
      <p className="pt-2 text-sm text-muted">
        The best paying job offers for a worker with {MAX_ENERGY} energy and {MAX_PRODUCTION} production.
      </p>
      <ol className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 pt-5 sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:-mx-8 lg:scroll-px-8 lg:px-8">
        {rows.map((job, index) => (
          <JobCard key={job.offerId} job={job} rank={index + 1} />
        ))}
      </ol>
    </section>
  );
}
