import { Component, type ReactNode } from "react";

/**
 * One malformed record used to throw during render and unmount the entire app,
 * leaving a blank page. A panel that can't draw itself says so and lets the
 * rest of the page carry on.
 */
export class Panel extends Component<{ label: string; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    console.error(`[${this.props.label}] failed to render:`, error);
  }

  override render() {
    if (this.state.failed) {
      return <p className="py-4 text-sm text-muted">Couldn't display the {this.props.label}.</p>;
    }
    return this.props.children;
  }
}

/** Every page is built out of the item list, so every page can lose it. */
export function ItemListError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded border border-down p-3 text-sm text-down">
      <span>Couldn't load the item list, so there is nothing to show.</span>
      <button
        type="button"
        onClick={onRetry}
        className="rounded border border-down px-2 py-1 text-xs"
      >
        Try again
      </button>
    </div>
  );
}
