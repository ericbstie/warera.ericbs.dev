# warera.ericbs.dev

A market terminal for [WarEra](https://warera.io). Pick a traded item and the page
shows its price history as a candle or line chart with a volume pane, moving-average
and VWAP overlays, the depth of its order book, and the countries where a company
producing it earns the most.

Keyboard: `Ctrl`/`Cmd`+`K` searches items, `I` toggles the indicator overlays, `R`
resets the chart, and the arrow keys walk the crosshair once the chart has focus.

To install dependencies:

```bash
bun install
```

To start a development server:

```bash
bun dev
```

To run for production:

```bash
bun start
```

This project was created using `bun init` in bun v1.3.11. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
