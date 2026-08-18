import { serve } from "bun";
import plugin from "bun-plugin-tailwind";
import path from "path";
import index from "./index.html";
import {
  chunk,
  cacheControl,
  COUNTRIES_PATH,
  industrialismByParty,
  INDUSTRIALISM_TTL_MS,
  levelsByCountry,
  partyBatchPath,
  PARTY_BATCH_SIZE,
  ttlFor,
  type CacheStatus,
} from "./trpc";

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

const TRPC_UPSTREAM = "https://api2.warera.io/trpc";

type TrpcEntry = { status: number; body: string; contentType: string; expiresAt: number };
type TrpcFailure = { status: number; body: string; contentType: string };

const trpcCache = new Map<string, TrpcEntry>();
const trpcInFlight = new Map<string, Promise<TrpcEntry>>();

/**
 * TTL cache plus in-flight coalescing, shared by the raw proxy and the
 * industrialism aggregate so both read and fill the same entries.
 */
async function cached(key: string, produce: () => Promise<TrpcEntry>): Promise<{ entry: TrpcEntry; status: CacheStatus }> {
  const hit = trpcCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return { entry: hit, status: "HIT" };

  let pending = trpcInFlight.get(key);
  if (!pending) {
    pending = produce();
    trpcInFlight.set(key, pending);
    // .finally() returns its own promise; catch on it so a rejection isn't left unhandled.
    pending.finally(() => trpcInFlight.delete(key)).catch(() => {});
  }

  try {
    const entry = await pending;
    trpcCache.set(key, entry);
    return { entry, status: "MISS" };
  } catch (err) {
    if (hit) return { entry: hit, status: "STALE" }; // upstream is down/erroring — serve the last good copy
    throw err;
  }
}

async function fetchTrpc(pathAndQuery: string, method: string, body: string): Promise<TrpcEntry> {
  const upstream = await fetch(`${TRPC_UPSTREAM}/${pathAndQuery}`, {
    method,
    headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
    body: method === "POST" ? body : undefined,
  });
  const text = await upstream.text();
  const contentType = upstream.headers.get("content-type") ?? "application/json";

  const ok = upstream.status >= 200 && upstream.status < 300 && !hasTrpcError(text);
  if (!ok) throw { status: upstream.status, body: text, contentType } satisfies TrpcFailure;

  const procedure = pathAndQuery.split("?")[0]!;
  return { status: upstream.status, body: text, contentType, expiresAt: Date.now() + ttlFor(procedure) };
}

function hasTrpcError(body: string): boolean {
  try {
    return "error" in JSON.parse(body);
  } catch {
    return true; // not valid JSON — treat as a failure, never cache it
  }
}

function trpcResponse(entry: TrpcEntry, cacheStatus: CacheStatus): Response {
  return new Response(entry.body, {
    status: entry.status,
    headers: {
      "Content-Type": entry.contentType,
      "X-Cache": cacheStatus,
      "Cache-Control": cacheControl(cacheStatus, entry.expiresAt),
    },
  });
}

function upstreamFailure(err: unknown): Response {
  const failure = err as Partial<TrpcFailure>;
  return new Response(failure.body ?? JSON.stringify({ error: { message: "Upstream request failed" } }), {
    status: failure.status ?? 502,
    headers: {
      "Content-Type": failure.contentType ?? "application/json",
      "X-Cache": "MISS",
      "Cache-Control": "no-store", // never let a browser hold on to an error
    },
  });
}

async function proxyTrpc(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const pathAndQuery = url.pathname.replace(/^\/api\/trpc\//, "") + url.search;
  const method = req.method;
  const body = method === "POST" ? await req.text() : "";
  const key = `${method} ${pathAndQuery} ${body}`;

  try {
    const { entry, status } = await cached(key, () => fetchTrpc(pathAndQuery, method, body));
    return trpcResponse(entry, status);
  } catch (err) {
    return upstreamFailure(err);
  }
}

// --- industrialism aggregate ----------------------------------------------
// The settlement grid needs one party ethic per specializing country, which
// used to be 150+ separate browser requests. Upstream takes tRPC calls in
// batches, so the whole set collapses into a handful of requests here and a
// single one from the browser.

async function fetchPartyLevels(partyIds: string[]): Promise<Record<string, number>> {
  const res = await fetch(`${TRPC_UPSTREAM}/${partyBatchPath(partyIds)}`);
  const text = await res.text();
  if (!res.ok) throw { status: res.status, body: text, contentType: "application/json" } satisfies TrpcFailure;
  return industrialismByParty(partyIds, JSON.parse(text));
}

async function buildIndustrialism(): Promise<TrpcEntry> {
  const countries = await cached(`GET ${COUNTRIES_PATH} `, () => fetchTrpc(COUNTRIES_PATH, "GET", ""));
  const all = Object.values(JSON.parse(countries.entry.body).result.data) as Array<{
    _id: string;
    specializedItem?: string;
    rulingParty?: string;
  }>;
  const specializing = all.filter(country => country.specializedItem && country.rulingParty);

  const byParty: Record<string, number> = {};
  for (const group of chunk([...new Set(specializing.map(country => country.rulingParty!))], PARTY_BATCH_SIZE)) {
    Object.assign(byParty, await fetchPartyLevels(group));
  }

  return {
    status: 200,
    body: JSON.stringify(levelsByCountry(specializing, byParty)),
    contentType: "application/json",
    expiresAt: Date.now() + INDUSTRIALISM_TTL_MS,
  };
}

async function serveIndustrialism(): Promise<Response> {
  try {
    const { entry, status } = await cached("GET /api/industrialism", buildIndustrialism);
    return trpcResponse(entry, status);
  } catch (err) {
    return upstreamFailure(err);
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

  const assets = new Map<string, Asset>();
  for (const output of result.outputs) {
    const name = path.basename(output.path);
    assets.set(name, { bytes: await output.arrayBuffer(), contentType: contentTypeFor(name, output.type) });
  }
  return assets;
};

const respond = (asset: Asset, status = 200): Response =>
  new Response(asset.bytes, { status, headers: { "Content-Type": asset.contentType } });

const server = isProduction
  ? await (async () => {
      const assets = await buildAssets();
      const indexAsset = assets.get("index.html")!;

      return serve({
        routes: {
          "/api/industrialism": serveIndustrialism,
          "/api/trpc/*": proxyTrpc,
          // Assets are looked up by file name so they resolve from any URL depth,
          // and anything else falls back to the single page app entry point.
          "/*": req => {
            const asset = assets.get(path.basename(new URL(req.url).pathname));
            return asset ? respond(asset) : respond(indexAsset);
          },
        },
      });
    })()
  : serve({
      routes: {
        "/api/industrialism": serveIndustrialism,
        "/api/trpc/*": proxyTrpc,
        "/*": index,
      },

      development: {
        hmr: true,
        console: true,
      },
    });

console.log(`🚀 Server running at ${server.url}`);
