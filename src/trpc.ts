// Pure helpers for the tRPC caching proxy in index.ts. They live here rather
// than in index.ts so tests can import them without booting the server.

export const TRPC_DEFAULT_TTL_MS = 5 * 60 * 1000;
export const TRPC_TTL_MS: Record<string, number> = {
  "country.getAllCountries": 60 * 60 * 1000,
  "party.getById": 60 * 60 * 1000,
  "gameConfig.getGameConfig": 60 * 60 * 1000,
  "itemTrading.getItemTrading": 10 * 60 * 1000,
  "tradingOrder.getTopOrders": 45 * 1000,
};

/**
 * The proxy forwards whatever procedure it is handed, so without this any tRPC
 * call on the upstream — mutations the app never makes included — could be
 * invoked through this server by anyone, unauthenticated. Only the calls the
 * app itself makes get relayed, by the method it makes them with.
 *
 * Deliberately its own map rather than a read of TRPC_TTL_MS: that one is cache
 * tuning, and adding an entry to it should never widen what the proxy relays.
 */
export const TRPC_ALLOWED_METHODS: Record<string, "GET" | "POST"> = {
  "country.getAllCountries": "GET",
  "party.getById": "GET",
  "itemTrading.getItemTrading": "GET",
  "tradingOrder.getTopOrders": "GET",
  "gameConfig.getGameConfig": "POST",
};

/**
 * undefined for anything off the allowlist, which includes a batched
 * `party.getById,party.getById?batch=1` path: nothing reaches the proxy in that
 * shape — the aggregate calls upstream directly — and its comma-joined name
 * matches no procedure here, the same reason ttlFor() would not match it either.
 */
export function allowedMethodFor(pathAndQuery: string): "GET" | "POST" | undefined {
  return TRPC_ALLOWED_METHODS[pathAndQuery.split("?")[0] ?? ""];
}

export const INDUSTRIALISM_TTL_MS = 60 * 60 * 1000;

// How long a stale aggregate stays usable while a fresh one is being built.
export const INDUSTRIALISM_SWR_MS = 10 * 60 * 1000;

// The cache holds one entry per distinct request, so a long-running server
// would otherwise keep every party, item and order book it has ever been
// asked for. Past this many entries the least recently used ones go.
export const TRPC_CACHE_MAX_ENTRIES = 500;

// An allowlisted POST carries an `input` payload and nothing else — the one the
// app sends is literally `{}` — so anything larger is not a call this proxy
// serves. Without a cap of its own the whole body rides on Bun's 128MB default:
// buffered here, embedded in the cache key, and forwarded upstream.
export const TRPC_MAX_BODY_BYTES = 4 * 1024;

// Every part of the cache key is caller-controlled, so unlimited distinct keys
// can be minted; the cache bounds itself, and this bounds the in-flight map
// beside it. It counts requests in flight at once rather than history, and
// evicting one costs only the coalescing of later callers onto it.
export const TRPC_INFLIGHT_MAX_ENTRIES = 500;

export const COUNTRIES_PATH = "country.getAllCountries?input=%7B%7D";

// One request per country would put 150+ party ids in the URL; upstream takes
// them in batches, so send them in chunks that keep the URL a sane length.
export const PARTY_BATCH_SIZE = 50;

export type CacheStatus = "HIT" | "MISS" | "STALE" | "REVALIDATING";

export function ttlFor(procedure: string): number {
  return TRPC_TTL_MS[procedure] ?? TRPC_DEFAULT_TTL_MS;
}

/**
 * Lets the browser reuse a response for however long the server copy stays
 * fresh, so a reload doesn't re-request what is already known to be current.
 * Anything already past its TTL gets max-age=0 — worth serving once, never
 * worth keeping — and staleWhileRevalidate lets a browser lean on that copy
 * for a while longer rather than blocking on a rebuild.
 */
export function cacheControl(
  status: CacheStatus,
  expiresAt: number,
  { now = Date.now(), staleWhileRevalidate = 0 }: { now?: number; staleWhileRevalidate?: number } = {},
): string {
  const fresh = status === "HIT" || status === "MISS";
  const seconds = fresh ? Math.max(0, Math.floor((expiresAt - now) / 1000)) : 0;
  const directives = ["public", `max-age=${seconds}`];
  if (staleWhileRevalidate > 0) directives.push(`stale-while-revalidate=${Math.floor(staleWhileRevalidate)}`);
  return directives.join(", ");
}

/**
 * Reading re-inserts, so the map stays ordered least-recently-used first and
 * the entry to drop is always the one at the front.
 */
export function lruGet<T>(cache: Map<string, T>, key: string): T | undefined {
  const value = cache.get(key);
  if (value === undefined) return undefined;
  cache.delete(key);
  cache.set(key, value);
  return value;
}

export function lruSet<T>(cache: Map<string, T>, key: string, value: T, maxEntries = TRPC_CACHE_MAX_ENTRIES): void {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > maxEntries) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

/**
 * A cheap content hash, so a revalidated response that hasn't changed costs a
 * few headers rather than the whole body — the country list alone is ~500KB.
 */
export function etagFor(body: string): string {
  return `"${Bun.hash(body).toString(36)}"`;
}

/**
 * If-None-Match carries a list, may be `*`, and compares weakly — W/"x" and
 * "x" are the same entity as far as a conditional GET is concerned.
 */
export function etagMatches(ifNoneMatch: string | null | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false;

  const withoutWeakPrefix = (value: string) => value.trim().replace(/^W\//, "");
  return ifNoneMatch
    .split(",")
    .some(candidate => candidate.trim() === "*" || withoutWeakPrefix(candidate) === withoutWeakPrefix(etag));
}

export function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size));
  return groups;
}

export function partyBatchPath(partyIds: string[]): string {
  const procedures = Array(partyIds.length).fill("party.getById").join(",");
  const input = JSON.stringify(Object.fromEntries(partyIds.map((id, index) => [index, { partyId: id }])));
  return `${procedures}?batch=1&input=${encodeURIComponent(input)}`;
}

type BatchEntry = { error?: unknown; result?: { data?: { ethics?: { industrialism?: number } } } };

/**
 * Maps a batched party response back onto the ids that asked for it. A partial
 * batch would be cached for an hour and quietly read as "nobody specializes",
 * so anything missing fails the whole batch and the caller serves its last
 * good copy instead.
 */
export function industrialismByParty(partyIds: string[], entries: BatchEntry[]): Record<string, number> {
  if (entries.length !== partyIds.length) throw new Error("Batched party lookup returned the wrong number of entries");

  const levels: Record<string, number> = {};
  partyIds.forEach((id, index) => {
    const entry = entries[index];
    if (!entry || "error" in entry || !entry.result) throw new Error(`Batched party lookup failed for ${id}`);
    levels[id] = entry.result.data?.ethics?.industrialism ?? 0;
  });
  return levels;
}

export function levelsByCountry(
  countries: Array<{ _id: string; rulingParty?: string }>,
  byParty: Record<string, number>,
): Record<string, number> {
  const levels: Record<string, number> = {};
  for (const country of countries) levels[country._id] = byParty[country.rulingParty ?? ""] ?? 0;
  return levels;
}
