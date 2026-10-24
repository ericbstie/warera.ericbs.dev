import { useCallback, useEffect, useState } from "react";
import { CommandPalette } from "./CommandPalette";
import { Header } from "./Header";
import { useItems, useTransactionHistory } from "./hooks";
import { ItemPicker } from "./ItemPicker";
import { type Interval, type Range } from "./indicators";
import { ItemListError, Panel } from "./Panel";
import { PriceChart } from "./PriceChart";
import { Divider, Toolbar } from "./Toolbar";
import { ToolRail } from "./ToolRail";
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

  // A list that arrives, changes or empties must never leave the chart pointed
  // at an item that is no longer in it.
  useEffect(() => {
    setSelected(current =>
      items.some(item => item.code === current) ? current : (items[0]?.code ?? ""),
    );
  }, [items]);

  // The range is part of the request rather than a slice of it — a short range is drawn from the 15-minute poll
  // and a long one from the daily records, so they aren't the same series.
  const { transactions, loading, error: historyError } = useTransactionHistory(selected, range, interval);

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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // A shortcut that fires while someone is typing a search steals the letter.
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.isContentEditable)) return;

      const key = event.key.toLowerCase();
      if (key === "r") reset();
      else return;
      event.preventDefault();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reset]);

  return (
    <div className="flex flex-col">
      <Header items={items} onSelect={setSelected} />

      {error && (
        <div className="px-1 pt-1">
          <ItemListError onRetry={retry} />
        </div>
      )}

      {/* On a laptop or desktop the chart sits in the middle at a 16:9 it can be
          read at, at most 1280px and never closer than a fifth of the screen
          to either edge. */}
      <main className="flex min-h-0 flex-1 flex-col px-3 pb-1 sm:px-4 lg:mx-auto lg:w-[min(1280px,60vw)] lg:px-0 lg:pt-4">
        {/* One row over the chart, no card around any of it: what is charted,
            then how it is cut, then what to draw on it. */}
        <div className="flex flex-wrap items-center gap-x-3 py-1">
          <div className="basis-full sm:basis-auto">
            <ItemPicker items={items} selected={selected} onSelect={setSelected} />
          </div>
          <Divider className="hidden sm:block" />
          {/* Only the controls scroll on a narrow screen; the picker's list
              would be clipped inside a scrolling box. */}
          <div className="flex min-w-0 flex-1 items-center gap-x-2 overflow-x-auto sm:gap-x-3">
            <Toolbar range={range} onRange={setRange} interval={interval} onInterval={setInterval} />
            <Divider />
            <ToolRail
              tool={tool}
              onTool={setTool}
              onClear={() => setDrawings([])}
              hasDrawings={drawings.length > 0}
            />
          </div>
        </div>

        <div className="min-h-0 min-w-0 flex-1 lg:aspect-video lg:flex-none">
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
      </main>

      <CommandPalette
        items={items}
        open={searching}
        onOpenChange={setSearching}
        onSelect={setSelected}
      />
    </div>
  );
}
