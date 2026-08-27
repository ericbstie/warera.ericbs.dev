import { afterEach, expect, mock, test } from "bun:test";
import { fetchTransactionHistory, fetchWeeklyMovers, historyPath, itemLabel, toPriceHistory, type Transaction } from "./hooks";

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

test("a long range asks for daily bars and a short one for the polled ones", () => {
  expect(historyPath("iron", "30D")).toBe("/api/history?itemCode=iron&days=30");
  // A week or less is drawn from the 15-minute poll.
  expect(historyPath("iron", "1D")).toBe("/api/history?itemCode=iron&days=1&intraday=1");
  expect(historyPath("iron", "7D")).toBe("/api/history?itemCode=iron&days=7&intraday=1");
  // ALL names no window, so the server hands back everything it holds.
  expect(historyPath("iron", "ALL")).toBe("/api/history?itemCode=iron");
});

test("fetchTransactionHistory reads the server's own record", async () => {
  const fetchMock = stubFetch({ bars: [day] });

  expect(await fetchTransactionHistory("iron", "30D")).toEqual([day]);
  expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/history?itemCode=iron&days=30");
});

test("fetchTransactionHistory returns nothing when an item has never traded", async () => {
  stubFetch({ bars: [] });

  expect(await fetchTransactionHistory("iron", "30D")).toEqual([]);
});

test("fetchTransactionHistory throws on an api error", async () => {
  stubFetch({ error: { message: "Itemtradings not found." } });

  expect(fetchTransactionHistory("helmet1", "30D")).rejects.toThrow("Itemtradings not found.");
});

test("fetchTransactionHistory refuses a shape it doesn't recognise", async () => {
  stubFetch({ result: { data: { values: [day] } } });

  expect(fetchTransactionHistory("iron", "30D")).rejects.toThrow("unexpected shape");
});

test("the movers strip takes one request and shows only listed items", async () => {
  const fetchMock = stubFetch({
    movers: [
      { code: "iron", changePct: 4 },
      { code: "retired", changePct: 9 },
      { code: "broken", changePct: null },
    ],
  });

  expect(await fetchWeeklyMovers(["iron", "broken"])).toEqual([{ code: "iron", changePct: 4 }]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/movers");
});

test("an empty item list asks for nothing at all", async () => {
  const fetchMock = stubFetch({ movers: [] });

  expect(await fetchWeeklyMovers([])).toEqual([]);
  expect(fetchMock).not.toHaveBeenCalled();
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
