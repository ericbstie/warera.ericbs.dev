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

import { useCallback, useEffect, useRef, useState } from "react";
import { isFiniteNumber, type MarketItem } from "./hooks";
import type { BestPrices } from "./orders";
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
  const byId = new Map(countries.map((country) => [country._id, country]));
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
      if (!standing || wage.afterTax > standing.wage.afterTax)
        best.set(key, { item, region, country, wage });
    }
  }

  return [...best.values()].sort((a, b) => b.wage.afterTax - a.wage.afterTax).slice(0, limit);
}

/** How many placements one page of the list holds. */
export const PLACEMENTS_PAGE_SIZE = 25;

/** A placement as the list draws it: everything a row needs and nothing it doesn't. */
export type PlacementRow = {
  itemCode: string;
  regionId: string;
  regionName: string;
  countryName: string;
  bonus: number;
  incomeTax: number;
  posted: number;
  afterTax: number;
  /** The deposit's share of the bonus, and when it runs out — only where one pays. */
  deposit: number;
  depositEndsAt?: string;
};

export function toPlacementRow({ item, region, country, wage }: Placement): PlacementRow {
  return {
    itemCode: item.code,
    regionId: region.id,
    regionName: region.name,
    countryName: country.name,
    bonus: wage.bonus.total,
    incomeTax: wage.incomeTax,
    posted: wage.posted,
    afterTax: wage.afterTax,
    deposit: wage.bonus.deposit,
    depositEndsAt: wage.bonus.deposit > 0 ? region.deposit?.endsAt : undefined,
  };
}

/** The first row of each item in a ranked list, which is where that item pays best. */
export function bestPerItem(rows: PlacementRow[]): PlacementRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => !seen.has(row.itemCode) && seen.add(row.itemCode));
}

export type PlacementPage = { placements: PlacementRow[]; total: number };

// --- upstream data --------------------------------------------------------

type RawRegion = {
  _id?: string;
  name?: string;
  country?: string;
  climate?: string;
  deposit?: Deposit;
};

export function toRegions(values: unknown): Region[] {
  if (!Array.isArray(values)) return [];
  return (values as RawRegion[])
    .filter((region) => typeof region._id === "string" && typeof region.country === "string")
    .map((region) => ({
      id: region._id!,
      name: region.name ?? region._id!,
      countryId: region.country!,
      climate: region.climate ?? "",
      deposit: region.deposit,
    }));
}

export async function fetchPlacements(
  offset: number,
  limit = PLACEMENTS_PAGE_SIZE,
  per = "",
): Promise<PlacementPage> {
  const res = await fetch(
    `/api/placements?offset=${offset}&limit=${limit}${per ? `&per=${per}` : ""}`,
  );
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  if (!Array.isArray(json?.placements))
    throw new Error("Placements came back in an unexpected shape");
  return json;
}

const rowKey = (row: PlacementRow) => `${row.itemCode} ${row.regionId}`;

/**
 * The ranked list a page at a time, for a list that grows as it is scrolled.
 * The server reranks as the order books move, so a later page can repeat a row
 * an earlier one already showed; only the first copy is kept.
 */
export function usePlacements() {
  const [rows, setRows] = useState<PlacementRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const busy = useRef(false);
  // How far down the list the next page starts, read without waiting on a render.
  const shownRef = useRef(0);

  const loadMore = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError(null);

    fetchPlacements(shownRef.current)
      .then((page) => {
        shownRef.current += page.placements.length;
        setTotal(page.total);
        setRows((shown) => {
          const seen = new Set(shown.map(rowKey));
          return [...shown, ...page.placements.filter((row) => !seen.has(rowKey(row)))];
        });
      })
      .catch((err) => setError(err as Error))
      .finally(() => {
        busy.current = false;
        setLoading(false);
      });
  }, []);

  useEffect(loadMore, [loadMore]);

  const done = total !== null && shownRef.current >= total;
  return { rows, total, loading, error, done, loadMore };
}

/** How many items the cards above the list rank. */
export const TOP_ITEMS = 10;

/** Each item's best placement, most profitable item first. */
export function useTopItems() {
  const [rows, setRows] = useState<PlacementRow[]>([]);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPlacements(0, TOP_ITEMS, "item")
      .then((page) => !cancelled && setRows(page.placements))
      .catch((err) => !cancelled && setError(err as Error));
    return () => {
      cancelled = true;
    };
  }, []);

  return { rows, error };
}
