import { afterEach, expect, mock, test } from "bun:test";
import { fetchOrders, groupOrdersByPrice, type Order } from "./orders";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch(payload: unknown) {
  const fetchMock = mock(async () => Response.json(payload));
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
  expect(fetchMock.mock.calls[0][0]).toContain(encodeURIComponent('{"itemCode":"iron"}'));
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
