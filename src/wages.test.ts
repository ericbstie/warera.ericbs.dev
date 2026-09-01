import { expect, test } from "bun:test";
import type { MarketItem } from "./hooks";
import type { Country } from "./settlement";
import {
  bonusFor,
  depositActive,
  floorToStep,
  isProducible,
  rankPlacements,
  toRegions,
  wageFor,
  type Region,
} from "./wages";

/** The game quotes wages and benefits to the thousandth, so compare where it rounds. */
const to3 = (value: number) => {
  const rounded = Number(value.toFixed(3));
  // A hair under break even rounds to -0, which the game shows as a plain 0.
  return rounded === 0 ? 0 : rounded;
};

const GRAIN: MarketItem = { code: "grain", type: "raw", productionPoints: 1, isDeposit: true, climates: ["moderate", "tropical"] };
const IRON: MarketItem = { code: "iron", type: "raw", productionPoints: 1, isDeposit: true, climates: ["moderate", "arid", "tropical", "polar"] };
const FISH: MarketItem = { code: "fish", type: "raw", productionPoints: 40, isDeposit: true, climates: ["polar"] };
const STEEL: MarketItem = { code: "steel", type: "product", productionPoints: 10, productionNeeds: { iron: 10 } };
const CONCRETE: MarketItem = { code: "concrete", type: "product", productionPoints: 10, productionNeeds: { limestone: 10 } };
const COOKED_FISH: MarketItem = { code: "cookedFish", type: "product", productionPoints: 40, productionNeeds: { fish: 1 } };
const KNIFE: MarketItem = { code: "knife", type: "weapon" };

// The four placements below were read off the game on 2026-08-22, with the
// market prices it was quoting at the time. Every ruling party involved was a
// fanatic industrialist.
const BOOK = {
  cookedFish: 7.634753243944623,
  fish: 3.3201606714628267,
  steel: 1.6230574941841207,
  iron: 0.081567896092557,
  concrete: 1.5969398156201122,
  limestone: 0.0796050289880947,
  grain: 0.0758635864057438,
};

// The figures below were read off a market whose best bid and best ask were the
// same number, so one book stands for both sides of it.
const PRICES = { bids: BOOK, asks: BOOK };
const FANATIC_INDUSTRIALIST = 2;
const FANATIC_AGRARIAN = -2;

const ARGENTINA: Country = {
  _id: "ar",
  name: "Argentina",
  taxes: { income: 10, market: 3, selfWork: 45 },
  specializedItem: "cookedFish",
  strategicResources: { bonuses: { productionPercent: 5 } },
};
const RESISTENCIA: Region = { id: "ar-res", name: "Resistencia", countryId: "ar", climate: "moderate" };

const THAILAND: Country = {
  _id: "th",
  name: "Thailand",
  taxes: { income: 8, market: 1, selfWork: 2 },
  specializedItem: "steel",
  strategicResources: { bonuses: { productionPercent: 30.5 } },
};
const MARATHA: Region = { id: "th-mar", name: "Maratha", countryId: "th", climate: "tropical" };

const INDONESIA: Country = {
  _id: "id",
  name: "Indonesia",
  taxes: { income: 9, market: 1, selfWork: 1 },
  specializedItem: "iron",
  strategicResources: { bonuses: { productionPercent: 30 } },
};
const TIMOR_LESTE: Region = { id: "id-tl", name: "Timor-Leste", countryId: "id", climate: "tropical" };

const CHILE: Country = {
  _id: "cl",
  name: "Chile",
  taxes: { income: 9, market: 10, selfWork: 0.01 },
  specializedItem: "concrete",
  strategicResources: { bonuses: { productionPercent: 30.5 } },
};
const CHUGOKU: Region = { id: "cl-chu", name: "Chugoku", countryId: "cl", climate: "moderate" };

const NOW = Date.parse("2026-08-22T07:00:00.000Z");

test("cooked fish in Argentina, Resistencia", () => {
  // The game showed 0.113, 0.102 reaching the worker and a net benefit of 0.01.
  // Cooked fish is a prepared good: it sits on neither end of the industrialism
  // axis, so a fanatic industrialist ruling party adds nothing to Argentina's
  // 5% of strategic resources. Reading it as a specialization bonus and paying
  // +35% is what put this placement at 0.145.
  const wage = wageFor(COOKED_FISH, RESISTENCIA, ARGENTINA, FANATIC_INDUSTRIALIST, PRICES, NOW)!;

  expect(wage.bonus).toEqual({ strategic: 5, ethic: 0, deposit: 0, total: 5 });
  expect(wage.posted).toBeCloseTo(0.113, 9);
  expect(to3(wage.afterTax)).toBe(0.102);
  expect(to3(wage.netBenefit)).toBe(0.01);
});

