import { type MarketItem } from "./hooks";
import { Ticker } from "./Ticker";
import { TitleBar } from "./TitleBar";

/**
 * The one header every page shares: the week's movers along the very top,
 * then the page switch, in the same place on every page.
 */
export function Header({ items, onSelect }: { items: MarketItem[]; onSelect: (code: string) => void }) {
  return (
    <header className="sticky top-0 z-20 shrink-0 border-b border-edge bg-surface">
      <div className="flex flex-col gap-y-1 px-4 pb-2 pt-3 sm:px-6">
        <Ticker items={items.map(item => item.code)} onSelect={onSelect} />
        <TitleBar />
      </div>
    </header>
  );
}
