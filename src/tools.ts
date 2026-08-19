export type ToolId = "crosshair" | "line" | "measure";

export const TOOLS: { id: ToolId; label: string; hint: string }[] = [
  { id: "crosshair", label: "Crosshair", hint: "Read a day off the chart" },
  { id: "line", label: "Trend line", hint: "Drag between two points to draw a line" },
  { id: "measure", label: "Measure", hint: "Drag across bars for the move between them" },
];

/** A trend line or a measured span, each dragged out between two points. */
export type Drawing =
  | { kind: "line"; fromIndex: number; toIndex: number; fromPrice: number; toPrice: number }
  | { kind: "measure"; fromIndex: number; toIndex: number; fromPrice: number; toPrice: number };

export type Measurement = { change: number; changePct: number; bars: number; rising: boolean };

export function measurementOf(drawing: Extract<Drawing, { kind: "measure" }>): Measurement {
  const change = drawing.toPrice - drawing.fromPrice;
  // A move away from zero is unbounded rather than infinite, so it reads as no percentage at all.
  const changePct = drawing.fromPrice === 0 ? 0 : (change / Math.abs(drawing.fromPrice)) * 100;
  return {
    change,
    changePct,
    bars: Math.abs(drawing.toIndex - drawing.fromIndex),
    rising: change >= 0,
  };
}

export function toolLabel(id: ToolId): string {
  return TOOLS.find(tool => tool.id === id)?.label ?? "Crosshair";
}
