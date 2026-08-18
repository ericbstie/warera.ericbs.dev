import { useMemo } from "react";
import { groupOrdersByPrice, useTransactions, type Order } from "./orders";

const ASK_COLOR = "#f87171";
const BID_COLOR = "#4ade80";
const TRACK = "#14110f";
const BORDER = "#3a322e";
const MUTED = "#a8a29e";
const TEXT = "#ede9e6";

const TICK = 0.001;
// One row per tick, so a book with a far-out order would otherwise run to
// thousands of rows. The rows nearest the spread are the ones worth showing.
const MAX_ROWS = 250;

type Ladder = { quantities: Map<number, number>; bestTick: number; step: 1 | -1; rows: number };
type Cell = { price: number | null; quantity: number };

function formatPrice(price: number) {
  return price.toFixed(3);
}

function formatQuantity(quantity: number) {
  return quantity.toLocaleString();
}

/** Buckets orders into whole ticks and measures how many rows the side spans. */
function buildLadder(orders: Order[], side: "bid" | "ask"): Ladder | null {
  const levels = groupOrdersByPrice(orders);
  if (!levels.length) return null;

  const quantities = new Map<number, number>();
  for (const level of levels) {
    const tick = Math.round(level.price / TICK);
    quantities.set(tick, (quantities.get(tick) ?? 0) + level.quantity);
  }

  const ticks = [...quantities.keys()];
  const step = side === "bid" ? -1 : 1;
  const bestTick = side === "bid" ? Math.max(...ticks) : Math.min(...ticks);
  const worstTick = side === "bid" ? Math.min(...ticks) : Math.max(...ticks);
  return { quantities, bestTick, step, rows: Math.min(MAX_ROWS, Math.abs(worstTick - bestTick) + 1) };
}

function cellAt(ladder: Ladder | null, row: number): Cell {
  if (!ladder || row >= ladder.rows) return { price: null, quantity: 0 };
  const tick = ladder.bestTick + row * ladder.step;
  return { price: tick * TICK, quantity: ladder.quantities.get(tick) ?? 0 };
}

function Side({
  cell,
  color,
  maxQuantity,
  side,
}: {
  cell: Cell;
  color: string;
  maxQuantity: number;
  side: "bid" | "ask";
}) {
  const pct = maxQuantity > 0 ? (cell.quantity / maxQuantity) * 100 : 0;
  const bid = side === "bid";
  const align = bid ? "text-left" : "text-right";
  // The bid half is laid out in reverse so both halves read outward-in: price,
  // quantity, then a bar track flush against the centre line.
  return (
    <div className={`flex flex-1 items-center gap-1 sm:gap-2 ${bid ? "flex-row-reverse" : ""}`}>
      <div
        className={`h-4 flex-1 overflow-hidden rounded-sm ${bid ? "flex justify-end" : ""}`}
        style={{ backgroundColor: cell.price === null ? "transparent" : TRACK }}
      >
        <div className="h-full rounded-sm" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className={`w-10 shrink-0 tabular-nums sm:w-16 ${align}`} style={{ color: MUTED }}>
        {cell.quantity > 0 ? formatQuantity(cell.quantity) : ""}
      </span>
      <span
        className={`w-10 shrink-0 tabular-nums sm:w-16 ${align}`}
        style={{ color: cell.quantity > 0 ? color : MUTED }}
      >
        {cell.price === null ? "" : formatPrice(cell.price)}
      </span>
    </div>
  );
}

function Row({ bid, ask, maxQuantity }: { bid: Cell; ask: Cell; maxQuantity: number }) {
  return (
    <div className="flex items-center gap-1 text-[10px] sm:gap-2 sm:text-sm">
      <Side cell={bid} color={BID_COLOR} maxQuantity={maxQuantity} side="bid" />
      <div className="w-px shrink-0 self-stretch" style={{ backgroundColor: BORDER }} />
      <Side cell={ask} color={ASK_COLOR} maxQuantity={maxQuantity} side="ask" />
    </div>
  );
}

export function DepthOfMarket({ itemCode }: { itemCode: string }) {
  const { buyOrders, sellOrders, loading, error } = useTransactions(itemCode);

  // Each side walks away from its best price one tick at a time, so row n is
  // always 0.001 further out than row n - 1 whether or not orders rest there.
  const bids = useMemo(() => buildLadder(buyOrders, "bid"), [buyOrders]);
  const asks = useMemo(() => buildLadder(sellOrders, "ask"), [sellOrders]);
  const rowCount = Math.max(bids?.rows ?? 0, asks?.rows ?? 0);
  const maxQuantity = useMemo(
    () => Math.max(0, ...(bids?.quantities.values() ?? []), ...(asks?.quantities.values() ?? [])),
    [bids, asks],
  );
  const spread = bids && asks ? (asks.bestTick - bids.bestTick) * TICK : null;

  const message = loading
    ? "Loading…"
    : error
      ? "Couldn't load order book."
      : rowCount
        ? null
        : "No open orders for this item.";

  return (
    <div className="rounded border p-4" style={{ borderColor: BORDER, backgroundColor: "#211c19" }}>
      <h2 className="mb-3 text-sm font-medium" style={{ color: TEXT }}>
        Order book
      </h2>
      {message ? (
        <p className="flex h-24 items-center justify-center text-sm" style={{ color: MUTED }}>
          {message}
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1 text-[10px] sm:gap-2 sm:text-xs" style={{ color: MUTED }}>
            <span className="flex-1" style={{ color: BID_COLOR }}>
              Bids
            </span>
            <span className="shrink-0 px-1">Spread {spread !== null ? spread.toFixed(3) : "—"}</span>
            <span className="flex-1 text-right" style={{ color: ASK_COLOR }}>
              Asks
            </span>
          </div>
          {/* Both halves live in the same rows, so one scroller moves them together. */}
          <div className="flex max-h-72 flex-col gap-1 overflow-y-auto sm:max-h-96">
            {Array.from({ length: rowCount }, (_, row) => (
              <Row key={row} bid={cellAt(bids, row)} ask={cellAt(asks, row)} maxQuantity={maxQuantity} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
