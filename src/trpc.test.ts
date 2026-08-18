import { expect, test } from "bun:test";
import {
  cacheControl,
  chunk,
  industrialismByParty,
  levelsByCountry,
  partyBatchPath,
  ttlFor,
  TRPC_DEFAULT_TTL_MS,
} from "./trpc";

test("known procedures keep their own ttl, everything else takes the default", () => {
  expect(ttlFor("tradingOrder.getTopOrders")).toBe(45 * 1000);
  expect(ttlFor("country.getAllCountries")).toBe(60 * 60 * 1000);
  expect(ttlFor("something.unknown")).toBe(TRPC_DEFAULT_TTL_MS);
});

test("max-age is what is left of the server entry, not a fresh ttl", () => {
  const now = 1_000_000;
  expect(cacheControl("MISS", now + 3600_000, now)).toBe("public, max-age=3600");
  expect(cacheControl("HIT", now + 42_500, now)).toBe("public, max-age=42");
});

test("an expired or stale entry is never worth keeping", () => {
  const now = 1_000_000;
  expect(cacheControl("STALE", now + 3600_000, now)).toBe("public, max-age=0");
  expect(cacheControl("HIT", now - 5_000, now)).toBe("public, max-age=0");
});

test("chunk splits into full groups plus the remainder", () => {
  expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  expect(chunk([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  expect(chunk([], 50)).toEqual([]);
});

test("a batch path asks for one procedure per party id", () => {
  const path = partyBatchPath(["a", "b"]);
  expect(path.startsWith("party.getById,party.getById?batch=1&input=")).toBe(true);
  const input = JSON.parse(decodeURIComponent(path.split("input=")[1]!));
  expect(input).toEqual({ 0: { partyId: "a" }, 1: { partyId: "b" } });
});

test("a batch response maps back onto the ids that asked for it", () => {
  const entries = [
    { result: { data: { ethics: { industrialism: 2 } } } },
    { result: { data: { ethics: { industrialism: 0 } } } },
  ];

  expect(industrialismByParty(["a", "b"], entries)).toEqual({ a: 2, b: 0 });
});

test("a party with no ethics counts as zero rather than failing the batch", () => {
  expect(industrialismByParty(["a"], [{ result: { data: {} } }])).toEqual({ a: 0 });
});

test("a failed entry fails the whole batch instead of reading as zero", () => {
  const entries = [{ result: { data: { ethics: { industrialism: 2 } } } }, { error: { message: "nope" } }];

  expect(() => industrialismByParty(["a", "b"], entries)).toThrow();
});

test("a short batch fails rather than dropping the ids it never answered", () => {
  expect(() => industrialismByParty(["a", "b"], [{ result: { data: {} } }])).toThrow();
});

test("levels are keyed by country, not by the party that rules it", () => {
  const countries = [
    { _id: "bo", rulingParty: "party-1" },
    { _id: "ar", rulingParty: "party-2" },
  ];

  expect(levelsByCountry(countries, { "party-1": 2, "party-2": 1 })).toEqual({ bo: 2, ar: 1 });
});

test("countries sharing a ruling party both get its level", () => {
  const countries = [
    { _id: "bo", rulingParty: "party-1" },
    { _id: "ar", rulingParty: "party-1" },
  ];

  expect(levelsByCountry(countries, { "party-1": 2 })).toEqual({ bo: 2, ar: 2 });
});

test("a country whose party never came back is zero, not undefined", () => {
  expect(levelsByCountry([{ _id: "bo", rulingParty: "missing" }], {})).toEqual({ bo: 0 });
});
