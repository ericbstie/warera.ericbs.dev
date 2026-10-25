import { useEffect, useRef, useState, type ReactNode } from "react";

const FADE = "linear-gradient(to right, black calc(100% - 2.5rem), transparent)";

/**
 * A row of controls wider than its room scrolls sideways, and fades out at the
 * edge while there is more of it to the right, so nothing looks cut off.
 */
export function ScrollFade({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () =>
      setMore(element.scrollLeft + element.clientWidth < element.scrollWidth - 1);

    // A mouse wheel only scrolls up and down, and without a scrollbar on show
    // it's the only way a mouse can reach what is past the fade.
    const onWheel = (event: WheelEvent) => {
      if (element.scrollWidth <= element.clientWidth) return;
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      element.scrollLeft += event.deltaY;
      event.preventDefault();
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    element.addEventListener("scroll", measure, { passive: true });
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", measure);
      element.removeEventListener("wheel", onWheel);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={`overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
      style={more ? { maskImage: FADE, WebkitMaskImage: FADE } : undefined}
    >
      {children}
    </div>
  );
}
