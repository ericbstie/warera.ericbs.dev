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

function Row({ level, color, maxQuantity }: { level: PriceLevel; color: string; maxQuantity: number }) {
  const pct = maxQuantity > 0 ? (level.quantity / maxQuantity) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-xs sm:text-sm">
      <span className="w-16 shrink-0 text-right tabular-nums sm:w-20" style={{ color }}>
        {formatPrice(level.price)}
      </span>
      <div className="h-4 flex-1 overflow-hidden rounded-sm" style={{ backgroundColor: TRACK }}>
        <div className="h-full rounded-sm" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="w-16 shrink-0 text-right tabular-nums sm:w-20" style={{ color: MUTED }}>
        {formatQuantity(level.quantity)}
      </span>
    </div>
  );
}

export function DepthOfMarket({ itemCode }: { itemCode: string }) {
  const { buyOrders, sellOrders, loading, error } = useTransactions(itemCode);

  const asks = useMemo(() => groupOrdersByPrice(sellOrders), [sellOrders]);
  const bids = useMemo(() => groupOrdersByPrice(buyOrders), [buyOrders]);
  const maxQuantity = useMemo(
    () => Math.max(0, ...asks.map(level => level.quantity), ...bids.map(level => level.quantity)),
    [asks, bids],
  );
  const spread = asks.length && bids.length ? asks[asks.length - 1]!.price - bids[0]!.price : null;

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
          {asks.map(level => (
            <Row key={level.price} level={level} color={ASK_COLOR} maxQuantity={maxQuantity} />
          ))}
          <div
            className="flex items-center justify-between border-y px-1 py-1 text-xs"
            style={{ borderColor: BORDER, color: MUTED }}
          >
            <span>Spread</span>
            <span>{spread !== null ? spread.toFixed(3) : "—"}</span>
          </div>
          {bids.map(level => (
            <Row key={level.price} level={level} color={BID_COLOR} maxQuantity={maxQuantity} />
          ))}
        </div>
      )}
    </div>
  );
}
