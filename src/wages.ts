// What a company can pay a worker before it stops making money.
//
// A work turns one production point into `1 / productionPoints` of the item,
// lifted by whatever bonuses the place carries, and consumes the item's needs
// in the same proportion. Whatever is left of the sale once the inputs are paid
// for is the wage the company can post at break even, and the country's income
// tax decides how much of it the worker keeps.

import { useEffect, useState } from "react";
import { isFiniteNumber, type MarketItem } from "./hooks";
import { SPECIALIZATION_BONUS, type Country } from "./settlement";

/** `company.depositResourceBonus`: what a raw resource earns where its climate suits it. */
export const DEPOSIT_RESOURCE_BONUS = 30;

/** The game posts wages to the thousandth, so that is as close to break even as one can sit. */
export const WAGE_STEP = 0.001;

export type Deposit = { type: string; bonusPercent: number; startsAt?: string; endsAt?: string };

export type Region = {
  id: string;
  name: string;
  countryId: string;
  climate: string;
  deposit?: Deposit;
};

export type Bonus = {
  strategic: number;
  specialization: number;
  resource: number;
  deposit: number;
  total: number;
};

export type Input = { code: string; quantity: number; price: number; cost: number };

export type Wage = {
  bonus: Bonus;
  /** Units of the item one work produces, bonuses included. */
  output: number;
  salePrice: number;
  revenue: number;
  inputs: Input[];
  inputCost: number;
  /** The wage at which the company makes exactly nothing. */
  breakEven: number;
  /** That wage as it can actually be posted, and what the company keeps at it. */
  posted: number;
  profit: number;
  incomeTax: number;
  afterTax: number;
};

export type Placement = { item: MarketItem; region: Region; country: Country; wage: Wage };

/** Only the items a company can be set to produce carry a production cost. */
export function isProducible(item: MarketItem): boolean {
  return isFiniteNumber(item.productionPoints) && item.productionPoints > 0;
}

/** A raw resource only grows where its climate allows; anything refined travels. */
export function canProduceIn(item: MarketItem, region: Region): boolean {
  if (!isProducible(item)) return false;
  if (!item.isDeposit) return true;
  return (item.climates ?? []).includes(region.climate);
}

/** Deposits run out, and an expired one stays in the region record for a while. */
export function depositActive(deposit: Deposit | undefined, now = Date.now()): boolean {
  if (!deposit || !isFiniteNumber(deposit.bonusPercent)) return false;
  const starts = deposit.startsAt ? Date.parse(deposit.startsAt) : NaN;
  const ends = deposit.endsAt ? Date.parse(deposit.endsAt) : NaN;
  if (Number.isFinite(starts) && starts > now) return false;
  if (Number.isFinite(ends) && ends <= now) return false;
  return true;
}

export function bonusFor(
  item: MarketItem,
  region: Region,
  country: Country,
  industrialism: number,
  now = Date.now(),
): Bonus {
  const percent = country.strategicResources?.bonuses?.productionPercent;
  const strategic = isFiniteNumber(percent) ? percent : 0;
  const specialization =
    country.specializedItem === item.code ? (SPECIALIZATION_BONUS[industrialism] ?? 0) : 0;
  const resource = item.isDeposit && (item.climates ?? []).includes(region.climate) ? DEPOSIT_RESOURCE_BONUS : 0;
  const deposit =
    region.deposit?.type === item.code && depositActive(region.deposit, now) ? region.deposit.bonusPercent : 0;

  return {
    strategic,
    specialization,
    resource,
    deposit,
    total: strategic + specialization + resource + deposit,
  };
}

/** A price of 0 is a book with nothing on it, which is no price at all. */
function priced(prices: Record<string, number>, code: string): number | null {
  const price = prices[code];
  return isFiniteNumber(price) && price > 0 ? price : null;
}

export function roundToStep(value: number, step = WAGE_STEP): number {
  return Math.round(value / step) * step;
}

/**
 * null where the sum can't be made honestly: an item no company produces, a
 * place it can't be produced in, or a market that has yet to quote it or one of
 * the things it is made from.
 */
