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

export const INDUSTRIALISM_TTL_MS = 60 * 60 * 1000;
export const COUNTRIES_PATH = "country.getAllCountries?input=%7B%7D";

// One request per country would put 150+ party ids in the URL; upstream takes
// them in batches, so send them in chunks that keep the URL a sane length.
export const PARTY_BATCH_SIZE = 50;

export type CacheStatus = "HIT" | "MISS" | "STALE";

export function ttlFor(procedure: string): number {
  return TRPC_TTL_MS[procedure] ?? TRPC_DEFAULT_TTL_MS;
}

/**
 * Lets the browser reuse a response for however long the server copy stays
 * fresh, so a reload doesn't re-request what is already known to be current.
 * A stale copy gets max-age=0 — it is worth serving once, never worth keeping.
 */
export function cacheControl(status: CacheStatus, expiresAt: number, now = Date.now()): string {
  const seconds = status === "STALE" ? 0 : Math.max(0, Math.floor((expiresAt - now) / 1000));
  return `public, max-age=${seconds}`;
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
