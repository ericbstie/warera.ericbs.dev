import { useCallback, useEffect, useMemo, useState } from "react";
import { CommandPalette } from "./CommandPalette";
import { DepthOfMarket } from "./DepthOfMarket";
import { Header } from "./Header";
import { useItems, useTransactionHistory } from "./hooks";
import { type Range } from "./indicators";
import { ItemListError, Panel } from "./Panel";
import { PriceChart } from "./PriceChart";
import { quoteFor } from "./stats";
import { Toolbar, type Overlay } from "./Toolbar";
import { ToolRail } from "./ToolRail";
import { type Drawing, type ToolId } from "./tools";

const DEFAULT_OVERLAYS: Overlay[] = ["sma10", "vwap"];

export function GraphPage() {
  const { items, error, retry } = useItems();
  const [selected, setSelected] = useState("");

  const [range, setRange] = useState<Range>("30D");
  const [view, setView] = useState<"line" | "candle">("candle");
  const [overlays, setOverlays] = useState<Overlay[]>(DEFAULT_OVERLAYS);
  const [tool, setTool] = useState<ToolId>("crosshair");
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [searching, setSearching] = useState(false);

  // A list that arrives, changes or empties must never leave the chart pointed
  // at an item that is no longer in it.
  useEffect(() => {
    setSelected(current =>
      items.some(item => item.code === current) ? current : (items[0]?.code ?? ""),
    );
  }, [items]);

  // The header quote and the chart read the same bars, so they are fetched
  // once here rather than once per panel. The range is part of the request now
  // rather than a slice of it — a short range is drawn from the 15-minute poll
  // and a long one from the daily records, so they aren't the same series.
  const { transactions, loading, error: historyError } = useTransactionHistory(selected, range);
  const quote = useMemo(() => quoteFor(transactions), [transactions]);

  // Anything drawn was measured against the bars on screen, so it stops meaning
  // what it meant once those bars change.
  useEffect(() => setDrawings([]), [selected, range]);

  const toggleOverlay = useCallback(
    (overlay: Overlay) =>
      setOverlays(current =>
        current.includes(overlay) ? current.filter(id => id !== overlay) : [...current, overlay],
      ),
    [],
  );

  const reset = useCallback(() => {
    setDrawings([]);
    setTool("crosshair");
    setOverlays(DEFAULT_OVERLAYS);
    setRange("30D");
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // A shortcut that fires while someone is typing a search steals the letter.
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.isContentEditable)) return;

      const key = event.key.toLowerCase();
      if (key === "i") setOverlays(current => (current.length ? [] : DEFAULT_OVERLAYS));
      else if (key === "r") reset();
      else return;
      event.preventDefault();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reset]);

  return (
    <div className="flex flex-col lg:h-dvh lg:overflow-hidden">
      <Header
        items={items}
        selected={selected}
        onSelect={setSelected}
        quote={quote}
        loading={loading}
      />

      {error && (
        <div className="px-1 pt-1">
          <ItemListError onRetry={retry} />
        </div>
      )}

      {/* The chart takes whatever the book leaves, and the book stands beside
          it on a wide screen and below it on a narrow one. */}
      <main className="flex min-h-0 flex-1 flex-col gap-1 p-1 lg:flex-row">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded border border-edge bg-canvas">
          <Toolbar
            range={range}
            onRange={setRange}
            view={view}
            onView={setView}
            overlays={overlays}
            onToggleOverlay={toggleOverlay}
          />

          <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
            <ToolRail
              tool={tool}
              onTool={setTool}
              onClear={() => setDrawings([])}
              hasDrawings={drawings.length > 0}
            />
            <div className="min-h-0 min-w-0 flex-1">
              <Panel label="price chart">
                <PriceChart
                  itemCode={selected}
                  transactions={transactions}
                  loading={loading}
                  error={historyError}
                  view={view}
                  overlays={overlays}
                  tool={tool}
                  drawings={drawings}
                  onDraw={drawing => setDrawings(current => [...current, drawing])}
                />
              </Panel>
            </div>
          </div>
        </section>

        {/* The order book draws its own card, so it needs no wrapper of its own. */}
        <aside className="h-[55vh] shrink-0 lg:h-auto lg:w-80 xl:w-96">
          <Panel label="order book">
            <DepthOfMarket itemCode={selected} />
          </Panel>
        </aside>
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
