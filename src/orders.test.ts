import { afterEach, expect, mock, test } from "bun:test";
import {
  bestPricesFromBatch,
  fetchBestPrices,
  fetchOrders,
  groupOrdersByPrice,
  ORDER_BOOK_BATCH_SIZE,
  type Order,
} from "./orders";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch(payload: unknown) {
  const fetchMock = mock(async (...args: Parameters<typeof fetch>) => (void args, Response.json(payload)));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function order(overrides: Partial<Order>): Order {
  return {
    _id: "1",
    user: "u1",
    itemCode: "iron",
    quantity: 100,
    price: 0.081,
    offerAt: "2026-08-17T00:00:00.000Z",
    type: "buy",
    ...overrides,
  };
}

test("fetchOrders requests the item and returns its buy/sell orders", async () => {
  const buyOrders = [order({ type: "buy" })];
  const sellOrders = [order({ _id: "2", type: "sell", price: 0.082 })];
  const fetchMock = stubFetch({ result: { data: { buyOrders, sellOrders } } });

  expect(await fetchOrders("iron")).toEqual({ buyOrders, sellOrders });
  expect(String(fetchMock.mock.calls[0]?.[0])).toContain(encodeURIComponent('{"itemCode":"iron"}'));
});

test("fetchOrders returns empty arrays when a side is missing", async () => {
  stubFetch({ result: { data: { buyOrders: [] } } });

  expect(await fetchOrders("iron")).toEqual({ buyOrders: [], sellOrders: [] });
});

test("fetchOrders throws on an api error", async () => {
  stubFetch({ error: { message: "Item not found." } });

  expect(fetchOrders("helmet1")).rejects.toThrow("Item not found.");
});

test("groupOrdersByPrice sums quantity across orders sharing a price", () => {
  const orders = [
    order({ _id: "1", user: "a", price: 0.081, quantity: 100 }),
    order({ _id: "2", user: "b", price: 0.081, quantity: 50 }),
    order({ _id: "3", user: "c", price: 0.082, quantity: 20 }),
  ];

  expect(groupOrdersByPrice(orders)).toEqual([
    { price: 0.082, quantity: 20 },
    { price: 0.081, quantity: 150 },
  ]);
});

test("groupOrdersByPrice sorts levels from highest price to lowest", () => {
  const orders = [
    order({ _id: "1", price: 36.5, quantity: 1 }),
    order({ _id: "2", price: 36.7, quantity: 1 }),
    order({ _id: "3", price: 36.6, quantity: 1 }),
  ];

  expect(groupOrdersByPrice(orders).map(l => l.price)).toEqual([36.7, 36.6, 36.5]);
});

test("groupOrdersByPrice returns an empty list for no orders", () => {
  expect(groupOrdersByPrice([])).toEqual([]);
});

test("bestPricesFromBatch takes the highest bid and the lowest ask per item", () => {
  const prices = bestPricesFromBatch(["iron", "steel", "grain"], [
    {
      result: {
        data: {
          buyOrders: [order({ price: 0.08 }), order({ price: 0.081 }), order({ price: 0 })],
          sellOrders: [order({ price: 0.085, type: "sell" }), order({ price: 0.083, type: "sell" })],
        },
      },
    },
    // A one-sided book prices only the side it has.
    { result: { data: { buyOrders: [], sellOrders: [order({ price: 1.7, type: "sell" })] } } },
    // A failed entry leaves the item unpriced rather than priced at zero.
    { error: { message: "nope" } },
  ]);

  expect(prices).toEqual({ bids: { iron: 0.081 }, asks: { iron: 0.083, steel: 1.7 } });
});

test("bestPricesFromBatch refuses a batch that doesn't line up with what was asked", () => {
  expect(() => bestPricesFromBatch(["iron", "steel"], [{ result: { data: {} } }])).toThrow();
  expect(() => bestPricesFromBatch(["iron"], { result: {} })).toThrow();
});

test("fetchBestPrices asks for every item, in batches", async () => {
  const codes = Array.from({ length: ORDER_BOOK_BATCH_SIZE + 1 }, (_, i) => `item${i}`);
  const fetchMock = mock(async (...args: Parameters<typeof fetch>) => {
    const url = String(args[0]);
    // One procedure name per item asked for, so the answer is one entry each.
    const count = (url.slice(0, url.indexOf("?")).match(/getTopOrders/g) ?? []).length;
    return Response.json(
      Array.from({ length: count }, () => ({ result: { data: { buyOrders: [order({ price: 2 })], sellOrders: [] } } })),
    );
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  const prices = await fetchBestPrices(codes);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(Object.keys(prices.bids)).toHaveLength(codes.length);
  expect(prices.bids.item20).toBe(2);
});
