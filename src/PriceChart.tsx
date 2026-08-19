import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { toPriceHistory, type PricePoint, type Transaction } from "./hooks";
import { sma, vwapSeries } from "./indicators";
import {
  barDateAt,
  clampOffset,
  clampShift,
  clampSpan,
  clampStretch,
  futureSpan,
  lastIndex,
} from "./pan";
import { formatCompact, formatPrice, formatTime, isTimestamp, parseBarDate } from "./stats";
import { OVERLAYS, type Overlay } from "./Toolbar";
import { measurementOf, type Drawing, type ToolId } from "./tools";

export type ChartView = "line" | "candle";

const PADDING = { top: 28, right: 58, bottom: 22, left: 10 };
const ROWS = 4;
const GRID = "var(--grid)";
const AXIS_TEXT = "var(--muted)";
const SERIES = "var(--accent)";
const SURFACE = "var(--canvas)";
const LABEL_TEXT = "var(--ink)";
const UP = "var(--up)";
const DOWN = "var(--down)";
const MID = "var(--mid)";
const PANEL = "var(--panel)";
const EDGE = "var(--edge)";
/** The drawable height is split between the two panes, with a gap between them. */
const PRICE_PANE_RATIO = 0.72;
const VOLUME_PANE_RATIO = 0.28;
const PANE_GAP = 28;
const VOLUME_OPACITY = 0.5;
/** Room for the two wrapped rows the legend needs once it stops overlaying the plot. */
const COMPACT_LEGEND_HEIGHT = 40;
const DRAWING_OPACITY = 0.6;
const MEASURE_FILL_OPACITY = 0.14;
const MEASURE_EDGE_OPACITY = 0.45;
/** Rough advance of the 11px label face — enough to keep a tag inside the plot. */
const LABEL_CHAR_WIDTH = 6;
/** Below this, a measured box is a layout still settling rather than a chart. */
const MIN_BOX_HEIGHT = 200;
/** How hard a wheel bites. A trackpad pinch reports far smaller deltas than a mouse notch, so it needs a longer lever. */
const WHEEL_SCALE = 0.002;
const PINCH_SCALE = 0.01;
/** Two fingers this close together on an axis were never meant to work it. */
const MIN_PINCH_SPREAD = 24;

/** The view a fresh chart opens on: the whole record, the whole price range. */
const FIT: Scale = { offset: 0, span: null, stretch: 1, shift: 0 };

/**
 * What of the chart is on screen: the leftmost bar, how many gaps fit beside it
 * — null until a pinch narrows it from the whole record — how far the price
 * scale has been pulled past the range that fits, and how far the window has
 * been dragged off the prices that would centre it, in windows.
 */
type Scale = { offset: number; span: number | null; stretch: number; shift: number };

type DraggedDrawing = Extract<Drawing, { kind: "line" | "measure" }>;

/** The averages share one colour, so dash and opacity are what tell them apart. */
const OVERLAY_STYLE: Record<
  Overlay,
  { stroke: string; width: number; dash?: string; opacity: number }
> = {
  sma5: { stroke: SERIES, width: 1, opacity: 0.9 },
  sma10: { stroke: SERIES, width: 1, dash: "4 3", opacity: 0.75 },
  sma20: { stroke: SERIES, width: 1, dash: "1 3", opacity: 0.6 },
  vwap: { stroke: MID, width: 1.5, dash: "6 3", opacity: 0.9 },
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/**
 * A moving average has no value during its warm-up days, and drawing those as
 * zero would drag the line to the axis — so the path breaks instead.
 */
function seriesPath(
  values: (number | null)[],
  x: (index: number) => number,
  y: (price: number) => number,
) {
  let path = "";
  let pen = false;
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (value === null || value === undefined || !Number.isFinite(value)) {
      pen = false;
      continue;
    }
    path += `${pen ? "L" : "M"}${x(i)},${y(value)} `;
    pen = true;
  }
  return path.trim();
}

/**
 * The chart is drawn to the box it is given rather than to a fixed size, so a
 * layout that hands it the whole screen gets a chart that fills it.
 */
function useContainerSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, ...size };
}

