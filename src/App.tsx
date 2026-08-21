import { BonusesPage } from "./BonusesPage";
import { GraphPage } from "./GraphPage";
import { WageCalculatorPage } from "./WageCalculatorPage";
import { pageFor, usePath } from "./router";
import "./index.css";

export function App() {
  const page = pageFor(usePath());

  return (
    <div className="min-h-screen">
      {page === "bonuses" ? <BonusesPage /> : page === "wages" ? <WageCalculatorPage /> : <GraphPage />}
    </div>
  );
}

export default App;
