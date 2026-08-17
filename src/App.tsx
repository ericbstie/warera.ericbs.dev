import { useEffect, useState } from "react";
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

  useEffect(() => {
    fetchItemCodes()
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  return (
    <div>
      <select className="absolute top-4 left-4 bg-neutral-900 text-neutral-100 border border-neutral-700 rounded px-3 py-2 text-sm">
        {items.map(item => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </div>
  );
}

export default App;
