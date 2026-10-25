import { type MarketItem } from "./hooks";
import { Ticker } from "./Ticker";

/** The one header every page shares, drawn once above them all: the week's movers. */
export function Header({
  items,
  onSelect,
}: {
  items: MarketItem[];
  onSelect: (code: string) => void;
}) {
  return (
    <header className="sticky top-0 z-20 shrink-0 border-b border-edge bg-surface pb-2 pt-3">
      <div className="px-4 sm:px-6">
        <Ticker items={items.map((item) => item.code)} onSelect={onSelect} />
      </div>
    </header>
  );
}
