import { useEffect, useRef, useState } from "react";
import { usePriceHistory } from "./hooks";

const PADDING = { top: 12, right: 16, bottom: 28, left: 56 };
const ROWS = 4;
const GRID = "#262626";
const AXIS_TEXT = "#a3a3a3";
const SERIES = "#3987e5";

function useContainerWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function PriceChart({ itemCode }: { itemCode: string }) {
  const { prices, loading, error } = usePriceHistory(itemCode);
  const { ref, width } = useContainerWidth();

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

  return (
    <div ref={ref} style={{ height }} className="w-full">
      {message ? (
        <p className="flex h-full items-center justify-center text-sm text-neutral-400">{message}</p>
      ) : (
        width > 0 && (
          <svg width={width} height={height} role="img" aria-label={`${itemCode} price history`}>
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

            <path
              d={prices.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.price)}`).join(" ")}
              fill="none"
              stroke={SERIES}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )
      )}
    </div>
  );
}