test("steel in Thailand, Maratha", () => {
  // The game showed 0.129, 0.119 to the worker and a net benefit of 0.006.
  // Steel is an industrial good, so the ethic pays on top of the 30.5% Thailand
  // draws from its strategic resources.
  const wage = wageFor(STEEL, MARATHA, THAILAND, FANATIC_INDUSTRIALIST, PRICES, NOW)!;

  expect(wage.bonus).toEqual({ strategic: 30.5, ethic: 30, deposit: 0, total: 60.5 });
  expect(wage.inputs).toEqual([
    { code: "iron", quantity: 1.605, price: BOOK.iron, cost: 1.605 * BOOK.iron },
  ]);
  expect(wage.posted).toBeCloseTo(0.129, 9);
  expect(to3(wage.afterTax)).toBe(0.119);
  expect(to3(wage.netBenefit)).toBe(0.006);
});

test("iron in Indonesia, Timor-Leste", () => {
  // The game showed 0.130, 0.118 to the worker and a net benefit of 0 — this
  // one sits a whisker under half a thousandth of break even.
  const wage = wageFor(IRON, TIMOR_LESTE, INDONESIA, FANATIC_INDUSTRIALIST, PRICES, NOW)!;

  expect(wage.bonus.total).toBe(60);
  expect(wage.posted).toBeCloseTo(0.13, 9);
  expect(to3(wage.afterTax)).toBe(0.118);
  expect(wage.netBenefit).toBeLessThan(0.001);
});

test("concrete in Chile, Chugoku", () => {
  // The game showed 0.128, 0.116 to the worker and a net benefit of 0.005.
  const wage = wageFor(CONCRETE, CHUGOKU, CHILE, FANATIC_INDUSTRIALIST, PRICES, NOW)!;

  expect(wage.bonus.total).toBeCloseTo(60.5, 9);
  expect(wage.posted).toBeCloseTo(0.128, 9);
  expect(to3(wage.afterTax)).toBe(0.116);
  expect(to3(wage.netBenefit)).toBe(0.005);
});

test("the net benefit is counted over a whole item's production points", () => {
  // A thousandth of wage on one production point is ten thousandths across the
  // ten points a steel costs, which is the figure the game puts on the screen.
  const steel = wageFor(STEEL, MARATHA, THAILAND, FANATIC_INDUSTRIALIST, PRICES, NOW)!;
  const iron = wageFor(IRON, TIMOR_LESTE, INDONESIA, FANATIC_INDUSTRIALIST, PRICES, NOW)!;

  expect(steel.netBenefit).toBeCloseTo((steel.breakEven - steel.posted) * 10, 12);
  // One point makes one iron, so there is nothing to multiply.
  expect(iron.netBenefit).toBeCloseTo(iron.breakEven - iron.posted, 12);
});

test("the wage a worker takes home is taxed on what is posted, not on break even", () => {
  // Taxing the unrounded break-even misses the game by a thousandth, and misses
  // it in a different direction each time.
  const steel = wageFor(STEEL, MARATHA, THAILAND, FANATIC_INDUSTRIALIST, PRICES, NOW)!;

  expect(steel.afterTax).toBeCloseTo(steel.posted * 0.92, 12);
});

test("the posted wage never rises above break even", () => {
  expect(floorToStep(0.1216)).toBeCloseTo(0.121, 9);
  expect(floorToStep(0.12958424)).toBeCloseTo(0.129, 9);
  // 0.12 / 0.001 is 119.99999999999999, which a bare Math.floor turns into 0.119.
  expect(floorToStep(0.12)).toBeCloseTo(0.12, 9);
  expect(floorToStep(0.131)).toBeCloseTo(0.131, 9);
});

test("the ruling party's ethic follows the item, not the specialization", () => {
  // An industrialist country lifts every industrial company it holds, whether
  // or not that is the item it specializes in — and lifts none of its bakeries.
  expect(bonusFor(STEEL, RESISTENCIA, ARGENTINA, FANATIC_INDUSTRIALIST, NOW)).toEqual({
    strategic: 0,
    ethic: 30,
    deposit: 0,
    total: 30,
  });
  expect(bonusFor(IRON, RESISTENCIA, ARGENTINA, 1, NOW).ethic).toBe(10);
  expect(bonusFor(IRON, RESISTENCIA, ARGENTINA, 0, NOW).ethic).toBe(0);
  // Cooked fish is prepared, not grown, so neither end of the axis pays for it.
  expect(bonusFor(COOKED_FISH, RESISTENCIA, ARGENTINA, FANATIC_AGRARIAN, NOW).total).toBe(0);
});

test("an agrarian ruling party pays for what the land grows", () => {
  const agrarian: Country = { ...ARGENTINA, specializedItem: "fish" };

  expect(bonusFor(FISH, RESISTENCIA, agrarian, -1, NOW)).toEqual({
    strategic: 5,
    ethic: 10,
    deposit: 0,
    total: 15,
  });
  // A fanatic agrarian government has given up the law that picks a
  // specialization, so its strategic resources stop paying even on fish.
  expect(bonusFor(FISH, RESISTENCIA, agrarian, FANATIC_AGRARIAN, NOW)).toEqual({
    strategic: 0,
    ethic: 30,
    deposit: 0,
    total: 30,
  });
  // And outside food it hands a company nothing at all.
  expect(bonusFor(IRON, RESISTENCIA, agrarian, FANATIC_AGRARIAN, NOW).total).toBe(0);
});

