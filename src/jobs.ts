// What the job market pays right now, for a worker who has maxed out both the
// skills an offer can ask for. An offer only names its company and the player
// who posted it by id, so the server looks both up and hands the browser rows
// it can draw as they are.

import { useEffect, useState } from "react";
import { isFiniteNumber } from "./hooks";

/** The top of both skills — every offer on the market is open to a worker this good at them. */
export const MAX_ENERGY = 120;
export const MAX_PRODUCTION = 40;

/** How many offers the market wage section shows. */
export const MARKET_WAGES = 10;

/**
 * Some of the best paying offers are closed to most players by citizenship, so
 * read well past the ten we keep to still have ten once those are gone.
 */
export const JOB_OFFERS_PATH = `workOffer.getWorkOffersPaginated?input=${encodeURIComponent(
  JSON.stringify({ limit: 50, energy: MAX_ENERGY, production: MAX_PRODUCTION }),
)}`;

export type RawOffer = {
  _id?: string;
  company?: string;
  user?: string;
  region?: string;
  quantity?: number;
  wage?: number;
  wageAfterTax?: number;
  minLevel?: number;
  citizenship?: string;
};

/** An offer with everything a row needs present. */
export type OpenOffer = RawOffer & { _id: string; company: string; user: string; quantity: number; wage: number; wageAfterTax: number };

/** An offer as the section draws it. */
export type JobRow = {
  offerId: string;
  companyId: string;
  wage: number;
  afterTax: number;
  /** The income tax of the country the company works in, as a percent — null where that country isn't known. */
  incomeTax: number | null;
  /** How many of this position the company still has open. */
  openings: number;
  /** Only set where the offer turns away players below it. */
  minLevel?: number;
  companyName: string;
  itemCode: string;
  playerName: string;
};

/**
 * Offers anyone can take, best paid first. An offer limited to one citizenship
 * isn't a market wage, and one with nothing left open can't be taken at all.
 */
export function openOffers(data: unknown, limit = MARKET_WAGES): OpenOffer[] {
  const items = (data as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];
  return (items as RawOffer[])
    .filter(
      (offer): offer is OpenOffer =>
        typeof offer._id === "string" &&
        typeof offer.company === "string" &&
        typeof offer.user === "string" &&
        isFiniteNumber(offer.wage) &&
        isFiniteNumber(offer.wageAfterTax) &&
        isFiniteNumber(offer.quantity) &&
        offer.quantity > 0 &&
        !offer.citizenship,
    )
    .sort((a, b) => b.wageAfterTax - a.wageAfterTax || b.wage - a.wage)
    .slice(0, limit);
}

export function toJobRow(
  offer: OpenOffer,
  company: { name?: string; itemCode?: string } | undefined,
  player: { username?: string } | undefined,
  incomeTax: number | null,
): JobRow {
  return {
    offerId: offer._id,
    companyId: offer.company,
    wage: offer.wage,
    afterTax: offer.wageAfterTax,
    incomeTax,
    openings: offer.quantity,
    minLevel: isFiniteNumber(offer.minLevel) && offer.minLevel > 0 ? offer.minLevel : undefined,
    companyName: company?.name ?? "Unknown company",
    itemCode: company?.itemCode ?? "",
    playerName: player?.username ?? "Unknown player",
  };
}

/** The company's own page in the game. */
export function companyUrl(companyId: string): string {
  return `https://app.warera.io/company/${companyId}`;
}

export function useMarketWages() {
  const [rows, setRows] = useState<JobRow[]>([]);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/jobs")
      .then(res => res.json())
      .then(json => {
        if (json.error) throw new Error(json.error.message);
        if (!Array.isArray(json?.jobs)) throw new Error("Job offers came back in an unexpected shape");
        if (!cancelled) setRows(json.jobs);
      })
      .catch(err => !cancelled && setError(err as Error));
    return () => {
      cancelled = true;
    };
  }, []);

  return { rows, error };
}
