// Pure helpers for the tRPC caching proxy in index.ts. They live here rather
// than in index.ts so tests can import them without booting the server.

// Overridable so a test can stand a stub upstream in front of the poller.
export const TRPC_UPSTREAM = process.env.WARERA_TRPC_UPSTREAM ?? "https://api2.warera.io/trpc";

// Without this an upstream that accepts the connection and then goes quiet
// leaves its promise pending forever. refresh() only clears the in-flight entry
// once that promise settles, so the key would stay poisoned — and every caller
// coalesced onto it stuck — until the process restarted.
export const UPSTREAM_TIMEOUT_MS = 10_000;

export const TRPC_DEFAULT_TTL_MS = 5 * 60 * 1000;
export const TRPC_TTL_MS: Record<string, number> = {
  "country.getAllCountries": 60 * 60 * 1000,
  "party.getById": 60 * 60 * 1000,
  "gameConfig.getGameConfig": 60 * 60 * 1000,
  "itemTrading.getItemTrading": 10 * 60 * 1000,
  "itemTrading.getPrices": 60 * 1000,
  "tradingOrder.getTopOrders": 45 * 1000,
};

export const INDUSTRIALISM_TTL_MS = 60 * 60 * 1000;

// How long a stale aggregate stays usable while a fresh one is being built.
export const INDUSTRIALISM_SWR_MS = 10 * 60 * 1000;

// The cache holds one entry per distinct request, so a long-running server
// would otherwise keep every party, item and order book it has ever been
// asked for. Past this many entries the least recently used ones go.
export const TRPC_CACHE_MAX_ENTRIES = 500;
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

/**
 * Upstream takes one procedure per comma-separated name and indexes the inputs
 * to match, so a batch of n calls is the name repeated n times.
 */
export function batchPath(procedure: string, inputs: object[]): string {
  const procedures = Array(inputs.length).fill(procedure).join(",");
  const input = JSON.stringify(Object.fromEntries(inputs.map((value, index) => [index, value])));
  return `${procedures}?batch=1&input=${encodeURIComponent(input)}`;
}

export function partyBatchPath(partyIds: string[]): string {
  return batchPath("party.getById", partyIds.map(partyId => ({ partyId })));
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