test("a deposit pays the company standing on it", () => {
  const deposit = { type: "grain", bonusPercent: 30, startsAt: "2026-08-21T01:02:51.290Z", endsAt: "2026-08-25T01:02:51.290Z" };
  const region: Region = { ...RESISTENCIA, deposit };

  expect(bonusFor(GRAIN, region, ARGENTINA, -1, NOW)).toEqual({
    strategic: 0,
    ethic: 10,
    deposit: 30,
    total: 40,
  });
  // A fanatic industrialist country lets its deposits go, so this one is dead.
  expect(bonusFor(GRAIN, region, ARGENTINA, FANATIC_INDUSTRIALIST, NOW).deposit).toBe(0);
  // And a deposit of something else is somebody else's business.
  expect(bonusFor(IRON, region, ARGENTINA, 0, NOW).deposit).toBe(0);
});

test("a deposit only counts while it is running", () => {
  const deposit = { type: "grain", bonusPercent: 30, startsAt: "2026-08-21T01:02:51.290Z", endsAt: "2026-08-25T01:02:51.290Z" };

  expect(depositActive(deposit, NOW)).toBe(true);
  expect(depositActive(deposit, Date.parse("2026-08-20T00:00:00.000Z"))).toBe(false);
  expect(depositActive(deposit, Date.parse("2026-08-26T00:00:00.000Z"))).toBe(false);
});

test("climate says where a deposit may appear, not where a company may stand", () => {
  // The bug this replaced hid fish from every region that wasn't polar, which
  // dropped whole countries out of the ranking for it.
  const arid: Region = { id: "a", name: "Arid", countryId: "ar", climate: "arid" };

  expect(wageFor(FISH, arid, ARGENTINA, 0, PRICES, NOW)).not.toBeNull();
  expect(wageFor(GRAIN, { ...arid, climate: "polar" }, ARGENTINA, 0, PRICES, NOW)).not.toBeNull();
});

test("nothing a company can't be set to produce is costed", () => {
  expect(isProducible(KNIFE)).toBe(false);
  expect(wageFor(KNIFE, RESISTENCIA, ARGENTINA, 0, { bids: { knife: 12 }, asks: {} }, NOW)).toBeNull();
});

test("an unquoted item or input has no wage rather than a wage of zero", () => {
  expect(wageFor(GRAIN, RESISTENCIA, ARGENTINA, 0, { bids: {}, asks: {} }, NOW)).toBeNull();
  expect(wageFor(STEEL, MARATHA, THAILAND, FANATIC_INDUSTRIALIST, { bids: { steel: 1.625 }, asks: {} }, NOW)).toBeNull();
});

test("ranks by the wage that reaches the worker, not the one the company posts", () => {
  const taxed: Country = { ...THAILAND, _id: "taxed", name: "Taxed", taxes: { income: 50, market: 1, selfWork: 1 } };
  const regions: Region[] = [
    { ...MARATHA, id: "a" },
    { ...MARATHA, id: "b", name: "Taxland", countryId: "taxed" },
  ];

  const ranked = rankPlacements([STEEL], regions, [THAILAND, taxed], { th: 2, taxed: 2 }, PRICES, 10, NOW);

  expect(ranked.map(placement => placement.country.name)).toEqual(["Thailand", "Taxed"]);
  expect(ranked[0]!.wage.incomeTax).toBe(8);
});

test("one country can't fill the table with its own provinces", () => {
  // Every Indonesian region shares Indonesia's bonuses, so only its best stands.
  const regions: Region[] = ["a", "b", "c"].map(id => ({ ...TIMOR_LESTE, id, name: `Region ${id}` }));
  regions[1]!.deposit = { type: "iron", bonusPercent: 30 };

  const ranked = rankPlacements([IRON], regions, [INDONESIA], {}, PRICES, 10, NOW);

  expect(ranked).toHaveLength(1);
  expect(ranked[0]!.region.name).toBe("Region b");
  expect(ranked[0]!.wage.bonus.deposit).toBe(30);
});

test("reads regions out of the shape upstream sends", () => {
  expect(
    toRegions([
      { _id: "r1", name: "Somewhere", country: "cr", climate: "tropical" },
      { _id: "r2", country: "cr" },
      { name: "no id" },
    ]),
  ).toEqual([
    { id: "r1", name: "Somewhere", countryId: "cr", climate: "tropical", deposit: undefined },
    { id: "r2", name: "r2", countryId: "cr", climate: "", deposit: undefined },
  ]);
});

test("sells into the best bid and buys inputs off the best ask", () => {
  const spread = { bids: { steel: 2, iron: 0.05 }, asks: { steel: 3, iron: 0.1 } };
  const wage = wageFor(STEEL, MARATHA, THAILAND, FANATIC_INDUSTRIALIST, spread, NOW)!;

  // One production point of steel with Thailand's bonus, sold at the bid and
  // made of iron bought at the ask.
  expect(wage.salePrice).toBe(2);
  expect(wage.inputs[0]!.price).toBe(0.1);
  expect(to3(wage.breakEven)).toBe(to3(wage.output * 2 - wage.output * 10 * 0.1));
});
