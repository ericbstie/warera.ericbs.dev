import { expect, test } from "bun:test";
import type { MarketItem } from "./hooks";
import type { Country } from "./settlement";
import {
  bestBids,
  bonusFor,
  canProduceIn,
  depositActive,
  floorToStep,
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
const STEEL: MarketItem = { code: "steel", type: "product", productionPoints: 10, productionNeeds: { iron: 10 } };
const KNIFE: MarketItem = { code: "knife", type: "weapon" };

const COSTA_RICA: Country = {
  _id: "cr",
  name: "Costa Rica",
  taxes: { income: 1, market: 1, selfWork: 1 },
};

const WESTERN_COSTA_RICA: Region = {
  id: "cr-west",
  name: "Western Costa Rica",
  countryId: "cr",
  climate: "tropical",
  deposit: { type: "grain", bonusPercent: 30, startsAt: "2026-08-21T01:02:51.290Z", endsAt: "2026-08-25T01:02:51.290Z" },
};

const THAILAND: Country = {
  _id: "th",
  name: "Thailand",
  taxes: { income: 8, market: 1, selfWork: 2 },
  specializedItem: "steel",
  strategicResources: { bonuses: { productionPercent: 30.75 } },
};

const CENTRAL_THAILAND: Region = { id: "th-central", name: "Central Thailand", countryId: "th", climate: "tropical" };

const NOW = Date.parse("2026-08-21T16:00:00.000Z");

test("grain in Costa Rica prices the placement the game showed", () => {
  // A tropical region grows grain (+30) and is running a grain deposit (+30).
  // The game had this one posted at 0.122, showing a net benefit of 0 and 0.121
  // reaching the worker.
  const wage = wageFor(GRAIN, WESTERN_COSTA_RICA, COSTA_RICA, 0, { grain: 0.076 }, NOW)!;

  expect(wage.bonus.total).toBe(60);
  expect(wage.output).toBeCloseTo(1.6, 6);
  expect(wage.breakEven).toBeCloseTo(0.1216, 6);
  expect(to3(wage.breakEven - 0.122)).toBe(0);
  expect(to3(0.122 * (1 - wage.incomeTax / 100))).toBe(0.121);
});

test("grain in Costa Rica will not recommend the wage the game was posted at", () => {
  // 0.122 was a shade over break even and quietly cost the company 0.0004 a
  // work; the most it can actually pay is the step below.
  const wage = wageFor(GRAIN, WESTERN_COSTA_RICA, COSTA_RICA, 0, { grain: 0.076 }, NOW)!;

  expect(wage.posted).toBeCloseTo(0.121, 6);
  expect(wage.profit).toBeCloseTo(0.0006, 6);
  expect(to3(wage.afterTax)).toBe(0.12);
});

test("steel in Thailand prices the placement the game showed", () => {
  // 30.75 strategic and 30 for specializing in steel at industrialism 2, with
  // the iron it eats bought back out of the same book. The game had this one
  // posted at 0.130, showing a net benefit of 0.001 and 0.120 reaching the worker.
  const wage = wageFor(STEEL, CENTRAL_THAILAND, THAILAND, 2, { steel: 1.625, iron: 0.081 }, NOW)!;

  expect(wage.bonus.total).toBeCloseTo(60.75, 6);
  expect(wage.output).toBeCloseTo(0.16075, 6);
  expect(wage.inputs).toEqual([{ code: "iron", quantity: 1.6075, price: 0.081, cost: 1.6075 * 0.081 }]);
  expect(wage.breakEven).toBeCloseTo(0.131011, 6);
  expect(to3(wage.breakEven - 0.13)).toBe(0.001);
  expect(to3(0.13 * (1 - wage.incomeTax / 100))).toBe(0.12);

  // One more step was going spare, and the company keeps a hundredth of a cent of it.
  expect(wage.posted).toBeCloseTo(0.131, 6);
  expect(wage.profit).toBeCloseTo(0.000011, 6);
  expect(to3(wage.afterTax)).toBe(0.121);
});

test("the wage a worker takes home is taxed on what is posted, not on break even", () => {
  // Both placements above settle this: taxing the unrounded break-even misses
  // the game by a thousandth, and misses it in a different direction each time.
  const grain = wageFor(GRAIN, WESTERN_COSTA_RICA, COSTA_RICA, 0, { grain: 0.076 }, NOW)!;
  const steel = wageFor(STEEL, CENTRAL_THAILAND, THAILAND, 2, { steel: 1.625, iron: 0.081 }, NOW)!;

  expect(grain.afterTax).toBeCloseTo(grain.posted * 0.99, 9);
  expect(steel.afterTax).toBeCloseTo(steel.posted * 0.92, 9);
});

test("the posted wage never rises above break even", () => {
  expect(floorToStep(0.1216)).toBeCloseTo(0.121, 9);
  expect(floorToStep(0.13101125)).toBeCloseTo(0.131, 9);
  // 0.12 / 0.001 is 119.99999999999999, which a bare Math.floor turns into 0.119.
  expect(floorToStep(0.12)).toBeCloseTo(0.12, 9);
  expect(floorToStep(0.131)).toBeCloseTo(0.131, 9);
});

test("splits the bonus into where each part of it came from", () => {
  expect(bonusFor(GRAIN, WESTERN_COSTA_RICA, COSTA_RICA, 2, NOW)).toEqual({
    strategic: 0,
    specialization: 0,
    resource: 30,
    deposit: 30,
    total: 60,
  });

  expect(bonusFor(STEEL, CENTRAL_THAILAND, THAILAND, 2, NOW)).toEqual({
    strategic: 30.75,
    specialization: 30,
    resource: 0,
    deposit: 0,
    total: 60.75,
  });
});

test("a deposit only counts while it is running", () => {
  const deposit = WESTERN_COSTA_RICA.deposit!;

  expect(depositActive(deposit, NOW)).toBe(true);
  expect(depositActive(deposit, Date.parse("2026-08-20T00:00:00.000Z"))).toBe(false);
  expect(depositActive(deposit, Date.parse("2026-08-26T00:00:00.000Z"))).toBe(false);
  expect(bonusFor(GRAIN, WESTERN_COSTA_RICA, COSTA_RICA, 0, Date.parse("2026-08-26T00:00:00.000Z")).total).toBe(30);
});

test("a raw resource only grows where its climate suits it", () => {
  const polar: Region = { id: "p", name: "Polar", countryId: "cr", climate: "polar" };

  expect(canProduceIn(GRAIN, polar)).toBe(false);
  expect(wageFor(GRAIN, polar, COSTA_RICA, 0, { grain: 0.076 }, NOW)).toBeNull();
  // Nothing refined cares about the weather.
  expect(canProduceIn(STEEL, polar)).toBe(true);
});

test("nothing a company can't be set to produce is costed", () => {
  expect(canProduceIn(KNIFE, WESTERN_COSTA_RICA)).toBe(false);
  expect(wageFor(KNIFE, WESTERN_COSTA_RICA, COSTA_RICA, 0, { knife: 12 }, NOW)).toBeNull();
});

test("an unquoted item or input has no wage rather than a wage of zero", () => {
  expect(wageFor(GRAIN, WESTERN_COSTA_RICA, COSTA_RICA, 0, {}, NOW)).toBeNull();
  expect(wageFor(STEEL, CENTRAL_THAILAND, THAILAND, 2, { steel: 1.625 }, NOW)).toBeNull();
});

test("ranks by the wage that reaches the worker, not the one the company posts", () => {
  const taxed: Country = { ...THAILAND, _id: "taxed", name: "Taxed", specializedItem: undefined, taxes: { income: 50, market: 1, selfWork: 1 } };
  const regions: Region[] = [
    { ...CENTRAL_THAILAND, id: "a", countryId: "th" },
    { ...CENTRAL_THAILAND, id: "b", name: "Taxland", countryId: "taxed" },
  ];

  const ranked = rankPlacements([IRON], regions, [THAILAND, taxed], {}, { iron: 0.081 }, 10, NOW);

  expect(ranked.map(placement => placement.country.name)).toEqual(["Thailand", "Taxed"]);
  expect(ranked[0]!.wage.incomeTax).toBe(8);
});

test("one country can't fill the table with its own provinces", () => {
  // Every Thai region shares Thailand's bonuses, so only its best one stands.
  const regions: Region[] = ["a", "b", "c"].map(id => ({ ...CENTRAL_THAILAND, id, name: `Thai ${id}` }));
  regions[1]!.deposit = { type: "iron", bonusPercent: 30 };

  const ranked = rankPlacements([IRON], regions, [THAILAND], {}, { iron: 0.081 }, 10, NOW);

  expect(ranked).toHaveLength(1);
  expect(ranked[0]!.region.name).toBe("Thai b");
  expect(ranked[0]!.wage.bonus.deposit).toBe(30);
});

test("reads regions and prices out of the shapes upstream sends", () => {
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

  // The book is not sorted, and a side with nothing on it is not a price of zero.
  expect(
    bestBids(["grain", "iron", "steel"], [
      { result: { data: { buyOrders: [{ price: 0.074 }, { price: 0.076 }, { price: 0.075 }] } } },
      { result: { data: { buyOrders: [] } } },
      { error: { message: "nope" } },
    ]),
  ).toEqual({ grain: 0.076 });
});
