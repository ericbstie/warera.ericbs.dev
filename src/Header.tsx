import { Ticker } from "./Ticker";
import { TitleBar } from "./TitleBar";
import { type MarketItem } from "./hooks";

export function Header({
  items,
  onSelect,
}: {
  items: MarketItem[];
  onSelect: (code: string) => void;
}) {
  return (
    <header className="sticky top-0 z-20 shrink-0 border-b border-edge bg-panel">
      <div className="flex flex-col gap-y-3 px-3 pb-3 pt-4 sm:px-4">
        <TitleBar />

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <Ticker items={items.map(item => item.code)} onSelect={onSelect} />
        </div>
      </div>
    </header>
  );
}
