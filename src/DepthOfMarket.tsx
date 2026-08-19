import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { groupOrdersByPrice, useTransactions, type Order } from "./orders";

const ASK_COLOR = "var(--down)";
const BID_COLOR = "var(--up)";
const HIGHLIGHT = "color-mix(in srgb, var(--ink) 10%, transparent)";
const BORDER = "var(--edge)";
const MUTED = "var(--muted)";
const TEXT = "var(--ink)";

const TICK = 0.001;
// A hovered price sits close enough to the best price's own label to print on
// top of it, so it only shows once far enough from the spread.
const PRICE_OVERLAP_ROWS = 3;
// One row per tick, so a book with a far-out order would otherwise run to
// thousands of rows. The rows nearest the spread are the ones worth showing.
const MAX_ROWS = 250;
// A row reserves the same height whether or not it carries an order, so price
// reads as an even axis down the book.
const ROW_HEIGHT = "h-3 shrink-0 sm:h-3.5";
// Price runs down the left edge; the bars run out to the right of it.
const PRICE_GUTTER = "w-11 shrink-0 sm:w-12";
const LABEL = "absolute whitespace-nowrap text-[9px] tabular-nums sm:text-[10px]";

type Level = { price: number; quantity: number };

function formatPrice(price: number) {
  return price.toFixed(3);
}

function formatQuantity(quantity: number) {
  return quantity.toLocaleString();
}

/** Buckets orders into whole ticks and walks outward from the best price. */
function buildLevels(orders: Order[], side: "bid" | "ask"): Level[] {
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
  const count = Math.min(MAX_ROWS, Math.abs(worstTick - bestTick) + 1);

  const rows: Level[] = [];
  for (let index = 0; index < count; index++) {
    const tick = bestTick + index * step;
    rows.push({ price: tick * TICK, quantity: quantities.get(tick) ?? 0 });
  }
  // Bids were walked down from the best bid, so flip them to read top to bottom.
  return side === "bid" ? rows.reverse() : rows;
}

function Row({
  level,
  color,
  maxQuantity,
  active,
  best,
  nearSpread,
  onActivate,
}: {
  level: Level;
  color: string;
  maxQuantity: number;
  active: boolean;
  best: "bid" | "ask" | null;
  nearSpread: boolean;
  onActivate: () => void;
}) {
  const pct = maxQuantity > 0 ? (level.quantity / maxQuantity) * 100 : 0;
  // The two standing prices meet at the spread, so each hangs off the edge of
  // its row that faces away from it rather than sitting centred, where the two
  // would print over each other.
  const anchor =
    best === "bid" ? "bottom-0" : best === "ask" ? "top-0" : "top-1/2 -translate-y-1/2";
  return (
    <div
      className={`relative flex cursor-pointer items-center gap-1 ${ROW_HEIGHT}`}
      style={{ backgroundColor: active ? HIGHLIGHT : "transparent" }}
      onPointerEnter={onActivate}
    >
      {/* Price stands beside the row it belongs to, clear of every bar. */}
      <div className={`relative h-full ${PRICE_GUTTER}`}>
        {(best || (active && !nearSpread)) && (
          <span className={`${LABEL} right-1 ${anchor}`} style={{ color: active ? TEXT : color }}>
            {formatPrice(level.price)}
          </span>
        )}
      </div>
      <div className="relative h-full min-w-0 flex-1">
        {/* A resting tick that rounds to nothing still deserves to be visible. */}
        <div
          className="h-full rounded-r-sm"
          style={{ width: `${pct}%`, minWidth: level.quantity > 0 ? 2 : 0, backgroundColor: color }}
        />
        {active && (
          <span className={`${LABEL} right-1 top-1/2 -translate-y-1/2`} style={{ color: TEXT }}>
            {formatQuantity(level.quantity)}
          </span>
        )}
      </div>
    </div>
  );
}

