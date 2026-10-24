import { PageToggle } from "./PageToggle";

/**
 * The one row every page shares: which page you are on and how to switch. The
 * outer columns stay equal so the toggle sits on the page's centre line.
 */
export function TitleBar() {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <span aria-hidden />
      <PageToggle />
      <span aria-hidden />
    </div>
  );
}
