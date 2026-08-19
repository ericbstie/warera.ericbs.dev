# warera.ericbs.dev

A market terminal for [WarEra](https://warera.io). Pick a traded item and the page
shows its price history as a candle or line chart with a volume pane, moving-average
and VWAP overlays, the depth of its order book, and the countries where a company
producing it earns the most.

The chart is drawn from the server's own record rather than upstream's, so it
reaches back further than the 30 days upstream publishes and, over a few days,
down to the quarter-hour. Resolution follows the range: `1D` and `3D` are drawn
from the 15-minute poll, anything longer from daily records.

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

## Recorded market history

Upstream's trading endpoint only answers with the last 30 days, one row per day,
so the server keeps its own record. Every 15 minutes it walks each tradable item,
stores the best bid, best ask and depth on both sides of the live order book, and
re-reads the daily totals — days already on file stay there once upstream drops
them. It all lands in a SQLite file, `data/warera.sqlite` by default, so the
history survives a restart and keeps growing.

Read it back at `/api/history?itemCode=<code>&days=<n>` (90 days by default),
which answers with `bars` — daily ones, or 15-minute ones with `&intraday=1`.
Both carry the same shape, an intraday bar just timestamped rather than dated.
`/api/movers` answers with every item's week in one request, which is what the
ticker reads.

A 15-minute bar prices at the mid of the book and takes its volume from the
difference between two polls of the day's running totals, which is why those
totals are stored alongside each snapshot. The order book panel still reads the
live book directly — a snapshot keeps the best prices and the depth behind them,
not every price level, so it can't draw a ladder.

| Variable | Default | |
| --- | --- | --- |
| `WARERA_DB_PATH` | `data/warera.sqlite` | where the history file lives |
| `WARERA_TRPC_UPSTREAM` | `https://api2.warera.io/trpc` | the API to poll and proxy |

This project was created using `bun init` in bun v1.3.11. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
