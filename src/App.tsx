import { useState } from "react";
import { GraphPage } from "./GraphPage";
import { Header } from "./Header";
import { useItems } from "./hooks";
import { WageCalculatorPage } from "./WageCalculatorPage";
import { navigate, pageFor, ROUTES, takeLinkedItem, usePath } from "./router";
import "./index.css";

export function App() {
  const page = pageFor(usePath());
  const { items, error, retry } = useItems();
  // The header is drawn once, above whichever page is showing, so switching
  // pages never takes the ticker down with the page. What it needs from the
  // Graph page lives here with it: the item charted, which an entry picks from
  // either page, and full screen, which fills the screen under it.
  const [item, setItem] = useState(takeLinkedItem);
  const [full, setFull] = useState(false);
  const graphFull = page === "graph" && full;

  const pick = (code: string) => {
    setItem(code);
    navigate(ROUTES.graph);
  };

  return (
    <div className={graphFull ? "flex h-dvh flex-col overflow-hidden" : "min-h-screen"}>
      <Header items={items} onSelect={pick} />
      {page === "graph" ? (
        <GraphPage
          items={items}
          error={error}
          retry={retry}
          item={item}
          onItem={setItem}
          full={graphFull}
          onFull={setFull}
        />
      ) : (
        <WageCalculatorPage />
      )}
    </div>
  );
}

export default App;
