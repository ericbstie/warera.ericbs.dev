import { Nav } from "./NavDrawer";
import { useTheme } from "./theme";

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      // Centring the title on a phone means nothing else may take up room in
      // the row; from `sm` up it joins the flow and the menu follows it.
      className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center justify-center rounded border border-edge bg-accent p-1.5 text-on-accent sm:static sm:ml-auto sm:h-8 sm:w-8 sm:translate-y-0 sm:p-0"
    >
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden className="fill-current">
        {dark ? (
          <path d="M13.5 9.5A6 6 0 0 1 6.5 2.5a6 6 0 1 0 7 7Z" />
        ) : (
          <>
            <circle cx="8" cy="8" r="3.2" />
            <path d="M8 .8v2m0 10.4v2M.8 8h2m10.4 0h2M2.9 2.9l1.4 1.4m7.4 7.4 1.4 1.4m0-10.2-1.4 1.4m-7.4 7.4-1.4 1.4" stroke="currentColor" strokeWidth="1.3" />
          </>
        )}
      </svg>
    </button>
  );
}

/** The one row every page shares: whose site this is, and how to leave the page. */
export function TitleBar() {
  return (
    <div className="relative flex items-center justify-center gap-2.5 sm:justify-start">
      <p className="text-3xl font-semibold sm:text-4xl">War Era Market</p>
      <ThemeToggle />
      <Nav />
    </div>
  );
}
