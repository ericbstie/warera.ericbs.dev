import { Component, useEffect, useState, type ReactNode } from "react";
import { DepthOfMarket } from "./DepthOfMarket";
import { itemIcon } from "./hooks";
import { PriceChart } from "./PriceChart";
import { SettlementGrid } from "./SettlementGrid";
import "./index.css";

async function fetchItemCodes(): Promise<string[]> {
  const res = await fetch("/api/trpc/gameConfig.getGameConfig", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  const items = json?.result?.data?.items as Record<string, { isTradable?: boolean }> | undefined;
  if (!items) throw new Error("Item list came back in an unexpected shape");
  return Object.keys(items)
    .filter(code => items[code]?.isTradable)
    .sort();
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
      return <p className="py-4 text-sm text-[#a8a29e]">Couldn't display the {this.props.label}.</p>;
    }
    return this.props.children;
  }
}

export function App() {
  const [items, setItems] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    fetchItemCodes()
      .then(codes => {
        if (cancelled) return;
        setItems(codes);
        setSelected(current => (codes.includes(current) ? current : (codes[0] ?? "")));
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

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-black">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4">
          {error && (
            <div className="flex flex-wrap items-center gap-3 rounded border border-[#f87171] p-3 text-sm text-[#f87171]">
              <span>Couldn't load the item list, so there is nothing to show.</span>
              <button
                type="button"
                onClick={() => setAttempt(current => current + 1)}
                className="rounded border border-[#f87171] px-2 py-1 text-xs"
              >
                Try again
              </button>
            </div>
          )}
          <div className="max-w-3xl">
            <Panel label="price chart">
              <PriceChart itemCode={selected} />
            </Panel>
          </div>
          <div className="flex items-center gap-3">
            {selected && (
              <img src={itemIcon(selected)} alt="" width={32} height={32} className="shrink-0" />
            )}
            <select
              value={selected}
              onChange={event => setSelected(event.target.value)}
              className="bg-[#211c19] text-[#ede9e6] border border-[#3a322e] rounded px-3 py-2 text-sm"
            >
              {items.map(item => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <Panel label="order book">
            <DepthOfMarket itemCode={selected} />
          </Panel>
        </div>
      </div>
      <div className="mx-auto w-full max-w-6xl p-4 pt-0">
        <Panel label="settlement bonuses">
          <SettlementGrid items={items} />
        </Panel>
      </div>
    </div>
  );
}

export default App;
