// What the job market pays right now, for a worker at the most an offer here
// may ask for. An offer only names its company by id, so the
// server looks it up and hands the browser rows it can draw as they are.

import { useEffect, useState } from "react";
import { isFiniteNumber } from "./hooks";

/** The most an offer may ask for and still be listed; anything past these is closed to most players. */
export const MAX_LEVEL = 50;
export const MAX_ENERGY = 130;
export const MAX_PRODUCTION = 40;

/** A requirement the offer leaves unset asks for nothing. */
function withinReach(required: number | undefined, most: number): boolean {
  return !isFiniteNumber(required) || required <= most;
}

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
  minEnergy?: number;
  minProduction?: number;
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
  /** Only set where the offer asks for at least this much energy. */
  minEnergy?: number;
  /** Only set where the offer asks for at least this much production. */
  minProduction?: number;
  companyName: string;
  itemCode: string;
};

/**
 * Offers anyone can take, best paid first. An offer limited to one citizenship
 * isn't a market wage, one asking for more than most players have isn't
 * either, and one with nothing left open can't be taken at all.
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
        !offer.citizenship &&
        withinReach(offer.minLevel, MAX_LEVEL) &&
        withinReach(offer.minEnergy, MAX_ENERGY) &&
        withinReach(offer.minProduction, MAX_PRODUCTION),
    )
    .sort((a, b) => b.wageAfterTax - a.wageAfterTax || b.wage - a.wage)
    .slice(0, limit);
}

/** A requirement of zero turns nobody away, so it isn't one. */
function positive(value: unknown): number | undefined {
  return isFiniteNumber(value) && value > 0 ? value : undefined;
}

export function toJobRow(
  offer: OpenOffer,
  company: { name?: string; itemCode?: string } | undefined,
  incomeTax: number | null,
): JobRow {
  return {
    offerId: offer._id,
    companyId: offer.company,
    wage: offer.wage,
    afterTax: offer.wageAfterTax,
    incomeTax,
    openings: offer.quantity,
    minLevel: positive(offer.minLevel),
    minEnergy: positive(offer.minEnergy),
    minProduction: positive(offer.minProduction),
    companyName: company?.name ?? "Unknown company",
    itemCode: company?.itemCode ?? "",
  };
}

/** The job market itself in the game. */
export const WORK_MARKET_URL = "https://app.warera.io/market/work";

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
