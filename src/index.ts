import { serve } from "bun";
import type { Database } from "bun:sqlite";
import plugin from "bun-plugin-tailwind";
import path from "path";
import {
  legacyPollsUntil,
  openDatabase,
  readDailyByItem,
  readDailyTrading,
  readFirstSnapshotAt,
  readSnapshotBefore,
  readSnapshots,
} from "./db";
import { intradayBars } from "./history";
import { itemsFromConfig, weeklyChangePct, type Mover } from "./hooks";
import {
  bucketBars,
  INTERVALS,
  NARROW_INTERVAL_DAYS,
  reachesAll,
  type Interval,
} from "./indicators";
import index from "./index.html";
import { JOB_OFFERS_PATH, openOffers, toJobRow } from "./jobs";
import { bestPricesFromBatch, ORDER_BOOK_BATCH_SIZE, type BestPrices } from "./orders";
import { POLL_INTERVAL_MS, startPolling } from "./poller";
import type { Country } from "./settlement";
import {
  batchPath,
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
  TRPC_UPSTREAM,
  UPSTREAM_TIMEOUT_MS,
  type CacheStatus,
} from "./trpc";
import {
  bestPerItem,
  PLACEMENTS_PAGE_SIZE,
  rankPlacements,
  toPlacementRow,
  toRegions,
  type PlacementPage,
  type PlacementRow,
} from "./wages";

const isProduction = process.env.NODE_ENV === "production";

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

type TrpcEntry = {
  status: number;
  body: string;
  contentType: string;
  expiresAt: number;
  etag: string;
};
type TrpcFailure = { status: number; body: string; contentType: string };

const trpcCache = new Map<string, TrpcEntry>();
const trpcInFlight = new Map<string, Promise<TrpcEntry>>();

