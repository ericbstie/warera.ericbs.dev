import { serve, type Server } from "bun";
import plugin from "bun-plugin-tailwind";
import path from "path";
import index from "./index.html";
import {
  chunk,
  cacheControl,
  COUNTRIES_PATH,
  etagFor,
  etagMatches,
  industrialismByParty,
  INDUSTRIALISM_SWR_MS,
  INDUSTRIALISM_TTL_MS,
  levelsByCountry,
  lruGet,
  lruSet,
  partyBatchPath,
  PARTY_BATCH_SIZE,
  ttlFor,
  type CacheStatus,
} from "./trpc";

const isProduction = process.env.NODE_ENV === "production";

// No websockets here, so the server never carries any per-socket data.
type AppServer = Server<undefined>;

// --- logging ---------------------------------------------------------------
// Ordered quietest first, so a level prints itself and everything before it.

const LOG_LEVELS = ["silent", "error", "warn", "info", "debug"] as const;
type LogLevel = (typeof LOG_LEVELS)[number];

const requestedLevel = (process.env.LOG_LEVEL ?? "").trim().toLowerCase();
const configuredLevel = LOG_LEVELS.find(level => level === requestedLevel);
const LOG_LEVEL: LogLevel = configuredLevel ?? (isProduction ? "info" : "debug");
const verbosity = LOG_LEVELS.indexOf(LOG_LEVEL);

/**
 * Trims a value down to something loggable. Control characters go first: a
 * record only means anything if one request cannot write what looks like a
 * line of its own, and a header or a path is under the caller's control.
 */
const short = (value: string, limit = 120): string => {
  const printable = value.replace(/[\p{Cc}\p{Cf}]/gu, "\u00b7").trim();
  return printable.length > limit ? `${printable.slice(0, limit)}\u2026` : printable;
};

function write(level: Exclude<LogLevel, "silent">, line: string, ...rest: unknown[]): void {
  if (LOG_LEVELS.indexOf(level) > verbosity) return;
  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  sink(`${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${line}`, ...rest);
}

const log = {
  error: (line: string, ...rest: unknown[]) => write("error", line, ...rest),
  warn: (line: string, ...rest: unknown[]) => write("warn", line, ...rest),
  info: (line: string, ...rest: unknown[]) => write("info", line, ...rest),
  debug: (line: string, ...rest: unknown[]) => write("debug", line, ...rest),
};

// Falling back silently would read as a logger that ignores its own setting.
if (requestedLevel && !configuredLevel) {
  log.warn(`[server] ignoring LOG_LEVEL=${short(requestedLevel, 20)}, expected one of ${LOG_LEVELS.join(", ")}`);
}

/**
 * The socket address is the only one nobody can claim for themselves, and
 * behind a proxy it is the proxy's own — so record what the hop in front says
 * as well, and leave which one to believe to whoever reads the line.
 */
function clientOf(req: Request, server: AppServer): string {
  const socket = server.requestIP(req)?.address ?? "unknown";
  const forwarded = req.headers.get("X-Forwarded-For");
  return forwarded ? `ip=${socket} forwarded=${short(forwarded, 60)}` : `ip=${socket}`;
}

/** Only worth recording where the line is about who is calling, not what for. */
const agentOf = (req: Request): string => `ua="${short(req.headers.get("User-Agent") ?? "none", 80)}"`;

/**
 * One line per answered request — who asked, what they got and how long it
 * took — so a slow or failing route can be found without reproducing it.
 */
const logged =
  (handler: (req: Request, server: AppServer) => Response | Promise<Response>) =>
  async (req: Request, server: AppServer): Promise<Response> => {
    const startedAt = performance.now();
    const url = new URL(req.url);
    // Read before the handler runs: once the response is on its way the socket
    // this request arrived on may already be gone.
    const client = clientOf(req, server);
    const describe = (outcome: string) =>
      `[req] ${req.method} ${short(url.pathname + url.search)} ${outcome} ` +
      `${(performance.now() - startedAt).toFixed(1)}ms ${client}`;

    try {
      const response = await handler(req, server);
      const cacheStatus = response.headers.get("X-Cache");
      const outcome = cacheStatus ? `${response.status} cache=${cacheStatus}` : `${response.status}`;

      if (response.status >= 500) log.error(describe(outcome));
      else if (response.status >= 400) log.warn(describe(outcome));
      else log.info(describe(outcome));
      return response;
    } catch (err) {
      // onError answers this one, but only here is it known who asked for it.
      log.error(describe("threw"), err);
      throw err;
    }
  };

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

const contentTypeFor = (name: string, fallback = "application/octet-stream"): string =>
  CONTENT_TYPES[path.extname(name).toLowerCase()] ?? fallback;

