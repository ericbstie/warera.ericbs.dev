import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { DepthOfMarket } from "./DepthOfMarket";
import { Header, type MarketItem } from "./Header";
import { useTransactionHistory } from "./hooks";
import { PriceChart } from "./PriceChart";
import { SettlementGrid } from "./SettlementGrid";
import { quoteFor } from "./stats";
import "./index.css";

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
  const quote = useMemo(() => quoteFor(transactions), [transactions]);
  const codes = useMemo(() => items.map(item => item.code), [items]);

  return (
    <div className="min-h-screen">
      <Header
        items={items}
        selected={selected}
        onSelect={setSelected}
        quote={quote}
        loading={loading}
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

        <section className="rounded border border-edge bg-canvas">
          <Panel label="price chart">
            <PriceChart
              itemCode={selected}
              transactions={transactions}
              loading={loading}
              error={historyError}
            />
          </Panel>
        </section>

        <section className="rounded border border-edge bg-panel p-3">
          <Panel label="order book">
            <DepthOfMarket itemCode={selected} />
          </Panel>
        </section>

        <Panel label="settlement bonuses">
          <SettlementGrid items={codes} />
        </Panel>
      </main>
    </div>
  );
}

export default App;
