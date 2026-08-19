import { useItems } from "./hooks";
import { ItemListError, Panel } from "./Panel";
import { SettlementGrid } from "./SettlementGrid";
import { TitleBar } from "./TitleBar";

export function BonusesPage() {
  const { items, error, retry } = useItems();

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-edge bg-panel">
        <div className="mx-auto max-w-7xl px-4 py-2.5">
          <TitleBar />
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-4 p-4">
        <h1 className="text-lg font-semibold">Production Bonuses</h1>

        {error && <ItemListError onRetry={retry} />}

        <Panel label="production bonuses">
          <SettlementGrid items={items.map(item => item.code)} />
        </Panel>
      </main>
    </>
  );
}
