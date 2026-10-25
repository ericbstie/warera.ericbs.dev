import { useEffect, useRef, useState } from "react";
import { itemIcon, itemLabel, type MarketItem } from "./hooks";

/** The upstream config groups items by a bare `type`; the picker shows them under headings. */
const GROUPS: { type: string; label: string }[] = [
  { type: "raw", label: "Resources" },
  { type: "product", label: "Products" },
  { type: "weapon", label: "Weapons" },
  { type: "equipment", label: "Equipment" },
  { type: "case", label: "Cases" },
];

export function ItemPicker({
  items,
  selected,
  onSelect,
}: {
  items: MarketItem[];
  selected: string;
  onSelect: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const listed = GROUPS.map(group => ({
    ...group,
    codes: items.filter(item => item.type === group.type).map(item => item.code),
  })).filter(group => group.codes.length);
  const ungrouped = items.filter(item => !GROUPS.some(group => group.type === item.type));

  // A click anywhere outside the picker closes it, same as a native <select>.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const choose = (code: string) => {
    onSelect(code);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      {/* No box around it: the icon, the weight of the name and the caret are
          what say it opens, and the caret brightens to answer the pointer,
          as every other control's text does. */}
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Traded item"
        className="group flex h-10 max-w-[16rem] items-center gap-2 px-2 text-left"
      >
        {selected && <img src={itemIcon(selected)} alt="" width={24} height={24} className="shrink-0" />}
        <span className="truncate text-base font-semibold sm:text-lg">{itemLabel(selected) || "Select an item"}</span>
        <svg viewBox="0 0 12 8" width="10" height="7" aria-hidden className="shrink-0 text-muted group-hover:text-ink">
          <path d="M1 1.5 6 6.5 11 1.5" stroke="currentColor" strokeWidth="1.6" fill="none" />
        </svg>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Traded item"
          className="absolute left-0 top-full z-30 mt-1 max-h-80 w-full min-w-[16rem] overflow-y-auto rounded border border-edge bg-panel py-1 shadow-lg"
        >
          {listed.map(group => (
            <li key={group.type}>
              <p className="px-2.5 pb-1 pt-2 text-sm font-semibold tracking-wide text-muted">
                {group.label}
              </p>
              <ul>
                {group.codes.map(code => (
                  <ItemOption key={code} code={code} selected={code === selected} onSelect={choose} />
                ))}
              </ul>
            </li>
          ))}
          {ungrouped.length > 0 && (
            <ul>
              {ungrouped.map(item => (
                <ItemOption
                  key={item.code}
                  code={item.code}
                  selected={item.code === selected}
                  onSelect={choose}
                />
              ))}
            </ul>
          )}
        </ul>
      )}
    </div>
  );
}

function ItemOption({
  code,
  selected,
  onSelect,
}: {
  code: string;
  selected: boolean;
  onSelect: (code: string) => void;
}) {
  return (
    <li
      role="option"
      aria-selected={selected}
      onClick={() => onSelect(code)}
      className={`flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-base ${
        selected ? "bg-edge/40 font-semibold text-ink" : "text-ink hover:bg-edge/40"
      }`}
    >
      <img src={itemIcon(code)} alt="" width={20} height={20} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{itemLabel(code)}</span>
    </li>
  );
}
