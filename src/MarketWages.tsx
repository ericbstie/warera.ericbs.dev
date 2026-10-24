import type { ReactNode } from "react";
import { itemIcon, itemLabel } from "./hooks";
import { companyUrl, MAX_ENERGY, MAX_PRODUCTION, useMarketWages, type JobRow } from "./jobs";
import { formatPrice } from "./stats";

const REQUIREMENT_STYLES = {
  level: "bg-level/15 text-level",
  energy: "bg-energy/15 text-energy",
  production: "bg-production/15 text-production",
};

/** Coloured as the game colours them, so the number alone says what is asked for. */
function Requirement({ kind, value, children }: { kind: keyof typeof REQUIREMENT_STYLES; value: number; children: ReactNode }) {
  return (
    <span
      title={`${kind[0]!.toUpperCase()}${kind.slice(1)} ${value} or more`}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-sm font-semibold tabular-nums ${REQUIREMENT_STYLES[kind]}`}
    >
      <svg aria-hidden viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
      {value}+
    </span>
  );
}

function Requirements({ job }: { job: JobRow }) {
  if (!job.minLevel && !job.minEnergy && !job.minProduction) return null;
  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {job.minLevel && (
        <Requirement kind="level" value={job.minLevel}>
          <path d="M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z" />
        </Requirement>
      )}
      {job.minEnergy && (
        <Requirement kind="energy" value={job.minEnergy}>
          <path d="M13 2L4 14h7l-1 8 9-12h-7z" />
        </Requirement>
      )}
      {job.minProduction && (
        <Requirement kind="production" value={job.minProduction}>
          <path d="M14 10L4 20" />
          <path d="M5 6c5-3 10-2 13 1s4 8 1 13" />
        </Requirement>
      )}
    </div>
  );
}

/** One place on the leaderboard, laid out like a top item's row; this one opens the company in the game. */
function OfferRow({ job, rank }: { job: JobRow; rank: number }) {
  return (
    <li className="border-b border-edge/60">
      <a
        href={companyUrl(job.companyId)}
        target="_blank"
        rel="noreferrer"
        className="-mx-2 flex items-center gap-3 rounded px-2 py-3 transition-colors hover:bg-panel sm:gap-4"
      >
        <span className="w-6 shrink-0 text-right text-lg font-semibold tabular-nums text-muted">{rank}</span>
        {job.itemCode ? (
          <img src={itemIcon(job.itemCode)} alt={itemLabel(job.itemCode)} title={itemLabel(job.itemCode)} width={40} height={40} className="shrink-0" />
        ) : (
          <span aria-hidden className="h-10 w-10 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 gap-1.5 text-lg">
            <span className="truncate">{job.companyName}</span>
            <span title={`${job.openings} open`} className="shrink-0 tabular-nums text-muted">
              ({job.openings})
            </span>
          </p>
          <Requirements job={job} />
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xl font-semibold leading-tight tabular-nums sm:text-3xl" style={{ color: "var(--up)" }}>
            {formatPrice(job.afterTax)}
          </p>
          <p className="text-sm tabular-nums text-muted">
            {formatPrice(job.wage)}
            {job.incomeTax !== null && <> · {Number(job.incomeTax.toFixed(2))}% tax</>}
          </p>
        </div>
      </a>
    </li>
  );
}

/** The best wages on the job market right now, for a worker every offer is open to. */
export function MarketWages() {
  const { rows, error } = useMarketWages();

  if (error) return <p className="pb-10 text-base text-down">Couldn't load the market wages.</p>;
  if (!rows.length) return null;

  return (
    <section className="min-w-0 pb-10">
      <h2 className="text-2xl font-semibold">Market wage</h2>
      <p className="pt-2 text-base text-muted">
        The best paying job offers for a worker with {MAX_ENERGY} energy and {MAX_PRODUCTION} production.
      </p>
      <ol className="pt-4">
        {rows.map((job, index) => (
          <OfferRow key={job.offerId} job={job} rank={index + 1} />
        ))}
      </ol>
    </section>
  );
}
