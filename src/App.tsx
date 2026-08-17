import { useEffect, useState } from "react";
import { DepthOfMarket } from "./DepthOfMarket";
import { itemIcon } from "./hooks";
import { PriceChart } from "./PriceChart";
import { SettlementGrid } from "./SettlementGrid";
import "./index.css";

async function fetchItemCodes(): Promise<string[]> {
  const res = await fetch("https://api2.warera.io/trpc/gameConfig.getGameConfig", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const json = await res.json();
  const items = json.result.data.items as Record<string, { isTradable?: boolean }>;
  return Object.keys(items)
    .filter(code => items[code]?.isTradable)
    .sort();
}

export function App() {
  const [items, setItems] = useState<string[]>([]);
  const [selected, setSelected] = useState("");

  useEffect(() => {
    fetchItemCodes()
      .then(codes => {
        setItems(codes);
        setSelected(codes[0] ?? "");
      })
      .catch(() => setItems([]));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-black">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4">
          <div className="max-w-3xl">
            <PriceChart itemCode={selected} />
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
          <DepthOfMarket itemCode={selected} />
        </div>
      </div>
      <div className="mx-auto w-full max-w-6xl p-4 pt-0">
        <SettlementGrid items={items} />
      </div>
    </div>
  );
}

export default App;
