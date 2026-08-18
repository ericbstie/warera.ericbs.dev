import { afterEach, expect, mock, test } from "bun:test";
import { fetchTransactionHistory, itemLabel, toPriceHistory, type Transaction } from "./hooks";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch(payload: unknown) {
  const fetchMock = mock(async (...args: Parameters<typeof fetch>) => (void args, Response.json(payload)));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

const day: Transaction = {
  valueAt: "2026-08-17",
  avgValue: 0.0815,
  totalValue: 262174,
  totalQuantity: 3215955,
  transactionsCount: 4761,
};

test("fetchTransactionHistory requests the item and returns its daily values", async () => {
  const fetchMock = stubFetch({ result: { data: { itemCode: "iron", values: [day] } } });

  expect(await fetchTransactionHistory("iron")).toEqual([day]);
  expect(String(fetchMock.mock.calls[0]?.[0])).toContain(encodeURIComponent('{"itemCode":"iron"}'));
});

test("fetchTransactionHistory returns nothing when an item has never traded", async () => {
  stubFetch({ result: { data: { itemCode: "iron" } } });

  expect(await fetchTransactionHistory("iron")).toEqual([]);
});

test("fetchTransactionHistory throws on an api error", async () => {
  stubFetch({ error: { message: "Itemtradings not found." } });

  expect(fetchTransactionHistory("helmet1")).rejects.toThrow("Itemtradings not found.");
});

test("toPriceHistory keeps only the date and average price", () => {
  expect(toPriceHistory([day])).toEqual([{ date: "2026-08-17", price: 0.0815 }]);
});

test("turns an item code into words", () => {
  expect(itemLabel("oil")).toBe("Oil");
  expect(itemLabel("lightAmmo")).toBe("Light Ammo");
  expect(itemLabel("helmet12")).toBe("Helmet 12");
  expect(itemLabel("")).toBe("");
});
