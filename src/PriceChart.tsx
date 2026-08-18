import { useEffect, useMemo, useRef, useState } from "react";
import { toPriceHistory, useTransactionHistory } from "./hooks";

const PADDING = { top: 30, right: 16, bottom: 28, left: 56 };
const ROWS = 4;
const GRID = "#2e2825";
const AXIS_TEXT = "#a8a29e";
const SERIES = "#3987e5";
const SURFACE = "#000000";
const LABEL_TEXT = "#ede9e6";
const UP = "#4ade80";
const DOWN = "#f87171";
const VOLUME_BAND_RATIO = 0.22;

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

export function PriceChart({ itemCode }: { itemCode: string }) {
  const { transactions, loading, error } = useTransactionHistory(itemCode);
  const prices = useMemo(() => toPriceHistory(transactions), [transactions]);
  const { ref, width } = useContainerWidth();
  const [hovered, setHovered] = useState<number | null>(null);
  const [view, setView] = useState<"line" | "candle">("line");

  const height = width < 480 ? 220 : 320;
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
  const innerHeight = height - PADDING.top - PADDING.bottom;
  const x = (index: number) =>
    PADDING.left + (prices.length < 2 ? innerWidth / 2 : (index / (prices.length - 1)) * innerWidth);
  const y = (price: number) => PADDING.top + innerHeight - ((price - low) / (high - low)) * innerHeight;

  const spacing = prices.length > 1 ? innerWidth / (prices.length - 1) : innerWidth;
  const barWidth = Math.max(2, Math.min(spacing * 0.6, 24));
  const maxVolume = Math.max(1, ...transactions.map(t => t.totalQuantity));
  const volumeBandHeight = innerHeight * VOLUME_BAND_RATIO;
  const baselineY = height - PADDING.bottom;

  const point = hovered === null ? undefined : prices[hovered];
  const label = point ? point.price.toFixed(decimals) : "";
  const labelWidth = label.length * 7 + 16;
  const labelX = point
    ? Math.min(Math.max(x(hovered!) - labelWidth / 2, PADDING.left), width - PADDING.right - labelWidth)
    : 0;

  return (
    <div className="w-full">
      <div className="mb-2 flex justify-end">
        <select
          value={view}
          onChange={event => setView(event.target.value as "line" | "candle")}
          className="rounded border border-[#3a322e] bg-[#211c19] px-2 py-1 text-xs text-[#ede9e6]"
          aria-label="Chart view"
        >
          <option value="line">Line</option>
          <option value="candle">Candles</option>
        </select>
      </div>
      <div ref={ref} style={{ height }} className="w-full">
        {message ? (
          <p className="flex h-full items-center justify-center text-sm text-[#a8a29e]">{message}</p>
        ) : (
        width > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={`${itemCode} price history`}
            onPointerMove={event => {
              const bounds = event.currentTarget.getBoundingClientRect();
              const ratio = (event.clientX - bounds.left - PADDING.left) / innerWidth;
              const index = Math.round(ratio * (prices.length - 1));
              setHovered(Math.min(Math.max(index, 0), prices.length - 1));
            }}
            onPointerLeave={() => setHovered(null)}
          >
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
                    x={PADDING.left - 8}
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

            {Array.from({ length: columns }, (_, column) => {
              const index = Math.round((column / (columns - 1)) * (prices.length - 1));
              return (
                <g key={column}>
                  <line
                    x1={x(index)}
                    x2={x(index)}
                    y1={PADDING.top}
                    y2={height - PADDING.bottom}
                    stroke={GRID}
                  />
                  <text
                    x={x(index)}
                    y={height - PADDING.bottom + 16}
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
              const barHeight = (volume / maxVolume) * volumeBandHeight;
              return (
                <rect
                  key={p.date}
                  x={x(i) - barWidth / 2}
                  y={baselineY - barHeight}
                  width={barWidth}
                  height={barHeight}
                  fill={SERIES}
                  fillOpacity="0.4"
                />
              );
            })}

            {point && (
              <line
                x1={x(hovered!)}
                x2={x(hovered!)}
                y1={PADDING.top}
                y2={height - PADDING.bottom}
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
                      x={x(i) - candleWidth / 2}
                      y={y(p.price) - 1}
                      width={candleWidth}
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
                  <rect
                    key={p.date}
                    x={x(i) - candleWidth / 2}
                    y={top}
                    width={candleWidth}
                    height={Math.max(bottom - top, 2)}
                    fill={color}
                  />
                );
              })
            )}

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
                  x={labelX}
                  y="4"
                  width={labelWidth}
                  height="20"
                  rx="4"
                  fill={SURFACE}
                  stroke={GRID}
                />
                <text
                  x={labelX + labelWidth / 2}
                  y="15"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="12"
                  fill={LABEL_TEXT}
                >
                  {label}
                </text>
              </g>
            )}
          </svg>
        )
        )}
      </div>
      {view === "candle" && !message && (
        <p className="mt-1 text-xs text-[#a8a29e]">
          Candles show the change between each day's average price — the API has no intraday open/high/low.
        </p>
      )}
    </div>
  );
}
