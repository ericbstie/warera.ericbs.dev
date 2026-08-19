import { BonusesPage } from "./BonusesPage";
import { GraphPage } from "./GraphPage";
import { pageFor, usePath } from "./router";
import "./index.css";

export function App() {
  const page = pageFor(usePath());

  return (
    <div className="min-h-screen">
      {page === "bonuses" ? <BonusesPage /> : <GraphPage />}
    </div>
  );
}

export default App;
