import { PageToggle } from "./PageToggle";
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
      className="grid h-8 w-8 place-items-center justify-self-end rounded border border-edge bg-panel text-ink"
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

/**
 * The one row every page shares: which page you are on and how to switch. The
 * outer columns stay equal so the toggle sits on the page's centre line.
 */
export function TitleBar() {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <span aria-hidden />
      <PageToggle />
      <ThemeToggle />
    </div>
  );
}
