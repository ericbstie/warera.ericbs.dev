import { useMemo } from "react";
import { groupOrdersByPrice, useTransactions, type PriceLevel } from "./orders";

const ASK_COLOR = "#f87171";
const BID_COLOR = "#4ade80";
const TRACK = "#14110f";
const BORDER = "#3a322e";
const MUTED = "#a8a29e";
const TEXT = "#ede9e6";

function formatPrice(price: number) {
  return price.toFixed(3);
}

function formatQuantity(quantity: number) {
  return quantity.toLocaleString();
}

function Side({
  level,
  color,
  maxQuantity,
  side,
}: {
  level: PriceLevel | undefined;
  color: string;
  maxQuantity: number;
  side: "bid" | "ask";
}) {
  const pct = level && maxQuantity > 0 ? (level.quantity / maxQuantity) * 100 : 0;
  const bid = side === "bid";
  const align = bid ? "text-left" : "text-right";
  // The bid half is laid out in reverse so both halves read outward-in: price,
  // quantity, then a bar track flush against the centre line.
  return (
    <div className={`flex flex-1 items-center gap-1 sm:gap-2 ${bid ? "flex-row-reverse" : ""}`}>
      <div
        className={`h-4 flex-1 overflow-hidden rounded-sm ${bid ? "flex justify-end" : ""}`}
        style={{ backgroundColor: level ? TRACK : "transparent" }}
      >
        <div className="h-full rounded-sm" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className={`w-10 shrink-0 tabular-nums sm:w-16 ${align}`} style={{ color: MUTED }}>
        {level ? formatQuantity(level.quantity) : ""}
      </span>
      <span className={`w-10 shrink-0 tabular-nums sm:w-16 ${align}`} style={{ color }}>
        {level ? formatPrice(level.price) : ""}
      </span>
    </div>
  );
}

function Row({ bid, ask, maxQuantity }: { bid?: PriceLevel; ask?: PriceLevel; maxQuantity: number }) {
  return (
    <div className="flex items-center gap-1 text-[10px] sm:gap-2 sm:text-sm">
      <Side level={bid} color={BID_COLOR} maxQuantity={maxQuantity} side="bid" />
      <div className="w-px shrink-0 self-stretch" style={{ backgroundColor: BORDER }} />
      <Side level={ask} color={ASK_COLOR} maxQuantity={maxQuantity} side="ask" />
    </div>
  );
}

export function DepthOfMarket({ itemCode }: { itemCode: string }) {
  const { buyOrders, sellOrders, loading, error } = useTransactions(itemCode);

  // Best price first on each side, so row n pairs the nth-best bid with the nth-best ask.
  const asks = useMemo(() => groupOrdersByPrice(sellOrders).reverse(), [sellOrders]);
  const bids = useMemo(() => groupOrdersByPrice(buyOrders), [buyOrders]);
  const maxQuantity = useMemo(
    () => Math.max(0, ...asks.map(level => level.quantity), ...bids.map(level => level.quantity)),
    [asks, bids],
  );
  const spread = asks.length && bids.length ? asks[0]!.price - bids[0]!.price : null;
  const rowCount = Math.max(asks.length, bids.length);

  const message = loading
    ? "Loading…"
    : error
      ? "Couldn't load order book."
      : asks.length || bids.length
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
          {Array.from({ length: rowCount }, (_, i) => (
            <Row key={i} bid={bids[i]} ask={asks[i]} maxQuantity={maxQuantity} />
          ))}
        </div>
      )}
    </div>
  );
}
