import { expect, test } from "bun:test";
import { type MarketItem } from "./hooks";
import { searchItems } from "./search";

const ITEMS: MarketItem[] = [
  { code: "ammoBox", type: "product" },
  { code: "coal", type: "raw" },
  { code: "concrete", type: "product" },
  { code: "helmet1", type: "equipment" },
  { code: "iron", type: "raw" },
  { code: "ironOre", type: "raw" },
  { code: "lightAmmo", type: "product" },
  { code: "limestone", type: "raw" },
  { code: "oil", type: "raw" },
  { code: "steak", type: "product" },
  { code: "steel", type: "product" },
];

const codes = (query: string, limit?: number) =>
  searchItems(ITEMS, query, limit).map(item => item.code);

test("an exact code match comes first", () => {
  expect(codes("iron")[0]).toBe("iron");
  expect(codes("iron")).toContain("ironOre");
});

test("a code that starts with the query beats one that merely contains it", () => {
  expect(codes("ammo")).toEqual(["ammoBox", "lightAmmo"]);
});

test("the spelled-out label matches too", () => {
  expect(codes("light a")).toEqual(["lightAmmo"]);
});

test("the query's letters can be spread through the code", () => {
  expect(codes("lam")).toContain("lightAmmo");
});

test("matching ignores case and surrounding whitespace", () => {
  expect(codes("  IRONore  ")).toEqual(["ironOre"]);
});

test("a blank query lists the head of the item list unchanged", () => {
  expect(codes("   ")).toEqual(ITEMS.slice(0, 8).map(item => item.code));
});

test("the limit caps the results", () => {
  expect(codes("", 3)).toEqual(["ammoBox", "coal", "concrete"]);
  expect(codes("o", 2)).toHaveLength(2);
});

test("nothing matching is an empty list, not a throw", () => {
  expect(codes("zzz")).toEqual([]);
});

test("equally good matches stay in alphabetical order", () => {
  const shuffled: MarketItem[] = [
    { code: "steel", type: "product" },
    { code: "steak", type: "product" },
  ];
  expect(searchItems(shuffled, "ste").map(item => item.code)).toEqual(["steak", "steel"]);
});

test("odd input is survivable", () => {
  expect(searchItems(null as unknown as MarketItem[], "iron")).toEqual([]);
  expect(searchItems(ITEMS, undefined as unknown as string, Number.NaN)).toHaveLength(8);
  expect(searchItems([{ code: undefined } as unknown as MarketItem, ...ITEMS], "iron")[0]?.code).toBe(
    "iron",
  );
});