/** An axis has room for the time or the day, not both — whichever the bar is. */
function formatDate(date: string) {
  const parsed = parseBarDate(date);
  if (Number.isNaN(parsed.getTime())) return ""; // an unparseable date reads better as a blank tick than as "Invalid Date"
  if (isTimestamp(date)) return formatTime(date);
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Every bar is an average — a day's trades, or a moment's mid — so a bar opens
 * where the one before it closed and its high/low are the ends of that move.
 */
function ohlcAt(prices: PricePoint[], index: number) {
  const close = prices[index]?.price ?? 0;
  const open = index > 0 ? (prices[index - 1]?.price ?? close) : close;
  return { open, close, high: Math.max(open, close), low: Math.min(open, close) };
}

export function PriceChart({
  itemCode,
  transactions,
  loading,
  error,
  view,
  overlays,
  tool,
  drawings,
  onDraw,
  resetAt,
}: {
  itemCode: string;
  transactions: Transaction[];
  loading: boolean;
  error: Error | null;
  view: ChartView;
  overlays: Overlay[];
  tool: ToolId;
  drawings: Drawing[];
  onDraw: (drawing: Drawing) => void;
  /** Bumped when the page is reset, which returns the view to its fit. */
  resetAt: number;
}) {
  const prices = useMemo(() => toPriceHistory(transactions), [transactions]);
  const { ref, width, height: boxed } = useContainerSize();
  const [hovered, setHovered] = useState<number | null>(null);
  const [draft, setDraft] = useState<DraggedDrawing | null>(null);
  const [scale, setScale] = useState<Scale>(FIT);
  const panFrom = useRef<{ x: number; y: number; offset: number; shift: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  /** Every finger or cursor on the plot, so a second one can be told from the first. */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchFrom = useRef<{
    dx: number;
    dy: number;
    ratio: number;
    offset: number;
    span: number;
    stretch: number;
    shift: number;
  } | null>(null);
  const clipId = useId();
  const priceClipId = useId();

  // Another item, or another range, is another set of bars: the view scrolled
  // and pinched to belonged to the old ones.
  useEffect(() => setScale(FIT), [itemCode, prices.length]);
  useEffect(() => setScale(FIT), [resetAt]);

  // Letting go of the graph keeps the last-held bar highlighted; only a
  // click elsewhere on the page drops it back to the most recent one.
  useEffect(() => {
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setHovered(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [ref]);

  const overlayValues = useMemo(() => {
    const closes = prices.map(p => p.price);
    return {
      sma5: sma(closes, 5),
      sma10: sma(closes, 10),
      sma20: sma(closes, 20),
      vwap: vwapSeries(transactions),
    } satisfies Record<Overlay, (number | null)[]>;
  }, [prices, transactions]);
  // A phone has no room for a legend floating over the plot: it lands on the
  // price axis. There it sits above the chart instead, and drops the values a
  // small screen can do without.
  const compact = width > 0 && width < 480;
  // A stacked layout leaves the box to size itself, and then the chart keeps
  // the height it always had.
  const boxHeight = boxed > MIN_BOX_HEIGHT ? boxed : compact ? 260 : 380;
  const height = compact ? boxHeight - COMPACT_LEGEND_HEIGHT : boxHeight;
  // A range change refetches, and the bars already drawn are worth keeping on
  // screen while it does — only an empty chart has nothing better to show.
  const message = prices.length
    ? null
    : loading
      ? "Loading…"
      : error
        ? "Couldn't load price history."
        : "No price history for this item.";

  const values = prices.map(p => p.price);
  const pad = (Math.max(...values) - Math.min(...values)) * 0.1 || Math.abs(values[0] ?? 0) * 0.1 || 1;
  const fitLow = Math.min(...values) - pad;
  const fitHigh = Math.max(...values) + pad;
  // How many gaps the view spans — the whole record until a pinch narrows it.
  const span = scale.span ?? futureSpan(prices.length);
  const offset = scale.offset;
  const stretch = scale.stretch;
  const shift = scale.shift;
  // Stretching keeps the same pane and shows less of the price range in it. The
  // window it keeps is centred on the bars in view, so pulling the scale open
  // magnifies what is being looked at rather than the middle of the record —
  // and it never leaves the range, so an unstretched chart still fits it whole.
  const onScreen = values.slice(Math.max(Math.floor(offset), 0), Math.ceil(offset + span) + 1);
  const half = (fitHigh - fitLow) / (2 * stretch);
  const middle = onScreen.length
    ? (Math.min(...onScreen) + Math.max(...onScreen)) / 2
    : (fitLow + fitHigh) / 2;
  // Dragging up and down moves the window off that centre, by windows, so the
  // room it opens above or below the prices grows with how far it is zoomed in.
  const centre = clamp(middle, fitLow + half, fitHigh - half) + shift * 2 * half;
  const low = centre - half;
  const high = centre + half;
  const decimals = Math.min(6, Math.max(2, Math.ceil(-Math.log10((high - low) / ROWS)) + 1));
  const columns = width < 480 ? 3 : 5;

  const innerWidth = width - PADDING.left - PADDING.right;
  const paneHeight = height - PADDING.top - PADDING.bottom - PANE_GAP;
  const priceHeight = paneHeight * PRICE_PANE_RATIO;
  const volumeHeight = paneHeight * VOLUME_PANE_RATIO;
  const priceTop = PADDING.top;
  const priceBottom = priceTop + priceHeight;
  const volumeTop = priceBottom + PANE_GAP;
  const volumeBottom = volumeTop + volumeHeight;
  const plotRight = width - PADDING.right;

  const x = (index: number) =>
    PADDING.left + (span < 1 ? innerWidth / 2 : ((index - offset) / span) * innerWidth);
  const y = (price: number) => priceBottom - ((price - low) / (high - low)) * priceHeight;
  /** The inverse of `y`, clamped: a gesture that strays out of the pane still reads as a price on it. */
  const priceAt = (offsetY: number) =>
    low + clamp((priceBottom - offsetY) / priceHeight, 0, 1) * (high - low);
  const axisX = width - 6; // price and volume labels are right-aligned against the gutter

  const spacing = span > 0 ? innerWidth / span : innerWidth;
  const barWidth = Math.max(2, Math.min(spacing * 0.6, 24));
  /** A bar on the first or last day is half outside the plot; trim it to the edge. */
  const band = (center: number, size: number) => {
    const left = Math.max(center - size / 2, PADDING.left);
    const right = Math.min(center + size / 2, width - PADDING.right);
    return { x: left, width: Math.max(right - left, 0) };
  };
  const maxVolume = Math.max(1, ...transactions.map(t => t.totalQuantity));

  // With nothing hovered, the highlight sticks to the most recent day.
  const legendIndex = hovered ?? prices.length - 1;
  // Past the end of the record there is no bar to read, so the crosshair moves
  // on into the empty room while the figures stay on the last one there was.
  const dataIndex = Math.min(legendIndex, prices.length - 1);
  const point = prices[dataIndex];
  const legend = point;
  const legendBar = transactions[dataIndex];
  const legendOhlc = ohlcAt(prices, dataIndex);
  const legendVolume = legendBar?.totalQuantity ?? 0;
  const legendVwap = legendVolume === 0 ? null : (legendBar?.totalValue ?? 0) / legendVolume;
  const dates = prices.map(p => p.date);

  const locate = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - bounds.left - PADDING.left) / innerWidth;
    const index = clamp(Math.round(offset + ratio * span), 0, lastIndex(prices.length));
    return { index, price: priceAt(event.clientY - bounds.top) };
  };

  /** Where along the plot a client x falls: 0 at the left edge of it, 1 at the right. */
  const ratioOf = (clientX: number, left: number) =>
    clamp((clientX - left - PADDING.left) / innerWidth, 0, 1);

  const panTo = (next: number) =>
    setScale(current => ({ ...current, offset: clampOffset(next, prices.length, span) }));

  /** The other axis of the drag: how far the price window sits off the bars. */
  const liftTo = (next: number) => setScale(current => ({ ...current, shift: clampShift(next) }));

  /**
   * Zoom about a point of the plot: the bar under the fingers, or under the
   * cursor, is the one that stays where it is while the rest close in on it.
   */
  const zoomAt = (ratio: number, factor: number) =>
    setScale(current => {
      const from = current.span ?? futureSpan(prices.length);
      const next = clampSpan(from * factor, prices.length);
      const held = current.offset + ratio * from;
      return {
        ...current,
        span: next,
        offset: clampOffset(held - ratio * next, prices.length, next),
      };
    });

  const stretchBy = (factor: number) =>
    setScale(current => ({ ...current, stretch: clampStretch(current.stretch * factor) }));

  /** Two fingers work the axes apart: spreading sideways zooms, spreading up stretches. */
  const pinchTo = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const from = pinchFrom.current;
    if (!from) return;
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    const nextSpan =
      from.dx < MIN_PINCH_SPREAD
        ? from.span
        : clampSpan(from.span * (from.dx / Math.max(dx, 1)), prices.length);
    const nextStretch =
      from.dy < MIN_PINCH_SPREAD ? from.stretch : clampStretch((from.stretch * dy) / from.dy);
    const held = from.offset + from.ratio * from.span;
    setScale({
      span: nextSpan,
      stretch: nextStretch,
      shift: clampShift(from.shift),
      offset: clampOffset(held - from.ratio * nextSpan, prices.length, nextSpan),
    });
  };

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    // A second finger down turns the drag into a pinch, and whatever the first
    // one had started — a pan, a measurement — is abandoned to it.
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      panFrom.current = null;
      setDraft(null);
      pinchFrom.current = {
        dx: Math.abs(a.x - b.x),
        dy: Math.abs(a.y - b.y),
        ratio: ratioOf((a.x + b.x) / 2, event.currentTarget.getBoundingClientRect().left),
        offset,
        span,
        stretch,
        shift,
      };
      return;
    }
    if (pointers.current.size > 2) return;
    const { index, price } = locate(event);
    setHovered(index);
    // Capture keeps the drag alive when a finger slides off the plot.
    event.currentTarget.setPointerCapture(event.pointerId);
    // The crosshair is also the hand: dragging it carries the chart along in
    // whichever direction it is pulled, which is the only way into the empty
    // room around the bars on a touchscreen.
    if (tool === "crosshair")
      panFrom.current = { x: event.clientX, y: event.clientY, offset, shift };
    if (tool === "line" || tool === "measure") {
      setDraft({ kind: tool, fromIndex: index, toIndex: index, fromPrice: price, toPrice: price });
    }
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (pointers.current.has(event.pointerId)) {
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (pinchFrom.current) {
      if (pointers.current.size >= 2) {
        const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
        pinchTo(a, b);
      }
      return;
    }
    // Read the bar before the pan lands: measured against the offset it was
    // grabbed at, the bar under the finger stays under the finger.
    const { index, price } = locate(event);
    setHovered(index);
    if (panFrom.current) {
      panTo(panFrom.current.offset + (panFrom.current.x - event.clientX) / spacing);
      // The bars follow the finger, so pulling down lifts the window to the
      // prices above them.
      liftTo(panFrom.current.shift + (event.clientY - panFrom.current.y) / priceHeight);
    }
    if (draft) setDraft({ ...draft, toIndex: index, toPrice: price });
  };

  const onPointerUp = (event: PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(event.pointerId);
    panFrom.current = null;
    // The finger left on the plot after a pinch shouldn't drag the chart along
    // with it: it takes a fresh press to pan again.
    if (pinchFrom.current) {
      if (pointers.current.size < 2) pinchFrom.current = null;
      return;
    }
    if (!draft) return;
    const { index, price } = locate(event);
    setDraft(null);
    // A click that never left its bar measures nothing, and a zero-width
    // rectangle on the chart is impossible to select or clear.
    if (index !== draft.fromIndex) onDraw({ ...draft, toIndex: index, toPrice: price });
  };

  /**
   * The wheel is the mouse's pinch: it zooms the time axis, with shift held it
   * stretches the price axis, and a trackpad pinch — which reaches the page as
   * a wheel with ctrl held — zooms as well. Sideways scrolling still pans.
   *
   * React listens for the wheel passively, so this is bound by hand: the
   * browser's own page zoom and scroll have to be held off for any of it.
   */
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const onWheel = (event: globalThis.WheelEvent) => {
      const pinching = event.ctrlKey;
      if (event.shiftKey && !pinching) {
        // Shift turns the wheel sideways on some platforms and leaves it
        // upright on others, so the stretch takes whichever axis it arrives on.
        const delta = event.deltaY || event.deltaX;
        if (!delta) return;
        event.preventDefault();
        stretchBy(Math.exp(-delta * WHEEL_SCALE));
        return;
      }
      if (!pinching && event.deltaX) {
        event.preventDefault();
        panTo(offset + event.deltaX / spacing);
        return;
      }
      if (!event.deltaY) return;
      event.preventDefault();
      zoomAt(
        ratioOf(event.clientX, svg.getBoundingClientRect().left),
        Math.exp(event.deltaY * (pinching ? PINCH_SCALE : WHEEL_SCALE)),
      );
    };

    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  });

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key === "Escape") {
      setHovered(null);
      setDraft(null);
      return;
    }
    // Up and down pan the price the way left and right pan the dates, a tenth
    // of the window at a time.
    const lift = event.key === "ArrowUp" ? 0.1 : event.key === "ArrowDown" ? -0.1 : 0;
    if (lift !== 0) {
      event.preventDefault();
      liftTo(shift + lift);
      return;
    }
    const step = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (step === 0 || prices.length === 0) return;
    event.preventDefault(); // arrows would otherwise scroll the page out from under the chart
    const next = clamp((hovered ?? prices.length - 1) + step, 0, lastIndex(prices.length));
    setHovered(next);
    // Walking off either edge scrolls the chart rather than losing the crosshair.
    panTo(Math.min(Math.max(offset, next - span), next));
  };

  /** A stretch can take the read price off the pane; its tag stays on the axis. */
  const tagY = point ? clamp(y(point.price), priceTop, priceBottom) : 0;
  const dateTag = point ? formatDate(barDateAt(dates, legendIndex)) : "";
  const dateTagWidth = dateTag.length * LABEL_CHAR_WIDTH + 14;
  const dateTagX = point
    ? Math.min(Math.max(x(legendIndex) - dateTagWidth / 2, 0), Math.max(width - dateTagWidth, 0))
    : 0;

  const overlayLines = OVERLAYS.filter(entry => overlays.includes(entry.id)).map(entry => {
    const style = OVERLAY_STYLE[entry.id];
    return (
      <path
        key={entry.id}
        d={seriesPath(overlayValues[entry.id], x, y)}
        fill="none"
        stroke={style.stroke}
        strokeOpacity={style.opacity}
        strokeWidth={style.width}
        strokeDasharray={style.dash}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  });

  const renderDrawing = (drawing: Drawing, key: string) => {
    if (drawing.kind === "line") {
      // Scrolling or stretching can carry an end of the line off the pane; it
      // stops at the edge rather than vanishing.
      const x1 = clamp(x(drawing.fromIndex), PADDING.left, plotRight);
      const y1 = clamp(y(clamp(drawing.fromPrice, low, high)), priceTop, priceBottom);
      const x2 = clamp(x(drawing.toIndex), PADDING.left, plotRight);
      const y2 = clamp(y(clamp(drawing.toPrice, low, high)), priceTop, priceBottom);
      return (
        <g key={key}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={LABEL_TEXT} strokeOpacity={DRAWING_OPACITY} />
          <circle cx={x1} cy={y1} r={3} fill={LABEL_TEXT} fillOpacity={DRAWING_OPACITY} />
          <circle cx={x2} cy={y2} r={3} fill={LABEL_TEXT} fillOpacity={DRAWING_OPACITY} />
        </g>
      );
    }

    const { change, changePct, bars, rising } = measurementOf(drawing);
    // Scrolling can carry half a measurement off the plot; the rest stays put.
    const left = clamp(Math.min(x(drawing.fromIndex), x(drawing.toIndex)), PADDING.left, plotRight);
    const right = clamp(Math.max(x(drawing.fromIndex), x(drawing.toIndex)), PADDING.left, plotRight);
    // Stretching can carry an end of it off the pane; the box stops at the edge.
    const top = clamp(y(Math.max(drawing.fromPrice, drawing.toPrice)), priceTop, priceBottom);
    const bottom = clamp(y(Math.min(drawing.fromPrice, drawing.toPrice)), priceTop, priceBottom);
    const sign = rising ? "+" : "";
    const label = `${sign}${formatPrice(change, decimals)} (${sign}${changePct.toFixed(2)}%) ${bars}`;
    const half = (label.length * LABEL_CHAR_WIDTH) / 2;
    // A label wider than the plot has nowhere to sit but the middle of it.
    const labelX =
      plotRight - half < PADDING.left + half
        ? (PADDING.left + plotRight) / 2
        : clamp((left + right) / 2, PADDING.left + half, plotRight - half);
    const labelY = Math.max(top - 9, priceTop + 9);

    return (
      <g key={key}>
        <rect
          x={left}
          y={top}
          width={Math.max(right - left, 1)}
          height={Math.max(bottom - top, 1)}
          fill={SERIES}
          fillOpacity={MEASURE_FILL_OPACITY}
          stroke={SERIES}
          strokeOpacity={MEASURE_EDGE_OPACITY}
        />
        {/* Candles run right under the label, so it carries its own backing. */}
        <rect
          x={labelX - half - 4}
          y={labelY - 9}
          width={half * 2 + 8}
          height="15"
          rx="2"
          fill={PANEL}
          stroke={EDGE}
        />
        <text
          x={labelX}
          y={labelY}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="11"
          fill={rising ? UP : DOWN}
        >
          {label}
        </text>
      </g>
    );
  };

  return (
    <div ref={ref} className="h-full w-full">
      <div style={{ height: boxHeight }} className="relative w-full select-none">
        {message ? (
          <p className="flex h-full items-center justify-center text-sm text-muted">{message}</p>
        ) : (
          width > 0 && (
            <>
              {legend && (
                <div
                  className={`flex flex-nowrap items-center gap-x-3 overflow-x-auto whitespace-nowrap px-2 text-[11px] ${
                    compact ? "pt-1" : "absolute left-2 right-2 top-1"
                  }`}
                >
                  {!compact && (
                    <>
                      <span className="shrink-0 text-muted">
                        O <span className="text-ink tabular-nums">{formatPrice(legendOhlc.open, decimals)}</span>
                      </span>
                      <span className="shrink-0 text-muted">
                        H <span className="text-ink tabular-nums">{formatPrice(legendOhlc.high, decimals)}</span>
                      </span>
                      <span className="shrink-0 text-muted">
                        L <span className="text-ink tabular-nums">{formatPrice(legendOhlc.low, decimals)}</span>
                      </span>
                    </>
                  )}
                  <span className="shrink-0 text-muted">
                    C <span className="text-ink tabular-nums">{formatPrice(legendOhlc.close, decimals)}</span>
                  </span>
                  <span className="shrink-0 text-muted">
                    Vol <span className="text-ink tabular-nums">{formatCompact(legendVolume)}</span>
                  </span>
                  <span className="shrink-0 text-muted">
                    VWAP{" "}
                    <span className="text-ink tabular-nums">
                      {legendVwap === null ? "—" : formatPrice(legendVwap, decimals)}
                    </span>
                  </span>

                  {OVERLAYS.filter(entry => overlays.includes(entry.id)).map(entry => {
                    const style = OVERLAY_STYLE[entry.id];
                    const value = overlayValues[entry.id][dataIndex] ?? null;
                    return (
                      <span key={entry.id} className="flex shrink-0 items-center gap-1 text-muted">
                        <span
                          aria-hidden
                          className="inline-block h-0.5 w-3 rounded-full"
                          style={{ background: style.stroke, opacity: style.opacity }}
                        />
                        {entry.label}{" "}
                        <span className="text-ink tabular-nums">
                          {value === null ? "—" : formatPrice(value, decimals)}
                        </span>
                      </span>
                    );
                  })}
                </div>
              )}
              {(offset >= 0.5 ||
                span < futureSpan(prices.length) ||
                stretch > 1 ||
                Math.abs(shift) > 0.01) && (
                <button
                  type="button"
                  onClick={() => setScale(FIT)}
                  // Inside the plot rather than over the price axis, and below
                  // the legend on a phone, where the legend has the top of the box.
                  style={{ top: compact ? COMPACT_LEGEND_HEIGHT + 2 : 2, right: PADDING.right + 4 }}
                  className="absolute z-10 rounded border border-edge bg-panel px-1.5 py-0.5 text-[11px] text-muted"
                >
                  Now ›
                </button>
              )}
              <svg
                ref={svgRef}
                width={width}
                height={height}
                role="img"
                aria-label={`${itemCode} price history`}
                tabIndex={0}
                className="focus-visible:outline-2 focus-visible:outline-accent focus-visible:[outline-offset:-2px]"
                style={{ touchAction: "none" }}
                onPointerMove={onPointerMove}
                onPointerDown={onPointerDown}
                onPointerUp={onPointerUp}
                onPointerCancel={event => {
                  pointers.current.delete(event.pointerId);
                  if (pointers.current.size < 2) pinchFrom.current = null;
                  panFrom.current = null;
                  setDraft(null);
                }}
                onKeyDown={onKeyDown}
              >
                <defs>
                  {/* Scrolled-away bars must stop at the plot, not run under the axis labels. */}
                  <clipPath id={clipId}>
                    <rect x={PADDING.left} y="0" width={Math.max(innerWidth, 0)} height={height} />
                  </clipPath>
                  {/* A stretched price runs off its pane rather than over the volume below it. */}
                  <clipPath id={priceClipId}>
                    <rect
                      x={PADDING.left}
                      y={priceTop}
                      width={Math.max(innerWidth, 0)}
                      height={Math.max(priceHeight, 0)}
                    />
                  </clipPath>
                </defs>

                {Array.from({ length: ROWS + 1 }, (_, row) => {
                  const price = low + ((high - low) * row) / ROWS;
                  return (
                    <g key={row}>
                      <line
                        x1={PADDING.left}
                        x2={width - PADDING.right}
                        y1={y(price)}
                        y2={y(price)}
                        stroke={GRID}
                      />
                      <text
                        x={axisX}
                        y={y(price)}
                        textAnchor="end"
                        dominantBaseline="middle"
                        fontSize="11"
                        fill={AXIS_TEXT}
                      >
                        {price.toFixed(decimals)}
                      </text>
                    </g>
                  );
                })}

                <line
                  x1={PADDING.left}
                  x2={width - PADDING.right}
                  y1={volumeTop}
                  y2={volumeTop}
                  stroke={EDGE}
                  strokeWidth="1"
                />
                <line
                  x1={PADDING.left}
                  x2={width - PADDING.right}
                  y1={volumeTop + volumeHeight / 2}
                  y2={volumeTop + volumeHeight / 2}
                  stroke={GRID}
                />
                <text x={axisX} y={volumeTop + 8} textAnchor="end" fontSize="10" fill={AXIS_TEXT}>
                  {formatCompact(maxVolume)}
                </text>
                <text x={axisX} y={volumeBottom} textAnchor="end" fontSize="10" fill={AXIS_TEXT}>
                  {formatCompact(0)}
                </text>

                {/* Columns stand still while the bars scroll under them, so the
                    edge labels stay inside the plot at any offset. */}
                {Array.from({ length: columns }, (_, column) => {
                  const ratio = column / (columns - 1);
                  const columnX = PADDING.left + ratio * innerWidth;
                  const index = Math.round(offset + ratio * span);
                  return (
                    <g key={column}>
                      <line x1={columnX} x2={columnX} y1={priceTop} y2={priceBottom} stroke={GRID} />
                      <text
                        x={columnX}
                        y={volumeBottom + 15}
                        textAnchor={column === 0 ? "start" : column === columns - 1 ? "end" : "middle"}
                        fontSize="11"
                        fill={AXIS_TEXT}
                      >
                        {formatDate(barDateAt(dates, index))}
                      </text>
                    </g>
                  );
                })}

                <g clipPath={`url(#${clipId})`}>
                  {prices.map((p, i) => {
                    const volume = transactions[i]?.totalQuantity ?? 0;
                    const barHeight = (volume / maxVolume) * volumeHeight;
                    const previous = prices[i - 1]?.price ?? p.price; // the first day has nothing to fall from
                    return (
                      <rect
                        key={p.date}
                        {...band(x(i), barWidth)}
                        y={volumeBottom - barHeight}
                        height={barHeight}
                        fill={p.price >= previous ? UP : DOWN}
                        fillOpacity={VOLUME_OPACITY}
                      />
                    );
                  })}

                  {point && (
                    <line
                      x1={x(legendIndex)}
                      x2={x(legendIndex)}
                      y1={priceTop}
                      y2={volumeBottom}
                      stroke={AXIS_TEXT}
                      strokeOpacity="0.5"
                      strokeDasharray="4 4"
                    />
                  )}
                </g>

                <g clipPath={`url(#${priceClipId})`}>
                  {overlayLines}

                  {point && (
                    <line
                      x1={PADDING.left}
                      x2={width - PADDING.right}
                      y1={y(point.price)}
                      y2={y(point.price)}
                      stroke={AXIS_TEXT}
                      strokeOpacity="0.5"
                      strokeDasharray="4 4"
                    />
                  )}

                  {view === "line" ? (
                    <path
                      d={prices.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.price)}`).join(" ")}
                      fill="none"
                      stroke={SERIES}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : (
                    prices.map((p, i) => {
                      const candleWidth = Math.max(2, barWidth * 0.8);
                      if (i === 0) {
                        return (
                          <rect
                            key={p.date}
                            {...band(x(i), candleWidth)}
                            y={y(p.price) - 1}
                            height="2"
                            fill={AXIS_TEXT}
                          />
                        );
                      }
                      const prev = prices[i - 1]!.price;
                      const color = p.price > prev ? UP : p.price < prev ? DOWN : AXIS_TEXT;
                      const top = y(Math.max(prev, p.price));
                      const bottom = y(Math.min(prev, p.price));
                      return (
                        <g key={p.date}>
                          <line
                            x1={x(i)}
                            x2={x(i)}
                            y1={top}
                            y2={bottom}
                            stroke={color}
                            strokeWidth="1"
                          />
                          <rect
                            {...band(x(i), candleWidth)}
                            y={top}
                            height={Math.max(bottom - top, 2)}
                            fill={color}
                          />
                        </g>
                      );
                    })
                  )}
                </g>

                {drawings.map((drawing, i) => renderDrawing(drawing, `drawing-${i}`))}
                {draft && renderDrawing(draft, "draft")}

                {point && (
                  <g>
                    <g clipPath={`url(#${priceClipId})`}>
                      <circle
                        cx={x(dataIndex)}
                        cy={y(point.price)}
                        r="4"
                        fill={SERIES}
                        stroke={SURFACE}
                        strokeWidth="2"
                      />
                    </g>
                    <rect
                      x={width - PADDING.right + 4}
                      y={tagY - 9}
                      width={PADDING.right - 8}
                      height="18"
                      rx="3"
                      fill={PANEL}
                      stroke={EDGE}
                    />
                    <text
                      x={axisX}
                      y={tagY}
                      textAnchor="end"
                      dominantBaseline="middle"
                      fontSize="11"
                      fill={LABEL_TEXT}
                    >
                      {point.price.toFixed(decimals)}
                    </text>
                    <rect
                      x={dateTagX}
                      y={volumeBottom + 3}
                      width={dateTagWidth}
                      height="17"
                      rx="3"
                      fill={PANEL}
                      stroke={EDGE}
                    />
                    <text
                      x={dateTagX + dateTagWidth / 2}
                      y={volumeBottom + 12}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize="11"
                      fill={LABEL_TEXT}
                    >
                      {dateTag}
                    </text>
                  </g>
                )}
              </svg>

            </>
          )
        )}
      </div>
    </div>
  );
}
