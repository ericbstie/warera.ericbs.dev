import { PageToggle } from "./PageToggle";

/**
 * The one row every page shares: which page you are on and how to switch,
 * centred on the page.
 */
export function TitleBar() {
  return (
    <div className="flex justify-center">
      <PageToggle />
    </div>
  );
}
