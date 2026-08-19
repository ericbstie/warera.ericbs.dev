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

test("ranks by strategic bonus when nobody specializes", () => {
  const countries = [country("low", 5), country("high", 20), country("mid", 12)];

  expect(rankPlacements(countries, {}, "iron").map(p => p.country)).toEqual(["high", "mid", "low"]);
});

test("adds 30% for a matching specialization at industrialism 2", () => {
  const countries = [country("strategic", 25), country("specialist", 0, "iron")];
  const top = rankPlacements(countries, { specialist: 2 }, "iron")[0]!;

  expect(top.country).toBe("specialist");
  expect(top.specializationBonus).toBe(30);
  expect(top.totalBonus).toBe(30);
});

test("adds 10% at industrialism 1 and nothing at 0", () => {
  const countries = [country("a", 0, "iron"), country("b", 0, "iron")];
  const ranked = rankPlacements(countries, { a: 1, b: 0 }, "iron");

  expect(ranked.map(p => p.totalBonus)).toEqual([10, 0]);
});

test("only applies the specialization to its own item", () => {
  const countries = [country("specialist", 0, "iron")];

  expect(rankPlacements(countries, { specialist: 2 }, "wood")[0]!.totalBonus).toBe(0);
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
