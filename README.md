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

## Logging

The server writes plain text to stdout, and `LOG_LEVEL` sets how much of it.
Each level also prints everything the levels above it print:

- `silent` — nothing at all, not even the startup line.
- `error` — failures only: a request that threw, an upstream that never
  answered, a rebuild that gave up behind a stale response.
- `warn` — 4xx replies, upstream answers carrying no usable payload, and the
  security notes: an unexpected method or a probe-shaped path at the tRPC
  proxy, or an oversized body posted to it, each with the caller's address and
  user agent.
- `info` — the startup line, and one line per request with its method, path,
  status, duration, cache status and client address.
- `debug` — every upstream call, cache decision, aggregate rebuild, and every
  request for a path that matches no built asset.

It defaults to `info` under `bun start` and `debug` under `bun dev`.

This project was created using `bun init` in bun v1.3.11. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
