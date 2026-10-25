import type { ReactNode } from "react";
import { Chip } from "./Chip";
import { itemIcon, itemLabel } from "./hooks";
import { companyUrl, useMarketWages, WORK_MARKET_URL, type JobRow } from "./jobs";
import { formatPrice } from "./stats";

const REQUIREMENT_STYLES = {
  level: "bg-level/15 text-level",
  energy: "bg-energy/15 text-energy",
  production: "bg-production/15 text-production",
};

/** Coloured as the game colours them, so the number alone says what is asked for. */
function Requirement({ kind, value, children }: { kind: keyof typeof REQUIREMENT_STYLES; value: number; children: ReactNode }) {
  return (
    <Chip tone={REQUIREMENT_STYLES[kind]} title={`${kind[0]!.toUpperCase()}${kind.slice(1)} ${value} or more`} icon={children}>
      {value}+
    </Chip>
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
        className="flex items-center gap-3 py-3 pr-2 transition-colors hover:bg-panel sm:gap-4"
      >
        <span className="w-6 shrink-0 text-right text-base tabular-nums text-muted">{rank}</span>
        {job.itemCode ? (
          <img src={itemIcon(job.itemCode)} alt={itemLabel(job.itemCode)} title={itemLabel(job.itemCode)} width={40} height={40} className="h-8 w-8 shrink-0 sm:h-10 sm:w-10" />
        ) : (
          <span aria-hidden className="h-8 w-8 shrink-0 sm:h-10 sm:w-10" />
        )}
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 gap-1.5 text-base sm:text-lg">
            <span className="truncate">{job.companyName}</span>
            <span title={`${job.openings} open`} className="shrink-0 tabular-nums text-muted">
              ({job.openings})
            </span>
          </p>
          <Requirements job={job} />
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xl font-semibold leading-tight tabular-nums text-up sm:text-2xl">
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
      <h2 className="flex items-center gap-2 text-2xl font-semibold">
        Wage market
        <a
          href={WORK_MARKET_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="Open the job market in the game"
          title="Open the job market in the game"
          className="text-muted/60 transition-colors hover:text-ink"
        >
          <svg aria-hidden viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
            <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
          </svg>
        </a>
      </h2>
      {/* As tall as the item market beside it, about four rows with the next peeking in, and scrolled on its own. */}
      <ol className="mt-4 h-90 overflow-y-auto overscroll-contain border-t border-edge/60">
        {rows.map((job, index) => (
          <OfferRow key={job.offerId} job={job} rank={index + 1} />
        ))}
      </ol>
    </section>
  );
}
