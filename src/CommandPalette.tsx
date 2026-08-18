import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { type MarketItem } from "./Header";
import { itemIcon, itemLabel } from "./hooks";
import { searchItems } from "./search";

/** Ctrl+K is the terminal convention for symbol search; Cmd+K is its mac spelling. */
function isOpenShortcut(event: KeyboardEvent) {
  return (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k";
}

function isTextField(node: EventTarget | null) {
  const element = node as HTMLElement | null;
  return !!element && (element.tagName === "INPUT" || element.tagName === "TEXTAREA");
}

export function CommandPalette({
  items,
  open,
  onOpenChange,
  onSelect,
}: {
  items: MarketItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (code: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const baseId = useId();
  const listId = `${baseId}list`;
  const optionId = useCallback((index: number) => `${baseId}option-${index}`, [baseId]);

  const results = useMemo(() => searchItems(items, query), [items, query]);
  // A shrinking result list must not leave the highlight past the end.
  const highlighted = results.length ? Math.min(active, results.length - 1) : 0;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!isOpenShortcut(event)) return;
      // Someone already typing in the palette is where the shortcut leads anyway.
      if (panelRef.current?.contains(event.target as Node) && isTextField(event.target)) return;
      event.preventDefault();
      onOpenChange(true);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange]);

  // Every opening starts from a blank query with the caret already in the box.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.getElementById(optionId(highlighted))?.scrollIntoView({ block: "nearest" });
  }, [open, highlighted, optionId]);

  if (!open) return null;

  const move = (step: number) => {
    if (!results.length) return;
    setActive((highlighted + step + results.length) % results.length);
  };

  const choose = (index: number) => {
    const item = results[index];
    if (!item) return;
    onSelect(item.code);
    onOpenChange(false);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") move(1);
    else if (event.key === "ArrowUp") move(-1);
    else if (event.key === "Enter") choose(highlighted);
    else if (event.key === "Escape") onOpenChange(false);
    else return;
    event.preventDefault();
  };

  return (
    <div
      // A black scrim would be invisible on the dark theme, so dim with the
      // page's own surface colour and let the theme decide what that is.
      style={{ background: "color-mix(in srgb, var(--surface) 70%, transparent)" }}
      className="fixed inset-0 z-30 flex items-start justify-center px-4 pt-20"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search items"
        onKeyDown={onKeyDown}
        className="flex w-full max-w-lg flex-col overflow-hidden rounded border border-edge bg-panel"
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={event => {
            setQuery(event.target.value);
            setActive(0);
          }}
          placeholder="Search items…"
          aria-label="Search items"
          role="combobox"
          aria-expanded
          aria-autocomplete="list"
          aria-controls={listId}
          aria-activedescendant={results.length ? optionId(highlighted) : undefined}
          // `text-base` keeps mobile Safari from zooming the page on focus.
          className="w-full border-b border-edge bg-surface px-3 py-3 text-base text-ink outline-none placeholder:text-muted"
        />

        {results.length === 0 ? (
          <p className="px-3 py-3 text-sm text-muted">No items match</p>
        ) : (
          <ul id={listId} role="listbox" aria-label="Items" className="max-h-72 overflow-y-auto">
            {results.map((item, index) => {
              const current = index === highlighted;
              return (
                <li
                  key={item.code}
                  id={optionId(index)}
                  role="option"
                  aria-selected={current}
                  // Keeps the caret in the input, so a click never blurs mid-select.
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => choose(index)}
                  className={`flex min-h-10 cursor-pointer items-center gap-2.5 px-3 py-2 ${
                    current ? "bg-accent text-white" : "text-ink"
                  }`}
                >
                  <img src={itemIcon(item.code)} alt="" width={24} height={24} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {itemLabel(item.code)}
                  </span>
                  <span
                    className={`shrink-0 text-[10px] uppercase tracking-[0.18em] ${
                      current ? "text-white" : "text-muted"
                    }`}
                  >
                    {item.type}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
