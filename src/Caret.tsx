/** The one down caret: anything that opens a list carries it after its label. */
export function Caret({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 8"
      width="10"
      height="7"
      aria-hidden
      className={`shrink-0 text-muted ${className}`}
    >
      <path d="M1 1.5 6 6.5 11 1.5" stroke="currentColor" strokeWidth="1.8" fill="none" />
    </svg>
  );
}
