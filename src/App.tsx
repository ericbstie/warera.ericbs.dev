import "./index.css";

const PLACEHOLDER_ITEMS = ["Item 1", "Item 2", "Item 3"];

export function App() {
  return (
    <div>
      <select className="absolute top-4 left-4 bg-neutral-900 text-neutral-100 border border-neutral-700 rounded px-3 py-2 text-sm">
        {PLACEHOLDER_ITEMS.map(item => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </div>
  );
}

export default App;