export function wageFor(
  item: MarketItem,
  region: Region,
  country: Country,
  industrialism: number,
  prices: Record<string, number>,
  now = Date.now(),
): Wage | null {
  if (!canProduceIn(item, region)) return null;

  const salePrice = priced(prices, item.code);
  if (salePrice === null) return null;

  const bonus = bonusFor(item, region, country, industrialism, now);
  // One work's worth of production, which is also the share of the recipe it
  // consumes — a bonus lifts the output and the inputs together.
  const output = (1 + bonus.total / 100) / item.productionPoints!;

  const inputs: Input[] = [];
  for (const [code, needed] of Object.entries(item.productionNeeds ?? {})) {
    const price = priced(prices, code);
    if (price === null) return null;
    const quantity = needed * output;
    inputs.push({ code, quantity, price, cost: quantity * price });
  }

  const revenue = output * salePrice;
  const inputCost = inputs.reduce((total, input) => total + input.cost, 0);
  const breakEven = revenue - inputCost;
  const posted = roundToStep(breakEven);
  const incomeTax = isFiniteNumber(country.taxes?.income) ? country.taxes!.income : 0;

  return {
    bonus,
    output,
    salePrice,
    revenue,
    inputs,
    inputCost,
    breakEven,
    posted,
    profit: breakEven - posted,
    incomeTax,
    afterTax: breakEven * (1 - incomeTax / 100),
  };
}

/**
 * Every region of a country shares its strategic and specialization bonuses, so
 * without this one country's provinces would fill the whole table. Only the best
 * placement a country offers for an item stands for it.
 */
export function rankPlacements(
  items: MarketItem[],
  regions: Region[],
  countries: Country[],
  industrialism: Record<string, number>,
  prices: Record<string, number>,
  limit = 10,
  now = Date.now(),
): Placement[] {
  const byId = new Map(countries.map(country => [country._id, country]));
  const best = new Map<string, Placement>();

  for (const item of items) {
    if (!isProducible(item)) continue;
    for (const region of regions) {
      const country = byId.get(region.countryId);
      if (!country) continue;

      const wage = wageFor(item, region, country, industrialism[country._id] ?? 0, prices, now);
      if (!wage) continue;

      const key = `${item.code} ${country._id}`;
      const standing = best.get(key);
      if (!standing || wage.afterTax > standing.wage.afterTax) best.set(key, { item, region, country, wage });
    }
  }

  return [...best.values()].sort((a, b) => b.wage.afterTax - a.wage.afterTax).slice(0, limit);
}

// --- upstream data --------------------------------------------------------

type RawRegion = { _id?: string; name?: string; country?: string; climate?: string; deposit?: Deposit };

export function toRegions(values: unknown): Region[] {
  if (!Array.isArray(values)) return [];
  return (values as RawRegion[])
    .filter(region => typeof region._id === "string" && typeof region.country === "string")
    .map(region => ({
      id: region._id!,
      name: region.name ?? region._id!,
      countryId: region.country!,
      climate: region.climate ?? "",
      deposit: region.deposit,
    }));
}

export async function fetchRegions(): Promise<Region[]> {
  const res = await fetch("/api/trpc/region.getAll?input=%7B%7D");
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  const regions = toRegions(json?.result?.data);
  if (!regions.length) throw new Error("Region list came back in an unexpected shape");
  return regions;
}

/** Upstream takes one procedure name per call in a batch and indexes the inputs to match. */
export function topOrdersBatchPath(itemCodes: string[]): string {
  const procedures = itemCodes.map(() => "tradingOrder.getTopOrders").join(",");
  const input = JSON.stringify(Object.fromEntries(itemCodes.map((itemCode, index) => [index, { itemCode }])));
  return `/api/trpc/${procedures}?batch=1&input=${encodeURIComponent(input)}`;
}

/**
 * The best bid, because that is what a company selling its output into the book
 * gets — and what it pays for the inputs it buys back out of the same book.
 */
export function bestBids(itemCodes: string[], entries: unknown): Record<string, number> {
  const prices: Record<string, number> = {};
  if (!Array.isArray(entries)) return prices;

  itemCodes.forEach((code, index) => {
    const orders = (entries[index] as { result?: { data?: { buyOrders?: Array<{ price?: number }> } } })?.result?.data
      ?.buyOrders;
    if (!Array.isArray(orders)) return;
    const best = orders.reduce(
      (highest, order) => (isFiniteNumber(order?.price) && order.price > highest ? order.price : highest),
      0,
    );
    if (best > 0) prices[code] = best;
  });

  return prices;
}

export async function fetchPrices(itemCodes: string[]): Promise<Record<string, number>> {
  if (!itemCodes.length) return {};
  const res = await fetch(topOrdersBatchPath(itemCodes));
  const entries = await res.json();
  if (!Array.isArray(entries)) throw new Error("Order books came back in an unexpected shape");
  return bestBids(itemCodes, entries);
}

/** The regions and the prices the calculator ranks over, fetched once for the page. */
export function useWageData(itemCodes: string[]) {
  const [regions, setRegions] = useState<Region[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const key = itemCodes.join(",");

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([fetchRegions(), fetchPrices(key.split(","))])
      .then(([list, book]) => {
        if (cancelled) return;
        setRegions(list);
        setPrices(book);
      })
      .catch(err => {
        if (!cancelled) setError(err as Error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [key]);

  return { regions, prices, loading, error };
}
