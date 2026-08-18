import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { toPriceHistory, type PricePoint, type Transaction } from "./hooks";
import { pointOfControl, sma, volumeProfile, vwapSeries } from "./indicators";
import { formatCompact, formatDay, formatPrice } from "./stats";
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
const PANE_GAP = 12;
const VOLUME_OPACITY = 0.5;
/** The histogram eats into the plot, so it only appears once there is plot to spare. */
const PROFILE_MIN_WIDTH = 640;
const PROFILE_WIDTH_RATIO = 0.14;
const PROFILE_OPACITY = 0.22;
const PROFILE_POC_OPACITY = 0.45;
const PROFILE_BAND_GAP = 1;
/** Room for the two wrapped rows the legend needs once it stops overlaying the plot. */
const COMPACT_LEGEND_HEIGHT = 40;
const DRAWING_OPACITY = 0.6;
const MEASURE_FILL_OPACITY = 0.14;
const MEASURE_EDGE_OPACITY = 0.45;
/** Rough advance of the 11px label face — enough to keep a tag inside the plot. */
const LABEL_CHAR_WIDTH = 6;

type MeasureDrawing = Extract<Drawing, { kind: "measure" }>;

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

function useContainerWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}

function formatDate(date: string) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return ""; // an unparseable date reads better as a blank tick than as "Invalid Date"
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The API only publishes a daily average, so a "day" opens where the previous
 * day closed and its high/low are just the two ends of that move.
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
}) {
  const prices = useMemo(() => toPriceHistory(transactions), [transactions]);
  const { ref, width } = useContainerWidth();
  const [hovered, setHovered] = useState<number | null>(null);
  const [draft, setDraft] = useState<MeasureDrawing | null>(null);

  const overlayValues = useMemo(() => {
    const closes = prices.map(p => p.price);
    return {
      sma5: sma(closes, 5),
      sma10: sma(closes, 10),
      sma20: sma(closes, 20),
      vwap: vwapSeries(transactions),
    } satisfies Record<Overlay, (number | null)[]>;
  }, [prices, transactions]);
  const profile = useMemo(() => volumeProfile(transactions), [transactions]);
  const poc = useMemo(() => pointOfControl(profile), [profile]);

  // A phone has no room for a legend floating over the plot: it lands on the
  // price axis. There it sits above the chart instead, and drops the values a
  // small screen can do without.
  const compact = width > 0 && width < 480;
  const boxHeight = compact ? 260 : 380;
  const height = compact ? boxHeight - COMPACT_LEGEND_HEIGHT : boxHeight;
  const message = loading
    ? "Loading…"
    : error
      ? "Couldn't load price history."
      : prices.length
        ? null
        : "No price history for this item.";

  const values = prices.map(p => p.price);
  const pad = (Math.max(...values) - Math.min(...values)) * 0.1 || Math.abs(values[0] ?? 0) * 0.1 || 1;
  const low = Math.min(...values) - pad;
  const high = Math.max(...values) + pad;
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
    PADDING.left + (prices.length < 2 ? innerWidth / 2 : (index / (prices.length - 1)) * innerWidth);
  const y = (price: number) => priceBottom - ((price - low) / (high - low)) * priceHeight;
  /** The inverse of `y`, clamped: a gesture that strays out of the pane still reads as a price on it. */
  const priceAt = (offsetY: number) =>
    low + clamp((priceBottom - offsetY) / priceHeight, 0, 1) * (high - low);
  const axisX = width - 6; // price and volume labels are right-aligned against the gutter

  const spacing = prices.length > 1 ? innerWidth / (prices.length - 1) : innerWidth;
  const barWidth = Math.max(2, Math.min(spacing * 0.6, 24));
  /** A bar on the first or last day is half outside the plot; trim it to the edge. */
  const band = (center: number, size: number) => {
    const left = Math.max(center - size / 2, PADDING.left);
    const right = Math.min(center + size / 2, width - PADDING.right);
    return { x: left, width: Math.max(right - left, 0) };
  };
  const maxVolume = Math.max(1, ...transactions.map(t => t.totalQuantity));

  const point = hovered === null ? undefined : prices[hovered];
  // With nothing hovered the legend still reports a day: the most recent one.
  const legendIndex = hovered ?? prices.length - 1;
  const legend = prices[legendIndex];
  const legendBar = transactions[legendIndex];
  const legendOhlc = ohlcAt(prices, legendIndex);
  const legendVolume = legendBar?.totalQuantity ?? 0;
  const legendVwap = legendVolume === 0 ? null : (legendBar?.totalValue ?? 0) / legendVolume;

  const locate = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - bounds.left - PADDING.left) / innerWidth;
    const index = clamp(Math.round(ratio * (prices.length - 1)), 0, prices.length - 1);
    return { index, price: priceAt(event.clientY - bounds.top) };
  };

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    const { index, price } = locate(event);
    setHovered(index);
    if (tool === "line") onDraw({ kind: "line", price });
    if (tool === "measure") {
      // Capture keeps the drag alive when a finger slides off the plot.
      event.currentTarget.setPointerCapture(event.pointerId);
      setDraft({ kind: "measure", fromIndex: index, toIndex: index, fromPrice: price, toPrice: price });
    }
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const { index, price } = locate(event);
    setHovered(index);
    if (draft) setDraft({ ...draft, toIndex: index, toPrice: price });
  };

  const onPointerUp = (event: PointerEvent<SVGSVGElement>) => {
    if (!draft) return;
    const { index, price } = locate(event);
    setDraft(null);
    // A click that never left its bar measures nothing, and a zero-width
    // rectangle on the chart is impossible to select or clear.
    if (index !== draft.fromIndex) onDraw({ ...draft, toIndex: index, toPrice: price });
  };

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key === "Escape") {
      setHovered(null);
      setDraft(null);
      return;
    }
    const step = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (step === 0 || prices.length === 0) return;
    event.preventDefault(); // arrows would otherwise scroll the page out from under the chart
    setHovered(current =>
      current === null ? prices.length - 1 : clamp(current + step, 0, prices.length - 1),
    );
  };

  const dateTag = point ? formatDate(point.date) : "";
  const dateTagWidth = dateTag.length * LABEL_CHAR_WIDTH + 14;
  const dateTagX = point
    ? Math.min(Math.max(x(hovered!) - dateTagWidth / 2, 0), Math.max(width - dateTagWidth, 0))
    : 0;

  const heaviestBucket = poc?.volume ?? 0;
  const profileWidth = innerWidth * PROFILE_WIDTH_RATIO;
  // A phone-width plot is all profile and no chart, so it simply goes away.
  const profileBars =
    width < PROFILE_MIN_WIDTH || heaviestBucket <= 0 ? null : (
      <g>
        {profile.map((bucket, i) => {
          if (bucket.volume <= 0) return null;
          const top = y(bucket.high);
          const bandHeight = Math.max(y(bucket.low) - top - PROFILE_BAND_GAP, 1);
          const length = (bucket.volume / heaviestBucket) * profileWidth;
          const upLength = (bucket.upVolume / heaviestBucket) * profileWidth;
          const opacity = bucket === poc ? PROFILE_POC_OPACITY : PROFILE_OPACITY;
          return (
            <g key={i}>
              <rect
                x={plotRight - length}
                y={top}
                width={Math.max(length - upLength, 0)}
                height={bandHeight}
                fill={DOWN}
                fillOpacity={opacity}
              />
              <rect
                x={plotRight - upLength}
                y={top}
                width={upLength}
                height={bandHeight}
                fill={UP}
                fillOpacity={opacity}
              />
            </g>
          );
        })}
      </g>
    );

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
      const level = y(clamp(drawing.price, low, high));
      return (
        <g key={key}>
          <line
            x1={PADDING.left}
            x2={plotRight}
            y1={level}
            y2={level}
            stroke={LABEL_TEXT}
            strokeOpacity={DRAWING_OPACITY}
          />
          <rect
            x={plotRight + 4}
            y={level - 9}
            width={PADDING.right - 8}
            height="18"
            rx="3"
            fill={PANEL}
            stroke={EDGE}
          />
          <text
            x={axisX}
            y={level}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize="11"
            fill={LABEL_TEXT}
          >
            {formatPrice(drawing.price, decimals)}
          </text>
        </g>
      );
    }

    const { change, changePct, bars, rising } = measurementOf(drawing);
    const left = Math.min(x(drawing.fromIndex), x(drawing.toIndex));
    const right = Math.max(x(drawing.fromIndex), x(drawing.toIndex));
    const top = y(Math.max(drawing.fromPrice, drawing.toPrice));
    const bottom = y(Math.min(drawing.fromPrice, drawing.toPrice));
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
    <div className="w-full">
      <div ref={ref} style={{ height: boxHeight }} className="relative w-full">
        {message ? (
          <p className="flex h-full items-center justify-center text-sm text-muted">{message}</p>
        ) : (
          width > 0 && (
            <>
              {legend && (
                <div
                  className={`flex flex-wrap gap-x-3 gap-y-0.5 px-2 text-[11px] ${
                    compact ? "pt-1" : "pointer-events-none absolute left-2 right-2 top-1"
                  }`}
                >
                  <span className="text-ink tabular-nums">{formatDay(legend.date)}</span>
                  {!compact && (
                    <>
                      <span className="text-muted">
                        O <span className="text-ink tabular-nums">{formatPrice(legendOhlc.open, decimals)}</span>
                      </span>
                      <span className="text-muted">
                        H <span className="text-ink tabular-nums">{formatPrice(legendOhlc.high, decimals)}</span>
                      </span>
                      <span className="text-muted">
                        L <span className="text-ink tabular-nums">{formatPrice(legendOhlc.low, decimals)}</span>
                      </span>
                    </>
                  )}
                  <span className="text-muted">
                    C <span className="text-ink tabular-nums">{formatPrice(legendOhlc.close, decimals)}</span>
                  </span>
                  <span className="text-muted">
                    Vol <span className="text-ink tabular-nums">{formatCompact(legendVolume)}</span>
                  </span>
                  <span className="text-muted">
                    VWAP{" "}
                    <span className="text-ink tabular-nums">
                      {legendVwap === null ? "—" : formatPrice(legendVwap, decimals)}
                    </span>
                  </span>

                  {OVERLAYS.filter(entry => overlays.includes(entry.id)).map(entry => {
                    const style = OVERLAY_STYLE[entry.id];
                    const value = overlayValues[entry.id][legendIndex] ?? null;
                    return (
                      <span key={entry.id} className="flex items-center gap-1 text-muted">
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
              <svg
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
                onPointerCancel={() => setDraft(null)}
                onPointerLeave={() => setHovered(null)}
                onKeyDown={onKeyDown}
              >
                {profileBars}

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

                {Array.from({ length: columns }, (_, column) => {
                  const index = Math.round((column / (columns - 1)) * (prices.length - 1));
                  return (
                    <g key={column}>
                      <line x1={x(index)} x2={x(index)} y1={priceTop} y2={priceBottom} stroke={GRID} />
                      <text
                        x={x(index)}
                        y={volumeBottom + 15}
                        textAnchor={column === 0 ? "start" : column === columns - 1 ? "end" : "middle"}
                        fontSize="11"
                        fill={AXIS_TEXT}
                      >
                        {formatDate(prices[index]!.date)}
                      </text>
                    </g>
                  );
                })}

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

                {overlayLines}

                {point && (
                  <g>
                    <line
                      x1={x(hovered!)}
                      x2={x(hovered!)}
                      y1={priceTop}
                      y2={volumeBottom}
                      stroke={AXIS_TEXT}
                      strokeOpacity="0.5"
                      strokeDasharray="4 4"
                    />
                    <line
                      x1={PADDING.left}
                      x2={width - PADDING.right}
                      y1={y(point.price)}
                      y2={y(point.price)}
                      stroke={AXIS_TEXT}
                      strokeOpacity="0.5"
                      strokeDasharray="4 4"
                    />
                  </g>
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

                {drawings.map((drawing, i) => renderDrawing(drawing, `drawing-${i}`))}
                {draft && renderDrawing(draft, "draft")}

                {point && (
                  <g>
                    <circle
                      cx={x(hovered!)}
                      cy={y(point.price)}
                      r="4"
                      fill={SERIES}
                      stroke={SURFACE}
                      strokeWidth="2"
                    />
                    <rect
                      x={width - PADDING.right + 4}
                      y={y(point.price) - 9}
                      width={PADDING.right - 8}
                      height="18"
                      rx="3"
                      fill={PANEL}
                      stroke={EDGE}
                    />
                    <text
                      x={axisX}
                      y={y(point.price)}
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
      {view === "candle" && !message && (
        <p className="mt-1 text-xs text-muted">
          Candles show the change between each day's average price — the API has no intraday open/high/low.
        </p>
      )}
    </div>
  );
}