export function DepthOfMarket({ itemCode }: { itemCode: string }) {
  const { buyOrders, sellOrders, loading, error } = useTransactions(itemCode);
  // Hovering reads a row on a pointer; tapping does the same on touch.
  const [active, setActive] = useState<Level | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const spreadRef = useRef<HTMLDivElement>(null);

  // Each side steps away from its best price one tick at a time, so row n is
  // always 0.001 further out than row n - 1 whether or not orders rest there.
  const bids = useMemo(() => buildLevels(buyOrders, "bid"), [buyOrders]);
  const asks = useMemo(() => buildLevels(sellOrders, "ask"), [sellOrders]);
  const maxQuantity = useMemo(
    () => Math.max(0, ...bids.map(level => level.quantity), ...asks.map(level => level.quantity)),
    [bids, asks],
  );

  const bestBid = bids.at(-1)?.price ?? null;
  const bestAsk = asks[0]?.price ?? null;
  const spread = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;

  // The spread is the part of a deep book worth opening on rather than the far
  // end of the bids. The panel settles to its final height after the book has
  // drawn on some layouts, so the same centring runs on every height it is given.
  useLayoutEffect(() => {
    setActive(null);
    const scroller = scrollerRef.current;
    const spreadLine = spreadRef.current;
    if (!scroller || !spreadLine) return;

    const centre = () => {
      scroller.scrollTop = spreadLine.offsetTop + spreadLine.offsetHeight / 2 - scroller.clientHeight / 2;
    };
    centre();
    const observer = new ResizeObserver(centre);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [bids, asks]);

  // A pointer that leaves the diagram drops the row it was reading; a touch
  // has to be told, and anywhere off the diagram is where it gets told.
  useEffect(() => {
    if (!active) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!scrollerRef.current?.contains(event.target as Node)) setActive(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [active]);

  const message = loading
    ? "Loading…"
    : error
      ? "Couldn't load order book."
      : bids.length || asks.length
        ? null
        : "No open orders for this item.";

  return (
    <div
      className="flex h-full flex-col rounded border p-2"
      style={{ borderColor: BORDER, backgroundColor: "var(--panel)" }}
    >
      <h2 className="mb-2 text-sm font-medium" style={{ color: TEXT }}>
        Order book
      </h2>
      {message ? (
        <p className="flex h-24 items-center justify-center text-sm" style={{ color: MUTED }}>
          {message}
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex items-center gap-2 text-[10px] sm:text-xs" style={{ color: MUTED }}>
            <span style={{ color: BID_COLOR }}>Bids ↑</span>
            <span className="flex-1 text-center tabular-nums">
              Spread {spread !== null ? spread.toFixed(3) : "—"}
            </span>
            <span style={{ color: ASK_COLOR }}>Asks ↓</span>
          </div>
          {/* Price runs top to bottom down one strip, so both sides share an
              axis and the depth on each reads as a bar against the other. */}
          <div
            ref={scrollerRef}
            className="min-h-0 flex-1 overflow-y-auto"
            onPointerLeave={event => {
              if (event.pointerType === "mouse") setActive(null);
            }}
          >
            {/* Safe centring holds a shallow book in the middle of the panel
                without pushing half of a deep one out of the scroller's reach. */}
            <div
              className="flex min-h-full flex-col"
              style={{ justifyContent: "safe center" }}
            >
              {bids.map((level, index) => (
                <Row
                  key={level.price}
                  level={level}
                  color={BID_COLOR}
                  maxQuantity={maxQuantity}
                  active={active === level}
                  best={index === bids.length - 1 ? "bid" : null}
                  nearSpread={bids.length - 1 - index < PRICE_OVERLAP_ROWS}
                  onActivate={() => setActive(level)}
                />
              ))}
              <div ref={spreadRef} className="h-px w-full shrink-0" style={{ backgroundColor: BORDER }} />
              {asks.map((level, index) => (
                <Row
                  key={level.price}
                  level={level}
                  color={ASK_COLOR}
                  maxQuantity={maxQuantity}
                  active={active === level}
                  best={index === 0 ? "ask" : null}
                  nearSpread={index < PRICE_OVERLAP_ROWS}
                  onActivate={() => setActive(level)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
