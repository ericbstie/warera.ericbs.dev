import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { groupOrdersByPrice, useTransactions, type Order } from "./orders";

const ASK_COLOR = "var(--down)";
const BID_COLOR = "var(--up)";
const HIGHLIGHT = "color-mix(in srgb, var(--ink) 10%, transparent)";
const BORDER = "var(--edge)";
const GRIDLINE = "color-mix(in srgb, var(--ink) 6%, transparent)";
const MUTED = "var(--muted)";
const TEXT = "var(--ink)";

const TICK = 0.001;
// A hovered price sits close enough to the best price's own label to print on
// top of it, so it only shows once far enough from the spread.
const PRICE_OVERLAP_ROWS = 3;
// One cell per tick, so a book with a far-out order would otherwise run to
// thousands of cells. The ones nearest the spread are the ones worth showing.
const MAX_ROWS = 250;
// A cell reserves the same size whether or not it carries an order, so price
// reads as an even axis along the book.
const ROW_HEIGHT = "h-3 shrink-0 sm:h-3.5";
const COLUMN_WIDTH = "w-4 shrink-0 sm:w-5";
// Price runs along one edge; the bars run away from it.
const PRICE_GUTTER = "w-11 shrink-0 sm:w-12";
const PRICE_AXIS = "h-3.5 shrink-0";
const LABEL = "absolute whitespace-nowrap text-[9px] tabular-nums sm:text-[10px]";
// The panel stands beside the chart from `lg` up and under it below, so price
// runs down a tall narrow book there and across a short wide one here.
const WIDE_SCREEN = "(min-width: 1024px)";

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
  // Bids were walked down from the best bid, so flip them to run worst-first
  // and end at the spread, which is where the asks then carry on from.
  return side === "bid" ? rows.reverse() : rows;
}

