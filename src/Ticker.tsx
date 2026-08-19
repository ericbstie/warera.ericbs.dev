import { useEffect, useRef, type MouseEvent, type PointerEvent } from "react";
import { itemIcon, itemLabel, useWeeklyMovers, type Mover } from "./hooks";

/** How long the strip takes to drift through the run once. */
const LOOP_SECONDS = 90;
/** Pointer movement past this many pixels reads as a drag, not a tap. */
const DRAG_THRESHOLD = 6;
/** How long the strip waits after the user lets go before it drifts again. */
const RESUME_DELAY = 1200;

function Entry({
  mover,
  onSelect,
  tabIndex,
}: {
  mover: Mover;
  onSelect: (code: string) => void;
  tabIndex?: number;
}) {
  const rising = mover.changePct >= 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(mover.code)}
      tabIndex={tabIndex}
      title={itemLabel(mover.code)}
      className="flex shrink-0 items-center gap-1.5"
    >
      <img
        src={itemIcon(mover.code)}
        alt={itemLabel(mover.code)}
        width={18}
        height={18}
        draggable={false} // a native image drag would otherwise hijack the pointer events driving the swipe
      />
      <span className={`text-xs font-medium tabular-nums ${rising ? "text-up" : "text-down"}`}>
        {rising ? "+" : ""}
        {mover.changePct.toFixed(2)}%
      </span>
    </button>
  );
}

/**
 * The run is rendered twice so the auto-scroll loop can wrap scrollLeft at the
 * halfway point: once past the first copy, the second copy shows the same
 * content in the same place, so the wrap is invisible.
 */
export function Ticker({ items, onSelect }: { items: string[]; onSelect: (code: string) => void }) {
  const movers = useWeeklyMovers(items);
  const trackRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const drag = useRef<{ startX: number; startScrollLeft: number } | null>(null);
  const dragged = useRef(false);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || !movers.length) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let last = performance.now();
    let raf: number;
    // scrollLeft rounds what it is given, and a frame of drift is well under a
    // pixel, so the position is kept here and only handed over once it counts.
    let offset = track.scrollLeft;

    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      if (pausedRef.current) {
        offset = track.scrollLeft;
      } else {
        const half = track.scrollWidth / 2;
        offset += (half / LOOP_SECONDS) * (dt / 1000);
        // Both copies show the same run, so stepping back one copy is invisible.
        if (offset >= half) offset -= half;
        track.scrollLeft = offset;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [movers.length]);

  if (!movers.length) return null;

  const pause = () => {
    clearTimeout(resumeTimer.current);
    pausedRef.current = true;
  };

  const scheduleResume = () => {
    clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => {
      pausedRef.current = false;
    }, RESUME_DELAY);
  };

  // Just moving the pointer off (no drag) should resume the drift right away;
  // the delay is only there to keep a just-finished drag from lurching forward.
  const resumeNow = () => {
    clearTimeout(resumeTimer.current);
    pausedRef.current = false;
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    pause();
    // Touch already scrolls itself, momentum included; only mouse/pen need a manual drag.
    if (event.pointerType === "touch") return;
    const track = trackRef.current;
    if (!track) return;
    dragged.current = false;
    drag.current = { startX: event.clientX, startScrollLeft: track.scrollLeft };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    if (!drag.current || !track) return;
    const delta = event.clientX - drag.current.startX;
    if (!dragged.current && Math.abs(delta) > DRAG_THRESHOLD) {
      dragged.current = true;
      // Taking the pointer only now keeps a plain click on the entry it landed on;
      // capturing any earlier would retarget it to this container instead.
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    track.scrollLeft = drag.current.startScrollLeft - delta;
  };

  // Letting go has to end the drag, or every later hover would go on scrolling the strip.
  const onPointerUp = () => {
    drag.current = null;
    scheduleResume();
  };

  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    // A drag that ends over an entry would otherwise also fire as a click on it.
    if (dragged.current) {
      event.preventDefault();
      event.stopPropagation();
      dragged.current = false;
    }
  };

  return (
    <div
      ref={trackRef}
      className="min-w-0 basis-full select-none overflow-x-auto sm:flex-1 sm:basis-40 [scrollbar-width:none] [touch-action:pan-x] [&::-webkit-scrollbar]:hidden"
      aria-label="7 day change"
      onPointerEnter={pause}
      onPointerLeave={() => (drag.current ? scheduleResume() : resumeNow())}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClickCapture={onClickCapture}
    >
      <div className="flex w-max gap-6">
        {[0, 1].map(copy => (
          <div key={copy} className="flex shrink-0 gap-6 pr-6" aria-hidden={copy === 1}>
            {movers.map(mover => (
              <Entry key={mover.code} mover={mover} onSelect={onSelect} tabIndex={copy === 1 ? -1 : undefined} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
