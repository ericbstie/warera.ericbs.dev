import { useEffect, useMemo, useRef, useState } from "react";
import { groupOrdersByPrice, useTransactions, type Order } from "./orders";

const ASK_COLOR = "var(--down)";
const BID_COLOR = "var(--up)";
const HIGHLIGHT = "color-mix(in srgb, var(--ink) 10%, transparent)";
const BORDER = "var(--edge)";
const MUTED = "var(--muted)";
const TEXT = "var(--ink)";

const TICK = 0.001;
// One column per tick, so a book with a far-out order would otherwise run to
// thousands of columns. The columns nearest the spread are the ones worth showing.
const MAX_COLUMNS = 250;
const CHART_HEIGHT = "h-40 sm:h-56";

type Column = { price: number; quantity: number };

function formatPrice(price: number) {
  return price.toFixed(3);
}

function formatQuantity(quantity: number) {
  return quantity.toLocaleString();
}

/** Buckets orders into whole ticks and walks outward from the best price. */
function buildColumns(orders: Order[], side: "bid" | "ask"): Column[] {
  const levels = groupOrdersByPrice(orders);
  if (!levels.length) return [];

  const quantities = new Map<number, number>();
  for (const level of levels) {
    const tick = Math.round(level.price / TICK);
    quantities.set(tick, (quantities.get(tick) ?? 0) + level.quantity);
  }

  const ticks = [...quantities.keys()];
  const step = side === "bid" ? -1 : 1;
  const bestTick = side === "bid" ? Math.max(...ticks) : Math.min(...ticks);
  const worstTick = side === "bid" ? Math.min(...ticks) : Math.max(...ticks);
  const count = Math.min(MAX_COLUMNS, Math.abs(worstTick - bestTick) + 1);

  const columns: Column[] = [];
  for (let index = 0; index < count; index++) {
    const tick = bestTick + index * step;
    columns.push({ price: tick * TICK, quantity: quantities.get(tick) ?? 0 });
  }
  // Bids were walked down from the best bid, so flip them to read left to right.
  return side === "bid" ? columns.reverse() : columns;
}

function Bar({
  column,
  color,
  maxQuantity,
  active,
  best,
  onActivate,
}: {
  column: Column;
  color: string;
  maxQuantity: number;
  active: boolean;
  best: "bid" | "ask" | null;
  onActivate: () => void;
}) {
  const pct = maxQuantity > 0 ? (column.quantity / maxQuantity) * 100 : 0;
  // The two standing prices meet at the spread, so each hangs off the edge of
  // its column that faces away from it rather than sitting centred, where the
  // two would print over each other.
  const anchor =
    best === "bid" ? "right-0" : best === "ask" ? "left-0" : "left-1/2 -translate-x-1/2";
  return (
    <div
      className="relative min-w-2 max-w-6 flex-1 cursor-pointer px-px sm:min-w-3"
      style={{ backgroundColor: active ? HIGHLIGHT : "transparent" }}
      onPointerEnter={onActivate}
    >
      <div className={`flex items-end ${CHART_HEIGHT}`}>
        {/* A resting tick that rounds to nothing still deserves to be visible. */}
        <div
          className="w-full rounded-t-sm"
          style={{ height: `${pct}%`, minHeight: column.quantity > 0 ? 2 : 0, backgroundColor: color }}
        />
      </div>
      <div className="relative h-4">
        {(best || active) && (
          <span
            className={`absolute top-0 whitespace-nowrap text-[9px] tabular-nums sm:text-[10px] ${anchor}`}
            style={{ color: active ? TEXT : color }}
          >
            {formatPrice(column.price)}
          </span>
        )}
      </div>
    </div>
  );
}

export function DepthOfMarket({ itemCode }: { itemCode: string }) {
  const { buyOrders, sellOrders, loading, error } = useTransactions(itemCode);
  // Hovering reads a column on a pointer; tapping does the same on touch.
  const [active, setActive] = useState<Column | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const spreadRef = useRef<HTMLDivElement>(null);

  // Each side steps away from its best price one tick at a time, so column n is
  // always 0.001 further out than column n - 1 whether or not orders rest there.
  const bids = useMemo(() => buildColumns(buyOrders, "bid"), [buyOrders]);
  const asks = useMemo(() => buildColumns(sellOrders, "ask"), [sellOrders]);
  const maxQuantity = useMemo(
    () => Math.max(0, ...bids.map(column => column.quantity), ...asks.map(column => column.quantity)),
    [bids, asks],
  );

  const bestBid = bids.at(-1)?.price ?? null;
  const bestAsk = asks[0]?.price ?? null;
  const spread = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;

  // A deep book is wider than the panel, and the spread is the part worth
  // opening on rather than the far end of the bids.
  useEffect(() => {
    setActive(null);
    const scroller = scrollerRef.current;
    const spreadLine = spreadRef.current;
    if (!scroller || !spreadLine) return;
    scroller.scrollLeft = spreadLine.offsetLeft - scroller.clientWidth / 2;
  }, [bids, asks]);

  const message = loading
    ? "Loading…"
    : error
      ? "Couldn't load order book."
      : bids.length || asks.length
        ? null
        : "No open orders for this item.";

  return (
    <div className="rounded border p-4" style={{ borderColor: BORDER, backgroundColor: "var(--panel)" }}>
      <h2 className="mb-3 text-sm font-medium" style={{ color: TEXT }}>
        Order book
      </h2>
      {message ? (
        <p className="flex h-24 items-center justify-center text-sm" style={{ color: MUTED }}>
          {message}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-[10px] sm:text-xs" style={{ color: MUTED }}>
            <span className="flex-1" style={{ color: BID_COLOR }}>
              Bids
            </span>
            <span className="shrink-0 tabular-nums" style={{ color: active ? TEXT : MUTED }}>
              {active
                ? `${formatPrice(active.price)} · ${formatQuantity(active.quantity)}`
                : `Spread ${spread !== null ? spread.toFixed(3) : "—"}`}
            </span>
            <span className="flex-1 text-right" style={{ color: ASK_COLOR }}>
              Asks
            </span>
          </div>
          {/* Price runs left to right across one strip, so both sides share an
              axis and the depth on each reads as a column against the other. */}
          <div
            ref={scrollerRef}
            className="overflow-x-auto"
            onPointerLeave={event => {
              if (event.pointerType === "mouse") setActive(null);
            }}
          >
            {/* Safe centring holds a shallow book in the middle of the panel
                without pushing half of a deep one out of the scroller's reach. */}
            <div className="relative flex items-start" style={{ justifyContent: "safe center" }}>
              {bids.map((column, index) => (
                <Bar
                  key={column.price}
                  column={column}
                  color={BID_COLOR}
                  maxQuantity={maxQuantity}
                  active={active === column}
                  best={index === bids.length - 1 ? "bid" : null}
                  onActivate={() => setActive(column)}
                />
              ))}
              <div ref={spreadRef} className={`w-px shrink-0 ${CHART_HEIGHT}`} style={{ backgroundColor: BORDER }} />
              {asks.map((column, index) => (
                <Bar
                  key={column.price}
                  column={column}
                  color={ASK_COLOR}
                  maxQuantity={maxQuantity}
                  active={active === column}
                  best={index === 0 ? "ask" : null}
                  onActivate={() => setActive(column)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