/** True while the book is under the chart rather than beside it. */
function useHorizontal() {
  const [horizontal, setHorizontal] = useState(() => !window.matchMedia(WIDE_SCREEN).matches);

  useEffect(() => {
    const query = window.matchMedia(WIDE_SCREEN);
    const sync = () => setHorizontal(!query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return horizontal;
}

function Cell({
  level,
  color,
  maxQuantity,
  active,
  best,
  nearSpread,
  horizontal,
  onActivate,
}: {
  level: Level;
  color: string;
  maxQuantity: number;
  active: boolean;
  best: "bid" | "ask" | null;
  nearSpread: boolean;
  horizontal: boolean;
  onActivate: () => void;
}) {
  const pct = maxQuantity > 0 ? (level.quantity / maxQuantity) * 100 : 0;
  const depth = `${pct}%`;
  // A resting tick that rounds to nothing still deserves to be visible.
  const thinnest = level.quantity > 0 ? 2 : 0;
  const showPrice = best || (active && !nearSpread);

  if (horizontal) {
    // The two standing prices meet at the spread, so each hangs off the side of
    // its column that faces away from it rather than sitting centred, where the
    // two would print over each other.
    const anchor =
      best === "bid" ? "right-0.5" : best === "ask" ? "left-0.5" : "left-1/2 -translate-x-1/2";
    return (
      <div
        className={`relative flex cursor-pointer flex-col ${COLUMN_WIDTH}`}
        style={{ backgroundColor: active ? HIGHLIGHT : "transparent", borderRight: `1px solid ${GRIDLINE}` }}
        onPointerEnter={onActivate}
      >
        {/* Depth grows up out of the price axis that runs along the foot. */}
        <div className="relative min-h-0 w-full flex-1">
          <div
            className="absolute inset-x-0 bottom-0"
            style={{ height: depth, minHeight: thinnest, backgroundColor: color }}
          />
          {active && (
            <span className={`${LABEL} left-1/2 top-0 -translate-x-1/2`} style={{ color: TEXT }}>
              {formatQuantity(level.quantity)}
            </span>
          )}
        </div>
        {/* Price stands under the column it belongs to, clear of every bar. */}
        <div className={`relative w-full ${PRICE_AXIS}`} style={{ borderTop: `1px solid ${GRIDLINE}` }}>
          {showPrice && (
            <span className={`${LABEL} bottom-0 ${anchor}`} style={{ color: active ? TEXT : color }}>
              {formatPrice(level.price)}
            </span>
          )}
        </div>
      </div>
    );
  }

  const anchor =
    best === "bid" ? "bottom-0" : best === "ask" ? "top-0" : "top-1/2 -translate-y-1/2";
  return (
    <div
      className={`relative flex cursor-pointer items-center gap-1 ${ROW_HEIGHT}`}
      style={{ backgroundColor: active ? HIGHLIGHT : "transparent", borderBottom: `1px solid ${GRIDLINE}` }}
      onPointerEnter={onActivate}
    >
      {/* Price stands beside the row it belongs to, clear of every bar. */}
      <div className={`relative h-full ${PRICE_GUTTER}`} style={{ borderRight: `1px solid ${GRIDLINE}` }}>
        {showPrice && (
          <span className={`${LABEL} right-1 ${anchor}`} style={{ color: active ? TEXT : color }}>
            {formatPrice(level.price)}
          </span>
        )}
      </div>
      <div className="relative h-full min-w-0 flex-1">
        <div className="h-full" style={{ width: depth, minWidth: thinnest, backgroundColor: color }} />
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
  // Hovering reads a level on a pointer; tapping does the same on touch.
  const [active, setActive] = useState<Level | null>(null);
  const horizontal = useHorizontal();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const spreadRef = useRef<HTMLDivElement>(null);

  // Each side steps away from its best price one tick at a time, so cell n is
  // always 0.001 further out than cell n - 1 whether or not orders rest there.
  const bids = useMemo(() => buildLevels(buyOrders, "bid"), [buyOrders]);
  const asks = useMemo(() => buildLevels(sellOrders, "ask"), [sellOrders]);
  const maxQuantity = useMemo(
    () => Math.max(0, ...bids.map(level => level.quantity), ...asks.map(level => level.quantity)),
    [bids, asks],
  );

  // The spread is the part of a deep book worth opening on rather than the far
  // end of the bids. The panel settles to its final size after the book has
  // drawn on some layouts, so the same centring runs on every size it is given.
  useLayoutEffect(() => {
    setActive(null);
    const scroller = scrollerRef.current;
    const spreadLine = spreadRef.current;
    if (!scroller || !spreadLine) return;

    const centre = () => {
      const spread = spreadLine.getBoundingClientRect();
      const view = scroller.getBoundingClientRect();
      if (horizontal) scroller.scrollLeft += spread.left + spread.width / 2 - (view.left + view.width / 2);
      else scroller.scrollTop += spread.top + spread.height / 2 - (view.top + view.height / 2);
    };
    centre();
    const observer = new ResizeObserver(centre);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [bids, asks, horizontal]);

  // A pointer that leaves the diagram drops the level it was reading; a touch
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
            <span style={{ color: BID_COLOR }}>Bids</span>
            <span className="flex-1" />
            <span style={{ color: ASK_COLOR }}>Asks</span>
          </div>
          {/* Price runs along one strip — down the panel beside the chart, and
              across it below — so both sides share an axis and the depth on
              each reads as a bar against the other. */}
          <div
            ref={scrollerRef}
            className={horizontal ? "min-h-0 min-w-0 flex-1 overflow-x-auto" : "min-h-0 flex-1 overflow-y-auto"}
            onPointerLeave={event => {
              if (event.pointerType === "mouse") setActive(null);
            }}
          >
            {/* Safe centring holds a shallow book in the middle of the panel
                without pushing half of a deep one out of the scroller's reach. */}
            <div
              className={`flex ${horizontal ? "h-full min-w-full flex-row" : "min-h-full flex-col"}`}
              style={{ justifyContent: "safe center" }}
            >
              {bids.map((level, index) => (
                <Cell
                  key={level.price}
                  level={level}
                  color={BID_COLOR}
                  maxQuantity={maxQuantity}
                  active={active === level}
                  best={index === bids.length - 1 ? "bid" : null}
                  nearSpread={bids.length - 1 - index < PRICE_OVERLAP_ROWS}
                  horizontal={horizontal}
                  onActivate={() => setActive(level)}
                />
              ))}
              <div
                ref={spreadRef}
                className={horizontal ? "h-full w-px shrink-0" : "h-px w-full shrink-0"}
                style={{ backgroundColor: BORDER }}
              />
              {asks.map((level, index) => (
                <Cell
                  key={level.price}
                  level={level}
                  color={ASK_COLOR}
                  maxQuantity={maxQuantity}
                  active={active === level}
                  best={index === 0 ? "ask" : null}
                  nearSpread={index < PRICE_OVERLAP_ROWS}
                  horizontal={horizontal}
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