// --- tRPC caching proxy ---------------------------------------------------
// The browser used to call https://api2.warera.io/trpc/* directly, so every
// page load fired 150+ requests (one party.getById per specializing country)
// and got throttled. Proxying through here with a TTL cache and in-flight
// coalescing means that burst hits the upstream at most once per TTL, no
// matter how many visitors are loading the page at the same time.

const TRPC_UPSTREAM = "https://api2.warera.io/trpc";

// Without this an upstream that accepts the connection and then goes quiet
// leaves its promise pending forever. refresh() only clears the in-flight entry
// once that promise settles, so the key would stay poisoned — and every caller
// coalesced onto it stuck — until the process restarted.
const UPSTREAM_TIMEOUT_MS = 10_000;

type TrpcEntry = { status: number; body: string; contentType: string; expiresAt: number; etag: string };
type TrpcFailure = { status: number; body: string; contentType: string };

const trpcCache = new Map<string, TrpcEntry>();
const trpcInFlight = new Map<string, Promise<TrpcEntry>>();

/** One upstream refresh per key, however many callers are waiting on it. */
function refresh(key: string, produce: () => Promise<TrpcEntry>): Promise<TrpcEntry> {
  let pending = trpcInFlight.get(key);
  if (!pending) {
    pending = produce().then(entry => {
      lruSet(trpcCache, key, entry);
      return entry;
    });
    trpcInFlight.set(key, pending);
    // .finally() returns its own promise; catch on it so a rejection isn't left unhandled.
    pending.finally(() => trpcInFlight.delete(key)).catch(() => {});
  }
  return pending;
}

/**
 * TTL cache plus in-flight coalescing, shared by the raw proxy and the
 * industrialism aggregate so both read and fill the same entries.
 *
 * With staleWhileRevalidate an expired entry is handed over straight away and
 * rebuilt behind the request, so an expensive rebuild costs whoever triggers
 * it nothing.
 */
async function cached(
  key: string,
  produce: () => Promise<TrpcEntry>,
  { staleWhileRevalidate = false } = {},
): Promise<{ entry: TrpcEntry; status: CacheStatus }> {
  const hit = lruGet(trpcCache, key);
  if (hit && hit.expiresAt > Date.now()) return { entry: hit, status: "HIT" };

  if (hit && staleWhileRevalidate) {
    // A failed rebuild leaves the copy we are about to serve in place. That is
    // the point, but it also means a permanently broken rebuild would keep
    // serving an ever-older copy silently, so say so.
    log.debug(`[cache] serving ${short(key)} while it rebuilds`);
    refresh(key, produce).catch(err => log.error(`[trpc] background rebuild of ${key} failed:`, err));
    return { entry: hit, status: "REVALIDATING" };
  }

  log.debug(`[cache] ${hit ? "expired" : "missing"} ${short(key)}, fetching`);
  try {
    return { entry: await refresh(key, produce), status: "MISS" };
  } catch (err) {
    if (hit) {
      // upstream is down/erroring — serve the last good copy
      log.error(`[trpc] serving a stale copy of ${key} after:`, err);
      return { entry: hit, status: "STALE" };
    }
    throw err;
  }
}

/** The cache is shared, so the key has to be built the same way everywhere. */
function trpcCacheKey(method: string, pathAndQuery: string, body: string): string {
  return `${method} ${pathAndQuery} ${body}`;
}

async function fetchTrpc(pathAndQuery: string, method: string, body: string): Promise<TrpcEntry> {
  const startedAt = performance.now();
  const upstream = await fetch(`${TRPC_UPSTREAM}/${pathAndQuery}`, {
    method,
    headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
    body: method === "POST" ? body : undefined,
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  const text = await upstream.text();
  const contentType = upstream.headers.get("content-type") ?? "application/json";
  log.debug(
    `[trpc] ${method} ${short(pathAndQuery)} ${upstream.status} ${text.length}B ` +
      `${(performance.now() - startedAt).toFixed(0)}ms`,
  );

  const ok = upstream.status >= 200 && upstream.status < 300 && isTrpcPayload(text);
  if (!ok) {
    // A 200 carrying something else is upstream answering as something other
    // than itself, which nothing downstream is in a position to notice.
    log.warn(`[trpc] ${short(pathAndQuery)} answered ${upstream.status} with no usable payload, not caching it`);
    throw { status: upstream.status, body: text, contentType } satisfies TrpcFailure;
  }

  const procedure = pathAndQuery.split("?")[0]!;
  return { status: upstream.status, body: text, contentType, expiresAt: Date.now() + ttlFor(procedure), etag: etagFor(text) };
}

/**
 * Upstream sometimes answers 200 with something that isn't a tRPC payload — a
 * gateway's own error page, or a body left behind by a schema change. Looking
 * only for an `error` key would let those through and cache them for the full
 * TTL, which reads as good data for an hour, so the shape has to hold up too.
 */
function isTrpcPayload(body: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return false; // not valid JSON — never cache it
  }

  // A batched call answers with one entry per procedure; a single call with one object.
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  if (entries.length === 0) return false;
  return entries.every(entry => typeof entry === "object" && entry !== null && !("error" in entry) && "result" in entry);
}

function parseJson(body: string, what: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`${what} came back as something other than JSON`);
  }
}

