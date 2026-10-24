import type { ReactNode } from "react";
import { TitleBar } from "./TitleBar";

/**
 * The one header every page shares, so the page switch sits in the same place
 * on all of them. A page can hang a row of its own under it.
 */
export function Header({ children }: { children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 shrink-0 border-b border-edge bg-surface">
      <div className="flex flex-col gap-y-3 px-4 pb-3 pt-4 sm:px-6 sm:pt-2">
        <TitleBar />
        {children}
      </div>
    </header>
  );
}
