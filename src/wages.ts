// What a company can pay a worker before it stops making money.
//
// A wage is quoted per production point. A worker's session turns energy into
// production points, the place's bonus adds more on top of them, and the
// company pays for the ones the worker brought — so a point is worth
// `1 + bonus` points of production to the company, and one point of production
// is `1 / productionPoints` of the item plus the same share of what the recipe
// eats. Whatever is left of the sale once the inputs are paid for is the wage
// the company can post at break even, and the country's income tax decides how
// much of it the worker keeps.

import { useEffect, useState } from "react";
import { isFiniteNumber, type MarketItem } from "./hooks";
import { fetchBestPrices, type BestPrices } from "./orders";
import {
  AGRARIAN_ITEMS,
  ethicBonusFor,
  FANATIC_AGRARIAN,
  FANATIC_INDUSTRIALIST,
  strategicBonusFor,
  type Country,
} from "./settlement";

/** The game posts wages to the thousandth, so that is as close to break even as one can sit. */
export const WAGE_STEP = 0.001;

export type Deposit = { type: string; bonusPercent: number; startsAt?: string; endsAt?: string };

export type Region = {
  id: string;
  name: string;
  countryId: string;
  /** Which deposits can appear here — the weather says nothing about what a company may produce. */
  climate: string;
  deposit?: Deposit;
};

export type Bonus = {
  strategic: number;
  /** What the ruling party's place on the industrialism axis is worth on this item. */
  ethic: number;
  deposit: number;
  total: number;
};

export type Input = { code: string; quantity: number; price: number; cost: number };

/**
 * The top of the order book, which is where a company actually trades: it sells
 * its output into the highest buy order and buys its inputs off the lowest sell
 * order. The average price the market endpoint quotes is neither of those.
 */
export type Market = BestPrices;

export type Wage = {
  bonus: Bonus;
  /** Units of the item one production point buys, bonus included. */
  output: number;
  salePrice: number;
  revenue: number;
  inputs: Input[];
  inputCost: number;
  /** The wage at which the company makes exactly nothing, to the last decimal. */
  breakEven: number;
  /** The most of that the game lets one actually post. */
  posted: number;
  /**
   * What the company keeps at the posted wage, over the run of production
   * points one item is priced in — the same figure the game shows.
   */
  netBenefit: number;
  incomeTax: number;
  /** What the worker keeps of the posted wage — the game taxes what is paid, not the break-even. */
  afterTax: number;
};

export type Placement = { item: MarketItem; region: Region; country: Country; wage: Wage };

/** Only the items a company can be set to produce carry a production cost. */
export function isProducible(item: MarketItem): boolean {
  return isFiniteNumber(item.productionPoints) && item.productionPoints > 0;
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

const EMPTY_MARKET: Market = { bids: {}, asks: {} };

const NO_BONUS: Bonus = { strategic: 0, ethic: 0, deposit: 0, total: 0 };

export function bonusFor(
  item: MarketItem,
  region: Region,
  country: Country,
  industrialism: number,
  now = Date.now(),
): Bonus {
  // A fanatic agrarian country has turned its back on everything but the
  // fields: outside food and coca it hands a company nothing at all.
  if (industrialism === FANATIC_AGRARIAN && !AGRARIAN_ITEMS.has(item.code)) return NO_BONUS;

  const strategic = strategicBonusFor(country, item.code, industrialism);
  const ethic = ethicBonusFor(item.code, industrialism);

  // A deposit pays the company sitting on it, and only that one. A fanatic
  // industrialist country is where it pays nothing: deposits can't spawn under
  // that ethic, and the game hands out no bonus for one left over from before it.
  const onDeposit =
    industrialism !== FANATIC_INDUSTRIALIST &&
    region.deposit?.type === item.code &&
    depositActive(region.deposit, now);
  const deposit = onDeposit ? region.deposit!.bonusPercent : 0;

  return { strategic, ethic, deposit, total: strategic + ethic + deposit };
}

/** A price of 0, or no order at all on that side, is no price. */
function priced(prices: Record<string, number>, code: string): number | null {
  const price = prices[code];
  return isFiniteNumber(price) && price > 0 ? price : null;
}

/**
 * Down to the step, never up: a wage posted above break even loses the company
 * money on every work, so the nearest step is the wrong one nearly half the time.
 */
export function floorToStep(value: number, step = WAGE_STEP): number {
  // 0.12 / 0.001 is 119.99999999999999 in binary floating point, and flooring
  // that would drop a whole step. Nine places is far past anything the game
  // quotes, so this rounding only ever undoes that error.
  const steps = Math.floor(Number((value / step).toFixed(9)));
  return Number((steps * step).toFixed(9));
}

/**
 * null where the sum can't be made honestly: an item no company produces, or a
 * market that has yet to quote it or one of the things it is made from.
 */
export function wageFor(
  item: MarketItem,
  region: Region,
  country: Country,
  industrialism: number,
  market: Market,
  now = Date.now(),
): Wage | null {
  if (!isProducible(item)) return null;

  // Selling means hitting the best bid; the ask is what somebody hopes for.
  const salePrice = priced(market.bids, item.code);
  if (salePrice === null) return null;

  const bonus = bonusFor(item, region, country, industrialism, now);
  // One production point's worth of production, which is also the share of the
  // recipe it consumes — a bonus lifts the output and the inputs together.
  const output = (1 + bonus.total / 100) / item.productionPoints!;

  const inputs: Input[] = [];
  for (const [code, needed] of Object.entries(item.productionNeeds ?? {})) {
    // Buying an input means lifting the best offer.
    const price = priced(market.asks, code);
    if (price === null) return null;
    const quantity = needed * output;
    inputs.push({ code, quantity, price, cost: quantity * price });
  }

  const revenue = output * salePrice;
  const inputCost = inputs.reduce((total, input) => total + input.cost, 0);
  const breakEven = revenue - inputCost;
  const posted = floorToStep(breakEven);
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
    // The wage only moves in thousandths, so it lands a shade under break even.
    // The game counts what that is worth over a whole item's production points
    // rather than over the single point the wage is quoted in.
    netBenefit: (breakEven - posted) * item.productionPoints!,
    incomeTax,
    afterTax: posted * (1 - incomeTax / 100),
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
  market: Market,
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

      const wage = wageFor(item, region, country, industrialism[country._id] ?? 0, market, now);
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

/**
 * The regions and the order books the calculator ranks over, fetched once for
 * the page. The books are keyed by item, so the list of items to read them for
 * has to come from the caller.
 */
export function useWageData(itemCodes: string[]) {
  const [regions, setRegions] = useState<Region[]>([]);
  const [market, setMarket] = useState<Market>(EMPTY_MARKET);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // A fresh array every render would re-fetch every book on every render.
  const key = itemCodes.join(",");

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    setLoading(true);

    Promise.all([fetchRegions(), fetchBestPrices(key.split(","))])
      .then(([list, books]) => {
        if (cancelled) return;
        setRegions(list);
        setMarket(books);
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

  return { regions, market, loading, error };
}
