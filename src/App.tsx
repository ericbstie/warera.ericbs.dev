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
  const items = json.result.data.items as Record<string, unknown>;
  return Object.keys(items).sort();
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
      <select
        value={selected}
        onChange={event => setSelected(event.target.value)}
        className="self-start bg-neutral-900 text-neutral-100 border border-neutral-700 rounded px-3 py-2 text-sm"
      >
        {items.map(item => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
      <PriceChart itemCode={selected} />
    </div>
  );
}

export default App;
