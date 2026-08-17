import { useEffect, useState } from "react";
import { PriceChart } from "./PriceChart";
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

function itemIcon(code: string) {
  return `https://media.warera.io/images/items/${code}.png?v=33`;
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
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
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
      <PriceChart itemCode={selected} />
    </div>
  );
}

export default App;
