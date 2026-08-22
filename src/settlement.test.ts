import { expect, test } from "bun:test";
import { rankPlacements, type Country } from "./settlement";

const taxes = { income: 5, market: 1, selfWork: 2 };

function country(id: string, productionPercent: number, specializedItem?: string): Country {
  return {
    _id: id,
    name: id,
    taxes,
    specializedItem,
    rulingParty: specializedItem ? `party-${id}` : undefined,
    strategicResources: { bonuses: { productionPercent } },
  };
}

test("strategic resources pay for the specialized item and nothing else", () => {
  // The game only lifts what a country specializes in, so strategic resources
  // buy an iron company nothing in a country that has settled on wood.
  const countries = [country("low", 5, "iron"), country("high", 20, "iron"), country("elsewhere", 40, "wood")];
  const ranked = rankPlacements(countries, {}, "iron");

  expect(ranked.map(p => p.country)).toEqual(["high", "low", "elsewhere"]);
  expect(ranked.map(p => p.totalBonus)).toEqual([20, 5, 0]);
});

test("a specializing country adds its ethic on top of its strategic resources", () => {
  const top = rankPlacements([country("both", 25, "iron")], { both: 2 }, "iron")[0]!;

  expect(top).toMatchObject({ strategicBonus: 25, ethicBonus: 30, totalBonus: 55 });
});

test("adds 30% for an industrial item at industrialism 2", () => {
  const countries = [country("strategic", 25), country("industrialist", 0, "iron")];
  const top = rankPlacements(countries, { industrialist: 2 }, "iron")[0]!;

  expect(top.country).toBe("industrialist");
  expect(top.ethicBonus).toBe(30);
  expect(top.totalBonus).toBe(30);
});

test("adds 10% at industrialism 1 and nothing at 0", () => {
  const countries = [country("a", 0, "iron"), country("b", 0, "iron")];
  const ranked = rankPlacements(countries, { a: 1, b: 0 }, "iron");

  expect(ranked.map(p => p.totalBonus)).toEqual([10, 0]);
});

test("the ethic pays on the item's own axis, not on the specialization", () => {
  // Wood is industrial too, so an industrialist country lifts it whether or not
  // it is the item that country specializes in.
  const countries = [country("industrialist", 0, "iron")];

  expect(rankPlacements(countries, { industrialist: 2 }, "wood")[0]!.totalBonus).toBe(30);
  // Cooked fish is prepared rather than grown or dug, so neither end pays.
  expect(rankPlacements(countries, { industrialist: 2 }, "cookedFish")[0]!.totalBonus).toBe(0);
  // And an agrarian party pays for grain where an industrialist one does not.
  expect(rankPlacements(countries, { industrialist: -2 }, "grain")[0]!.totalBonus).toBe(30);
});

test("keeps taxes and caps the list at the limit", () => {
  const countries = Array.from({ length: 14 }, (_, i) => country(`c${i}`, i));
  const ranked = rankPlacements(countries, {}, "iron");

  expect(ranked).toHaveLength(10);
  expect(ranked[0]!.taxes).toEqual(taxes);
});

test("countries stay distinguishable when their display names aren't", () => {
  // Two countries sharing a name, and one with none, all keyed on the name
  // collided in React and rendered as a single row.
  const countries = [
    { ...country("a", 20), name: "Nordland" },
    { ...country("b", 10), name: "Nordland" },
    { ...country("c", 5), name: undefined as unknown as string },
  ];

  const ids = rankPlacements(countries, {}, "iron").map(placement => placement.id);
  expect(ids).toEqual(["a", "b", "c"]);
  expect(new Set(ids).size).toBe(ids.length);
});
