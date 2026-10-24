import { itemIcon, itemLabel } from "./hooks";
import { MAX_ENERGY, MAX_PRODUCTION, useMarketWages, type JobRow } from "./jobs";
import { Panel } from "./Panel";
import { formatPrice } from "./stats";

function JobTable({ jobs }: { jobs: JobRow[] }) {
  return (
    <div className="overflow-x-auto">
      {/* Fixed, so a long company name is cut rather than pushing the wages off a phone. */}
      <table className="w-full table-fixed text-sm">
        <thead className="text-muted">
          <tr className="border-b border-edge">
            <th className="w-6 pb-3 text-left font-normal">#</th>
            <th className="pb-3 text-left font-normal">Company</th>
            <th className="w-12 pb-3 text-right font-normal sm:w-20">Open</th>
            <th className="w-14 pb-3 text-right font-normal sm:w-20">Wage</th>
            <th className="w-16 pb-3 text-right font-normal sm:w-24">After tax</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job, index) => (
            <tr key={job.offerId} className="border-b border-edge/60">
              <td className="py-2.5 tabular-nums text-muted">{index + 1}</td>
              <td className="py-2.5 pr-2">
                <span className="flex min-w-0 items-center gap-2">
                  {job.itemCode && (
                    <img
                      src={itemIcon(job.itemCode)}
                      alt={itemLabel(job.itemCode)}
                      title={itemLabel(job.itemCode)}
                      width={24}
                      height={24}
                      className="shrink-0"
                    />
                  )}
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate">{job.companyName}</span>
                    <span className="truncate text-xs text-muted">
                      {job.playerName}
                      {job.minLevel && <span> · level {job.minLevel}+</span>}
                    </span>
                  </span>
                </span>
              </td>
              <td className="py-2.5 pl-1 text-right tabular-nums text-muted">{job.openings}</td>
              <td className="py-2.5 pl-1 text-right tabular-nums">{formatPrice(job.wage)}</td>
              <td className="py-2.5 pl-1 text-right font-semibold tabular-nums" style={{ color: "var(--up)" }}>
                {formatPrice(job.afterTax)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The best wages on the job market right now, for a worker every offer is open to. */
export function MarketWages() {
  const { rows, error } = useMarketWages();

  if (error) return <p className="pb-10 text-sm text-down">Couldn't load the market wages.</p>;
  if (!rows.length) return null;

  return (
    <section className="pb-10">
      <h2 className="text-base font-semibold">Market wage</h2>
      <p className="pt-2 text-sm text-muted">
        The best paying job offers for a worker with {MAX_ENERGY} energy and {MAX_PRODUCTION} production.
      </p>
      <div className="pt-5">
        <Panel label="market wages">
          <JobTable jobs={rows} />
        </Panel>
      </div>
    </section>
  );
}
