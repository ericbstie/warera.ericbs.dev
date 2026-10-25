import { type MarketItem } from "./hooks";
import { PageLink } from "./PageLink";
import type { PageId } from "./router";
import { Ticker } from "./Ticker";

/**
 * The one header every page shares, drawn once above them all: the week's
 * movers, with the way to the other page floating under them. Full screen
 * drops the link, to leave the chart to itself.
 */
export function Header({
  items,
  page,
  full,
  onSelect,
}: {
  items: MarketItem[];
  page: PageId;
  full: boolean;
  onSelect: (code: string) => void;
}) {
  return (
    <header className="sticky top-0 z-20 shrink-0 border-b border-edge bg-band pb-2 pt-3">
      <div className="px-4 sm:px-6">
        <Ticker items={items.map((item) => item.code)} onSelect={onSelect} />
      </div>
      {!full && <PageLink page={page} />}
    </header>
  );
}
