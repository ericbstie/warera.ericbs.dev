import { Component, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CommandPalette } from "./CommandPalette";
import { DepthOfMarket } from "./DepthOfMarket";
import { Header, type MarketItem } from "./Header";
import { useTransactionHistory } from "./hooks";
import { sliceRange, type Range } from "./indicators";
import { NavDrawer } from "./NavDrawer";
import { PriceChart } from "./PriceChart";
import { SettlementGrid } from "./SettlementGrid";
import { quoteFor } from "./stats";
import { Toolbar, type Overlay } from "./Toolbar";
import { ToolRail } from "./ToolRail";
import { type Drawing, type ToolId } from "./tools";
import "./index.css";

const DEFAULT_OVERLAYS: Overlay[] = ["sma10", "vwap"];

async function fetchItems(): Promise<MarketItem[]> {
  const res = await fetch("/api/trpc/gameConfig.getGameConfig", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  const items = json?.result?.data?.items as
    | Record<string, { isTradable?: boolean; type?: string }>
    | undefined;
  if (!items) throw new Error("Item list came back in an unexpected shape");
  return Object.keys(items)
    .filter(code => items[code]?.isTradable)
    .sort()
    .map(code => ({ code, type: items[code]?.type ?? "" }));
}

/**
 * One malformed record used to throw during render and unmount the entire app,
 * leaving a blank page. A panel that can't draw itself says so and lets the
 * rest of the page carry on.
 */
class Panel extends Component<{ label: string; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    console.error(`[${this.props.label}] failed to render:`, error);
  }

  override render() {
    if (this.state.failed) {
      return <p className="py-4 text-sm text-muted">Couldn't display the {this.props.label}.</p>;
    }
    return this.props.children;
  }
}

export function App() {
  const [items, setItems] = useState<MarketItem[]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);

  const [range, setRange] = useState<Range>("30D");
  const [view, setView] = useState<"line" | "candle">("candle");
  const [overlays, setOverlays] = useState<Overlay[]>(DEFAULT_OVERLAYS);
  const [tool, setTool] = useState<ToolId>("crosshair");
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [searching, setSearching] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    fetchItems()
      .then(listed => {
        if (cancelled) return;
        setItems(listed);
        setSelected(current =>
          listed.some(item => item.code === current) ? current : (listed[0]?.code ?? ""),
        );
      })
      .catch(err => {
        if (cancelled) return;
        // Without this the page rendered as a healthy but empty shell: an empty
        // picker, and three panels each reporting "no data for this item".
        setItems([]);
        setError(err as Error);
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // The header quote and the chart read the same day records, so they are
  // fetched once here rather than once per panel.
  const { transactions, loading, error: historyError } = useTransactionHistory(selected);
  const visible = useMemo(() => sliceRange(transactions, range), [transactions, range]);
  const quote = useMemo(() => quoteFor(visible), [visible]);
  const codes = useMemo(() => items.map(item => item.code), [items]);

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
    <div className="min-h-screen">
      <Header
        items={items}
        selected={selected}
        onSelect={setSelected}
        quote={quote}
        loading={loading}
        menuOpen={menuOpen}
        onOpenMenu={() => setMenuOpen(true)}
      />
      <Toolbar
        range={range}
        onRange={setRange}
        view={view}
        onView={setView}
        overlays={overlays}
        onToggleOverlay={toggleOverlay}
      />

      <main className="mx-auto flex max-w-7xl flex-col gap-4 p-4">
        {error && (
          <div className="flex flex-wrap items-center gap-3 rounded border border-down p-3 text-sm text-down">
            <span>Couldn't load the item list, so there is nothing to show.</span>
            <button
              type="button"
              onClick={() => setAttempt(current => current + 1)}
              className="rounded border border-down px-2 py-1 text-xs"
            >
              Try again
            </button>
          </div>
        )}

        <section className="overflow-hidden rounded border border-edge bg-canvas">
          <div className="flex flex-col sm:flex-row">
            <ToolRail
              tool={tool}
              onTool={setTool}
              onClear={() => setDrawings([])}
              hasDrawings={drawings.length > 0}
            />
            <div className="min-w-0 flex-1">
              <Panel label="price chart">
                <PriceChart
                  itemCode={selected}
                  transactions={visible}
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
        <Panel label="order book">
          <DepthOfMarket itemCode={selected} />
        </Panel>

        <hr className="my-2 border-t-2 border-edge" />

        <Panel label="settlement bonuses">
          <SettlementGrid items={codes} />
        </Panel>
      </main>

      <CommandPalette
        items={items}
        open={searching}
        onOpenChange={setSearching}
        onSelect={setSelected}
      />

      <NavDrawer open={menuOpen} onOpenChange={setMenuOpen} />
    </div>
  );
}

export default App;
