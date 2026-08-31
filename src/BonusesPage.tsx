import { useItems } from "./hooks";
import { ItemListError, Panel } from "./Panel";
import { SettlementGrid } from "./SettlementGrid";
import { TitleBar } from "./TitleBar";

export function BonusesPage() {
  const { items, error, retry } = useItems();

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-edge bg-panel">
        <div className="mx-auto max-w-7xl px-4 pb-4 pt-4">
          <TitleBar compact />
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-4 px-4 pb-4 pt-6">
        <h1 className="text-3xl font-semibold sm:text-4xl">Production Bonuses</h1>

        {error && <ItemListError onRetry={retry} />}

        <Panel label="production bonuses">
          <SettlementGrid items={items.map(item => item.code)} />
        </Panel>
      </main>
    </>
  );
}
