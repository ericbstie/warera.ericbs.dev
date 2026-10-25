import { useCallback, useEffect, useMemo, useState } from "react";
import { CommandPalette } from "./CommandPalette";
import { Header } from "./Header";
import { useItems, useTransactionHistory } from "./hooks";
import { ItemPicker } from "./ItemPicker";
import { PAGE_COLUMN } from "./layout";
import { availableRanges, largestRange, type Interval, type Range } from "./indicators";
import { ItemListError, Panel } from "./Panel";
import { PriceChart } from "./PriceChart";
import { ScrollFade } from "./ScrollFade";
import { Ticker } from "./Ticker";
import { Divider, Toolbar } from "./Toolbar";
import { FullscreenButton, ToolRail } from "./ToolRail";
import { type Drawing, type ToolId } from "./tools";

export function GraphPage() {
  const { items, error, retry } = useItems();
  const [selected, setSelected] = useState("");

  const [range, setRange] = useState<Range>("30D");
  const [interval, setInterval] = useState<Interval>("1d");
  const [tool, setTool] = useState<ToolId>("crosshair");
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [searching, setSearching] = useState(false);
  // A reset returns the chart to its fit, which is the chart's own state to hold.
  const [resetAt, setResetAt] = useState(0);
  // Full screen fills the page under the header rather than taking the whole
  // display, so the page switch and the ticker stay in reach.
  const [full, setFull] = useState(false);

  // A list that arrives, changes or empties must never leave the chart pointed
  // at an item that is no longer in it.
  useEffect(() => {
    setSelected(current =>
      items.some(item => item.code === current) ? current : (items[0]?.code ?? ""),
    );
  }, [items]);

  // The range is part of the request rather than a slice of it — a short range is drawn from the 15-minute poll
  // and a long one from the daily records, so they aren't the same series.
  const { transactions, firstIntradayAt, loading, error: historyError } = useTransactionHistory(selected, range, interval);

  // Candles under a day only reach back to the first poll, so a range further
  // back than that is turned off — and if it was the one picked, the chart
  // moves to the longest one that still fits.
  const ranges = useMemo(() => availableRanges(interval, firstIntradayAt), [interval, firstIntradayAt]);
  useEffect(() => {
    if (!ranges.includes(range)) setRange(largestRange(ranges));
  }, [ranges, range]);

  // Anything drawn was measured against the bars on screen, so it stops meaning
  // what it meant once those bars change.
  useEffect(() => setDrawings([]), [selected, range, interval]);

  const reset = useCallback(() => {
    setResetAt(count => count + 1);
    setDrawings([]);
    setTool("crosshair");
    setRange("30D");
    setInterval("1d");
  }, []);

  const toggleFull = useCallback(() => setFull(current => !current), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // A shortcut that fires while someone is typing a search steals the letter.
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.isContentEditable)) return;

      const key = event.key.toLowerCase();
      if (key === "r") reset();
      else if (key === "f") toggleFull();
      else if (key === "escape" && full && !searching) setFull(false);
      else return;
      event.preventDefault();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reset, toggleFull, full, searching]);

  return (
    <div className={full ? "flex h-dvh flex-col overflow-hidden" : "flex flex-col"}>
      <Header>
        <Ticker items={items.map(item => item.code)} onSelect={setSelected} />
      </Header>

      {error && (
        <div className="px-1 pt-1">
          <ItemListError onRetry={retry} />
        </div>
      )}

      {/* The chart shares the page column every page uses, and on a laptop or
          desktop keeps to 2:1 inside it. */}
      <main
        className={
          full
            ? "flex min-h-0 flex-1 flex-col p-3 sm:p-4"
            : `${PAGE_COLUMN} flex min-h-0 flex-1 flex-col pb-6 pt-10`
        }
      >
        <div className="flex min-h-0 flex-1 flex-col">
          {/* One row over the chart: what is charted, then how it is cut, then
              what to draw on it. The hairline under it is the one over every
              list on the Wages page, so it reads as the chart's own row
              without a box drawn round the pair. */}
          <div className="flex flex-wrap items-center gap-x-3 border-b border-edge/60 py-1">
            {/* Pulled out by its own padding, so the item's icon sits on the
                page column's edge like the titles on the Wages page. */}
            <div className="-ml-2 basis-full sm:basis-auto">
              <ItemPicker items={items} selected={selected} onSelect={setSelected} />
            </div>
            <Divider className="hidden sm:block" />
            {/* Only the controls scroll on a narrow screen; the picker's list
                would be clipped inside a scrolling box. */}
            <ScrollFade className="flex min-w-0 flex-1 items-center gap-x-2 sm:gap-x-3">
              <Toolbar range={range} ranges={ranges} onRange={setRange} interval={interval} onInterval={setInterval} />
              <Divider />
              <ToolRail
                tool={tool}
                onTool={setTool}
                onClear={() => setDrawings([])}
                hasDrawings={drawings.length > 0}
              />
            </ScrollFade>
            <FullscreenButton full={full} onToggle={toggleFull} />
          </div>

          <div className={`min-h-0 min-w-0 flex-1 pt-3 ${full ? "" : "lg:aspect-[2/1] lg:flex-none"}`}>
            <Panel label="price chart">
              <PriceChart
                itemCode={selected}
                transactions={transactions}
                loading={loading}
                error={historyError}
                tool={tool}
                drawings={drawings}
                onDraw={drawing => setDrawings(current => [...current, drawing])}
                resetAt={resetAt}
              />
            </Panel>
          </div>
        </div>

        <CommandPalette
          items={items}
          open={searching}
          onOpenChange={setSearching}
          onSelect={setSelected}
        />
      </main>
    </div>
  );
}