function trpcResponse(req: Request, entry: TrpcEntry, cacheStatus: CacheStatus, staleWhileRevalidate = 0): Response {
  const validators = {
    "X-Cache": cacheStatus,
    "Cache-Control": cacheControl(cacheStatus, entry.expiresAt, { staleWhileRevalidate }),
    ETag: entry.etag,
  };

  // The body the browser already holds is still the current one, so say so
  // rather than sending it again.
  if (etagMatches(req.headers.get("If-None-Match"), entry.etag)) {
    return new Response(null, { status: 304, headers: validators });
  }

  return new Response(entry.body, {
    status: entry.status,
    headers: { ...validators, "Content-Type": entry.contentType },
  });
}

function upstreamFailure(err: unknown, context: string): Response {
  // Nothing else records these, so a failure that never reaches a browser —
  // a rejected rebuild behind a stale response — would otherwise leave no trace.
  log.error(`[trpc] ${context} failed:`, err);

  // Guarded rather than cast: a rejection from fetch is an Error, and a timeout
  // is a DOMException, neither of which carries the fields a TrpcFailure has.
  const failure: Partial<TrpcFailure> = typeof err === "object" && err !== null ? err : {};
  return new Response(failure.body ?? JSON.stringify({ error: { message: "Upstream request failed" } }), {
    status: failure.status ?? 502,
    headers: {
      "Content-Type": failure.contentType ?? "application/json",
      "X-Cache": "MISS",
      "Cache-Control": "no-store", // never let a browser hold on to an error
    },
  });
}

// The app only ever asks for a bare procedure name. These are the shapes that
// turn up when someone is working out what else the proxy will fetch for them.
const PROBING_PATH = /(\.\.|%2e%2e|^\/|\\|^[a-z][a-z0-9+.-]*:\/\/)/i;

// Its own POSTs carry a few hundred bytes of tRPC input at most.
const OVERSIZED_BODY_BYTES = 16 * 1024;