/** One upstream refresh per key, however many callers are waiting on it. */
function refresh(key: string, produce: () => Promise<TrpcEntry>): Promise<TrpcEntry> {
  let pending = trpcInFlight.get(key);
  if (!pending) {
    pending = produce().then((entry) => {
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
    refresh(key, produce).catch((err) =>
      console.error(`[trpc] background rebuild of ${key} failed:`, err),
    );
    return { entry: hit, status: "REVALIDATING" };
  }

  try {
    return { entry: await refresh(key, produce), status: "MISS" };
  } catch (err) {
    if (hit) {
      // upstream is down/erroring — serve the last good copy
      console.error(`[trpc] serving a stale copy of ${key} after:`, err);
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
  const upstream = await fetch(`${TRPC_UPSTREAM}/${pathAndQuery}`, {
    method,
    headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
    body: method === "POST" ? body : undefined,
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  const text = await upstream.text();
  // Only a JSON payload is ever kept, so it goes out as JSON whatever upstream labelled it.
  const contentType = "application/json";

  const ok = upstream.status >= 200 && upstream.status < 300 && isTrpcPayload(text);
  if (!ok) throw { status: upstream.status, body: text, contentType } satisfies TrpcFailure;

  const procedure = pathAndQuery.split("?")[0]!;
  return {
    status: upstream.status,
    body: text,
    contentType,
    expiresAt: Date.now() + ttlFor(procedure),
    etag: etagFor(text),
  };
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
  return entries.every(
    (entry) =>
      typeof entry === "object" && entry !== null && !("error" in entry) && "result" in entry,
  );
}

function parseJson(body: string, what: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`${what} came back as something other than JSON`);
  }
}

function trpcResponse(
  req: Request,
  entry: TrpcEntry,
  cacheStatus: CacheStatus,
  staleWhileRevalidate = 0,
): Response {
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
  console.error(`[trpc] ${context} failed:`, err);

  // Guarded rather than cast: a rejection from fetch is an Error, and a timeout
  // is a DOMException, neither of which carries the fields a TrpcFailure has.
  const failure: Partial<TrpcFailure> = typeof err === "object" && err !== null ? err : {};
  // Upstream's own body stays in the log: passed on with its Content-Type, a
  // gateway's HTML error page would be served as a page on this site.
  return new Response(JSON.stringify({ error: { message: "Upstream request failed" } }), {
    status: failure.status && failure.status >= 400 ? failure.status : 502,
    headers: {
      "Content-Type": "application/json",
      "X-Cache": "MISS",
      "Cache-Control": "no-store", // never let a browser hold on to an error
    },
  });
}

/**
 * The calls the browser makes through the proxy, and exactly what each sends
 * upstream. Forwarding whatever arrived would make this an open relay onto
 * upstream from this server's address, and every new query or body a fresh
 * upstream fetch that skips the cache, so the call is pinned rather than passed on.
 */
const PROXIED_CALLS: Record<string, { method: string; body: string }> = {
  "gameConfig.getGameConfig": { method: "POST", body: "{}" },
};

async function proxyTrpc(req: Request): Promise<Response> {
  const procedure = new URL(req.url).pathname.replace(/^\/api\/trpc\//, "");
  const call = PROXIED_CALLS[procedure];
  if (call?.method !== req.method) {
    return new Response(JSON.stringify({ error: { message: "Not found" } }), {
      status: 404,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  try {
    const { entry, status } = await cached(trpcCacheKey(call.method, procedure, call.body), () =>
      fetchTrpc(procedure, call.method, call.body),
    );
    return trpcResponse(req, entry, status);
  } catch (err) {
    return upstreamFailure(err, `${call.method} ${procedure}`);
  }
}

// --- industrialism aggregate ----------------------------------------------
// The settlement grid needs one party ethic per country with a government —
// the ethic pays an industrialist country for what it specializes in and an
// agrarian one for its deposits, so a country without a specialization still
// has a level worth reading. That used to be 150+ separate browser requests.
// Upstream takes tRPC calls in batches, so the whole set collapses into a
// handful of requests here and a single one from the browser.

async function fetchPartyLevels(partyIds: string[]): Promise<Record<string, number>> {
  const res = await fetch(`${TRPC_UPSTREAM}/${partyBatchPath(partyIds)}`, {
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok)
    throw { status: res.status, body: text, contentType: "application/json" } satisfies TrpcFailure;

  const entries = parseJson(text, "Batched party lookup");
  if (!Array.isArray(entries)) throw new Error("Batched party lookup did not answer with a list");
  return industrialismByParty(partyIds, entries);
}

async function buildIndustrialism(): Promise<TrpcEntry> {
  const countries = await cached(trpcCacheKey("GET", COUNTRIES_PATH, ""), () =>
    fetchTrpc(COUNTRIES_PATH, "GET", ""),
  );
  const payload = parseJson(countries.entry.body, "Country list") as {
    result?: { data?: unknown };
  };
  const data = payload.result?.data;
  if (typeof data !== "object" || data === null)
    throw new Error("Country list came back in an unexpected shape");

  const all = Object.values(data) as Array<{
    _id: string;
    specializedItem?: string;
    rulingParty?: string;
  }>;
  const governed = all.filter((country) => country.rulingParty);

  const byParty: Record<string, number> = {};
  for (const group of chunk(
    [...new Set(governed.map((country) => country.rulingParty!))],
    PARTY_BATCH_SIZE,
  )) {
    Object.assign(byParty, await fetchPartyLevels(group));
  }

  const body = JSON.stringify(levelsByCountry(governed, byParty));
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
    const { entry, status } = await cached("GET /api/industrialism", buildIndustrialism, {
      staleWhileRevalidate: true,
    });
    return trpcResponse(req, entry, status, INDUSTRIALISM_SWR_MS / 1000);
  } catch (err) {
    return upstreamFailure(err, "industrialism aggregate");
  }
}

// --- wage placements ------------------------------------------------------
// Ranking every item against every region takes the whole item list, the map,
// the order book of every item and every country's ethic. Done in the browser
// that was a dozen requests and the full ranking on every visit, for a table
// that changes only as fast as the order books do. Here it is built once per
// TTL from the cached upstream answers and handed out a page at a time.

const PLACEMENTS_TTL_MS = 60 * 1000;
const PLACEMENTS_KEY = "GET /api/placements";

async function trpcData(pathAndQuery: string, method = "GET", body = ""): Promise<unknown> {
  const { entry } = await cached(trpcCacheKey(method, pathAndQuery, body), () =>
    fetchTrpc(pathAndQuery, method, body),
  );
  const payload = parseJson(entry.body, pathAndQuery) as unknown;
  return Array.isArray(payload)
    ? payload
    : (payload as { result?: { data?: unknown } }).result?.data;
}

async function buildPlacements(): Promise<TrpcEntry> {
  const [config, countryData, regionData, levels] = await Promise.all([
    trpcData("gameConfig.getGameConfig", "POST", "{}"),
    trpcData(COUNTRIES_PATH),
    trpcData("region.getAll?input=%7B%7D"),
    cached("GET /api/industrialism", buildIndustrialism, { staleWhileRevalidate: true }).then(
      ({ entry }) => parseJson(entry.body, "Industrialism aggregate") as Record<string, number>,
    ),
  ]);

  const items = itemsFromConfig(config);
  if (typeof countryData !== "object" || countryData === null)
    throw new Error("Country list came back in an unexpected shape");
  const countries = Object.values(countryData) as Country[];
  const regions = toRegions(regionData);
  if (!regions.length) throw new Error("Region list came back in an unexpected shape");

  const market: BestPrices = { bids: {}, asks: {} };
  for (const group of chunk(
    items.map((item) => item.code),
    ORDER_BOOK_BATCH_SIZE,
  )) {
    const batch = bestPricesFromBatch(
      group,
      await trpcData(
        batchPath(
          "tradingOrder.getTopOrders",
          group.map((itemCode) => ({ itemCode })),
        ),
      ),
    );
    Object.assign(market.bids, batch.bids);
    Object.assign(market.asks, batch.asks);
  }

  const rows = rankPlacements(items, regions, countries, levels, market, Infinity).map(
    toPlacementRow,
  );
  const body = JSON.stringify(rows);
  return {
    status: 200,
    body,
    contentType: "application/json",
    expiresAt: Date.now() + PLACEMENTS_TTL_MS,
    etag: etagFor(body),
  };
}

/** Parsed once per build rather than once per page asked for. */
let placementRows: { etag: string; rows: PlacementRow[]; items: PlacementRow[] } | null = null;

function pageParam(raw: string | null, fallback: number, max: number): number {
  const value = Math.floor(Number(raw));
  return raw !== null && Number.isFinite(value) && value >= 0 ? Math.min(value, max) : fallback;
}

async function servePlacements(req: Request): Promise<Response> {
  try {
    const { entry } = await cached(PLACEMENTS_KEY, buildPlacements, { staleWhileRevalidate: true });
    if (placementRows?.etag !== entry.etag) {
      const rows: PlacementRow[] = JSON.parse(entry.body);
      placementRows = { etag: entry.etag, rows, items: bestPerItem(rows) };
    }

    const params = new URL(req.url).searchParams;
    const offset = pageParam(params.get("offset"), 0, Number.MAX_SAFE_INTEGER);
    const limit = pageParam(params.get("limit"), PLACEMENTS_PAGE_SIZE, 100);
    // `per=item` keeps only each item's best placement, for the cards above the list.
    const list = params.get("per") === "item" ? placementRows.items : placementRows.rows;
    const page: PlacementPage = {
      placements: list.slice(offset, offset + limit),
      total: list.length,
    };
    return jsonResponse(req, JSON.stringify(page), PLACEMENTS_TTL_MS / 1000);
  } catch (err) {
    return upstreamFailure(err, "wage placements");
  }
}

// --- market wages --------------------------------------------------------
// The best offers on the job market, each with the company that posted it.
// Offers only carry ids, so that is one batched lookup for the companies on top
// of the offers themselves, built once per TTL however many people are looking.

const JOBS_TTL_MS = 60 * 1000;

/** What each call in a batch came back with, in the order the calls went out. */
function batchData(entries: unknown): unknown[] {
  if (!Array.isArray(entries)) throw new Error("Batched lookup did not answer with a list");
  return entries.map((entry) => (entry as { result?: { data?: unknown } }).result?.data);
}

async function buildJobs(): Promise<TrpcEntry> {
  const offers = openOffers(await trpcData(JOB_OFFERS_PATH));

  const companyIds = [...new Set(offers.map((offer) => offer.company))];
  const companies = companyIds.length
    ? await trpcData(
        batchPath(
          "company.getById",
          companyIds.map((companyId) => ({ companyId })),
        ),
      ).then(batchData)
    : [];
  const companyById = new Map(
    companyIds.map((id, index) => [id, companies[index] as { name?: string; itemCode?: string }]),
  );

  // The offer says where the work happens, and that country's income tax is what comes off the wage.
  const [countryData, regionData] = await Promise.all([
    trpcData(COUNTRIES_PATH),
    trpcData("region.getAll?input=%7B%7D"),
  ]);
  const countryOf = new Map(toRegions(regionData).map((region) => [region.id, region.countryId]));
  const taxOf = new Map(
    (typeof countryData === "object" && countryData !== null
      ? (Object.values(countryData) as Country[])
      : []
    ).map((country) => [country._id, country.taxes?.income]),
  );
  const incomeTax = (regionId?: string) => taxOf.get(countryOf.get(regionId ?? "") ?? "") ?? null;

  const jobs = offers.map((offer) =>
    toJobRow(offer, companyById.get(offer.company), incomeTax(offer.region)),
  );
  const body = JSON.stringify({ jobs });
  return {
    status: 200,
    body,
    contentType: "application/json",
    expiresAt: Date.now() + JOBS_TTL_MS,
    etag: etagFor(body),
  };
}

async function serveJobs(req: Request): Promise<Response> {
  try {
    const { entry, status } = await cached("GET /api/jobs", buildJobs, {
      staleWhileRevalidate: true,
    });
    return trpcResponse(req, entry, status);
  } catch (err) {
    return upstreamFailure(err, "market wages");
  }
}

// --- recorded market history ----------------------------------------------
// Upstream answers with 30 days of trading and nothing finer than a day, so a
// poller writes the live order book and those daily totals into SQLite on a
// timer. This serves back what has accumulated there.

const DAY_MS = 24 * 60 * 60 * 1000;

/** How much of the record the ticker compares across. */
const MOVERS_WINDOW_DAYS = 14;

/**
 * A request that doesn't say how far back gets the whole record — that is what
 * ALL asks for. `Number("")` is 0 and `Number("abc")` is NaN; neither is a window.
 * One reaching back past 1970 is the whole record too, rather than a date
 * too far out for toISOString, which throws.
 */
function historySince(raw: string | null): number {
  const days = Number(raw);
  return Number.isFinite(days) && days > 0 ? Math.max(0, Date.now() - days * DAY_MS) : 0;
}

function day(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

function jsonResponse(req: Request, body: string, maxAgeSeconds: number): Response {
  const etag = etagFor(body);
  const headers = { ETag: etag, "Cache-Control": `public, max-age=${maxAgeSeconds}` };
  // Nothing changes between polls, so a reload inside one costs a few headers.
  if (etagMatches(req.headers.get("If-None-Match"), etag))
    return new Response(null, { status: 304, headers });
  return new Response(body, { headers: { ...headers, "Content-Type": "application/json" } });
}

/** Anything the chart doesn't offer is read as the finest, which is the bars as polled. */
function historyInterval(raw: string | null): Interval {
  return INTERVALS.find((interval) => interval === raw) ?? "5m";
}

/**
 * Both resolutions answer with the same bar shape, so the chart draws them the
 * same way — an intraday bar just carries a timestamp where a daily one
 * carries a date. The polls are grouped into the chart's candles here, so a
 * wide interval sends a bar per candle rather than every poll on record.
 */
function serveHistory(req: Request, db: Database): Response {
  const params = new URL(req.url).searchParams;
  const itemCode = params.get("itemCode") ?? "";
  if (!itemCode) {
    return new Response(JSON.stringify({ error: { message: "itemCode is required" } }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  const since = historySince(params.get("days"));
  const interval = historyInterval(params.get("interval"));
  // The chart never offers ALL at a narrow interval, which would be every poll on record.
  const intradaySince = reachesAll(interval)
    ? since
    : Math.max(since, Date.now() - NARROW_INTERVAL_DAYS * DAY_MS);
  const bars = params.get("intraday")
    ? bucketBars(
        intradayBars(
          readSnapshots(db, itemCode, intradaySince),
          readSnapshotBefore(db, itemCode, intradaySince),
          intradaySince,
          legacyUntil,
        ),
        interval,
      )
    : readDailyTrading(db, itemCode, day(since));

  // Sent with every answer so the chart can tell which ranges an intraday
  // interval can actually fill before it asks for one.
  const firstIntradayAt = readFirstSnapshotAt(db, itemCode);
  return jsonResponse(req, JSON.stringify({ bars, firstIntradayAt }), POLL_INTERVAL_MS / 1000);
}

/** The whole strip in one query, where it used to be a batch call per browser. */
function serveMovers(req: Request, db: Database): Response {
  const byItem = readDailyByItem(db, day(Date.now() - MOVERS_WINDOW_DAYS * DAY_MS));

  const movers: Mover[] = [];
  for (const [code, rows] of byItem) {
    const changePct = weeklyChangePct(rows);
    if (changePct !== null) movers.push({ code, changePct });
  }
  movers.sort((a, b) => b.changePct - a.changePct);

  return jsonResponse(req, JSON.stringify({ movers }), POLL_INTERVAL_MS / 1000);
}

/**
 * `bun --hot` re-runs this module on every edit. Without a handle to the last
 * one, each reload would leave another timer polling upstream and another
 * connection open on the same file.
 */
const hot = globalThis as typeof globalThis & {
  wareraHistory?: { db: Database; poller: { stop: () => void } };
};
hot.wareraHistory?.poller.stop();
hot.wareraHistory?.db.close();

const historyDb = openDatabase();
// Pinned before the first poll at the new pace lands, or it would count as an old one.
const legacyUntil = legacyPollsUntil(historyDb);
hot.wareraHistory = { db: historyDb, poller: startPolling(historyDb) };

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
    for (const log of result.logs) console.error(log);
    throw new Error("Production build failed, refusing to start");
  }

  const assets = new Map<string, Asset>();
  for (const output of result.outputs) {
    const name = path.basename(output.path);
    assets.set(name, {
      bytes: await output.arrayBuffer(),
      contentType: contentTypeFor(name, output.type),
    });
  }
  return assets;
};

const respond = (asset: Asset, status = 200): Response =>
  new Response(asset.bytes, { status, headers: { "Content-Type": asset.contentType } });

/**
 * The page loads nothing but its own bundle, its own API and the game's item
 * icons, so the policy allows exactly those. A game-provided string that ever
 * slipped into the markup would have nowhere to load a script from, and no
 * other site can frame the page.
 */
const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "img-src 'self' https://media.warera.io",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; "),
  // Caddy only ever serves the site over HTTPS, and a browser ignores this
  // header on a plain HTTP response, such as a local run.
  "Strict-Transport-Security": "max-age=31536000",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Cross-Origin-Opener-Policy": "same-origin",
};

const secured =
  (handler: (req: Request) => Response | Promise<Response>) =>
  async (req: Request): Promise<Response> => {
    const res = await handler(req);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.headers.set(name, value);
    return res;
  };

/**
 * Bun's default handler renders the error page — a stack trace outside
 * production — for anything a route throws. Answer plainly and keep the trace
 * in the log where it belongs.
 */
const onError = (error: unknown): Response => {
  console.error("[server] unhandled error while serving a request:", error);
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
        // Caddy on the same machine terminates TLS and proxies here, so the
        // port itself needn't be reachable from anywhere else.
        hostname: "127.0.0.1",
        error: onError,
        routes: {
          "/api/history": secured((req) => serveHistory(req, historyDb)),
          "/api/movers": secured((req) => serveMovers(req, historyDb)),
          "/api/industrialism": secured(serveIndustrialism),
          "/api/placements": secured(servePlacements),
          "/api/jobs": secured(serveJobs),
          "/api/trpc/*": secured(proxyTrpc),
          // Assets are looked up by file name so they resolve from any URL depth,
          // and anything else falls back to the single page app entry point.
          "/*": secured((req) => {
            const asset = assets.get(path.basename(new URL(req.url).pathname));
            return asset ? respond(asset) : respond(indexAsset);
          }),
        },
      });
    })()
  : serve({
      error: onError,
      routes: {
        "/api/history": (req) => serveHistory(req, historyDb),
        "/api/movers": (req) => serveMovers(req, historyDb),
        "/api/industrialism": serveIndustrialism,
        "/api/placements": servePlacements,
        "/api/jobs": serveJobs,
        "/api/trpc/*": proxyTrpc,
        "/*": index,
      },

      development: {
        hmr: true,
        console: true,
      },
    });

console.log(`🚀 Server running at ${server.url}`);