async function proxyTrpc(req: Request, server: AppServer): Promise<Response> {
  const url = new URL(req.url);
  const method = req.method;
  const pathAndQuery = url.pathname.replace(/^\/api\/trpc\//, "") + url.search;
  const client = clientOf(req, server);

  // The proxy forwards what it is given, so what it is being asked to forward
  // is worth a record of its own even when the answer is a perfectly ordinary
  // one and the access line above it reads as nothing out of the ordinary.
  if (method !== "GET" && method !== "POST") {
    log.warn(`[security] ${method} at the tRPC proxy, which only ever serves GET and POST ${client} ${agentOf(req)}`);
  }
  if (PROBING_PATH.test(pathAndQuery)) {
    log.warn(`[security] tRPC proxy asked for ${short(pathAndQuery)} ${client} ${agentOf(req)}`);
  }

  try {
    // Reading the body belongs inside the try: a client that disconnects
    // mid-upload throws here, and outside it that escapes the route handler
    // entirely rather than becoming the 502 every other failure returns.
    const body = method === "POST" ? await req.text() : "";
    if (body.length > OVERSIZED_BODY_BYTES) {
      log.warn(`[security] ${body.length} byte body posted to ${short(pathAndQuery)} ${client} ${agentOf(req)}`);
    }

    const { entry, status } = await cached(trpcCacheKey(method, pathAndQuery, body), () =>
      fetchTrpc(pathAndQuery, method, body),
    );
    return trpcResponse(req, entry, status);
  } catch (err) {
    return upstreamFailure(err, `${method} ${pathAndQuery}`);
  }
}

// --- industrialism aggregate ----------------------------------------------
// The settlement grid needs one party ethic per specializing country, which
// used to be 150+ separate browser requests. Upstream takes tRPC calls in
// batches, so the whole set collapses into a handful of requests here and a
// single one from the browser.

async function fetchPartyLevels(partyIds: string[]): Promise<Record<string, number>> {
  const res = await fetch(`${TRPC_UPSTREAM}/${partyBatchPath(partyIds)}`, {
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  const text = await res.text();
  log.debug(`[trpc] ${partyIds.length} party lookups in one batch ${res.status} ${text.length}B`);
  if (!res.ok) throw { status: res.status, body: text, contentType: "application/json" } satisfies TrpcFailure;

  const entries = parseJson(text, "Batched party lookup");
  if (!Array.isArray(entries)) throw new Error("Batched party lookup did not answer with a list");
  return industrialismByParty(partyIds, entries);
}

async function buildIndustrialism(): Promise<TrpcEntry> {
  const countries = await cached(trpcCacheKey("GET", COUNTRIES_PATH, ""), () =>
    fetchTrpc(COUNTRIES_PATH, "GET", ""),
  );
  const payload = parseJson(countries.entry.body, "Country list") as { result?: { data?: unknown } };
  const data = payload.result?.data;
  if (typeof data !== "object" || data === null) throw new Error("Country list came back in an unexpected shape");

  const all = Object.values(data) as Array<{
    _id: string;
    specializedItem?: string;
    rulingParty?: string;
  }>;
  const specializing = all.filter(country => country.specializedItem && country.rulingParty);

  const parties = [...new Set(specializing.map(country => country.rulingParty!))];
  const byParty: Record<string, number> = {};
  for (const group of chunk(parties, PARTY_BATCH_SIZE)) {
    Object.assign(byParty, await fetchPartyLevels(group));
  }
  log.debug(`[industrialism] rebuilt from ${specializing.length} countries and ${parties.length} parties`);

  const body = JSON.stringify(levelsByCountry(specializing, byParty));
  return {
    status: 200,
    body,
    contentType: "application/json",
    expiresAt: Date.now() + INDUSTRIALISM_TTL_MS,
    etag: etagFor(body),
  };
}

async function serveIndustrialism(req: Request): Promise<Response> {
  try {
    const { entry, status } = await cached("GET /api/industrialism", buildIndustrialism, { staleWhileRevalidate: true });
    return trpcResponse(req, entry, status, INDUSTRIALISM_SWR_MS / 1000);
  } catch (err) {
    return upstreamFailure(err, "industrialism aggregate");
  }
}

type Asset = { bytes: ArrayBuffer; contentType: string };

/**
 * Bundle the app in-process so every response can be served with an explicit
 * Content-Type header — browsers download the page instead of rendering it when
 * that header is missing.
 */
const buildAssets = async (): Promise<Map<string, Asset>> => {
  const result = await Bun.build({
    entrypoints: [path.resolve(import.meta.dir, "index.html")],
    plugins: [plugin],
    minify: true,
    target: "browser",
    sourcemap: "linked",
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
  });

  if (!result.success) {
    for (const message of result.logs) log.error(`[build] ${message}`);
    throw new Error("Production build failed, refusing to start");
  }

  const assets = new Map<string, Asset>();
  for (const output of result.outputs) {
    const name = path.basename(output.path);
    assets.set(name, { bytes: await output.arrayBuffer(), contentType: contentTypeFor(name, output.type) });
  }
  return assets;
};

const respond = (asset: Asset, status = 200): Response =>
  new Response(asset.bytes, { status, headers: { "Content-Type": asset.contentType } });

/**
 * Bun's default handler renders the error page — a stack trace outside
 * production — for anything a route throws. Answer plainly and keep the trace
 * in the log where it belongs.
 */
const onError = (error: unknown): Response => {
  log.error("[server] unhandled error while serving a request:", error);
  return new Response("Internal Server Error", {
    status: 500,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};

const server = isProduction
  ? await (async () => {
      const assets = await buildAssets();
      const indexAsset = assets.get("index.html");
      // Asserting this used to hand `undefined` to respond(), which meant a
      // TypeError on every request that fell through to the app rather than
      // one clear failure here.
      if (!indexAsset) throw new Error("Production build produced no index.html to serve");

      return serve({
        error: onError,
        routes: {
          "/api/industrialism": logged(serveIndustrialism),
          "/api/trpc/*": logged(proxyTrpc),
          // Assets are looked up by file name so they resolve from any URL depth,
          // and anything else falls back to the single page app entry point.
          "/*": logged(req => {
            const name = path.basename(new URL(req.url).pathname);
            const asset = assets.get(name);
            if (!asset) log.debug(`[static] nothing built under the name ${short(name, 60)}, serving the app`);
            return asset ? respond(asset) : respond(indexAsset);
          }),
        },
      });
    })()
  : serve({
      error: onError,
      routes: {
        "/api/industrialism": logged(serveIndustrialism),
        "/api/trpc/*": logged(proxyTrpc),
        "/*": index,
      },

      development: {
        hmr: true,
        console: true,
      },
    });

log.info(
  `🚀 Server running at ${server.url} — ${isProduction ? "production" : "development"}, LOG_LEVEL=${LOG_LEVEL}`,
);
