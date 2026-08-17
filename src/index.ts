import { serve } from "bun";
import plugin from "bun-plugin-tailwind";
import path from "path";
import index from "./index.html";

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
const TRPC_DEFAULT_TTL_MS = 5 * 60 * 1000;
const TRPC_TTL_MS: Record<string, number> = {
  "country.getAllCountries": 60 * 60 * 1000,
  "party.getById": 60 * 60 * 1000,
  "gameConfig.getGameConfig": 60 * 60 * 1000,
  "itemTrading.getItemTrading": 10 * 60 * 1000,
  "tradingOrder.getTopOrders": 45 * 1000,
};

type TrpcEntry = { status: number; body: string; contentType: string; expiresAt: number };
type TrpcFailure = { status: number; body: string; contentType: string };

const trpcCache = new Map<string, TrpcEntry>();
const trpcInFlight = new Map<string, Promise<TrpcEntry>>();

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
  return { status: upstream.status, body: text, contentType, expiresAt: Date.now() + (TRPC_TTL_MS[procedure] ?? TRPC_DEFAULT_TTL_MS) };
}

function hasTrpcError(body: string): boolean {
  try {
    return "error" in JSON.parse(body);
  } catch {
    return true; // not valid JSON — treat as a failure, never cache it
  }
}

function trpcResponse(entry: TrpcEntry, cacheStatus: "HIT" | "MISS" | "STALE"): Response {
  return new Response(entry.body, { status: entry.status, headers: { "Content-Type": entry.contentType, "X-Cache": cacheStatus } });
}

async function proxyTrpc(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const pathAndQuery = url.pathname.replace(/^\/api\/trpc\//, "") + url.search;
  const method = req.method;
  const body = method === "POST" ? await req.text() : "";
  const key = `${method} ${pathAndQuery} ${body}`;

  const cached = trpcCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return trpcResponse(cached, "HIT");

  let pending = trpcInFlight.get(key);
  if (!pending) {
    pending = fetchTrpc(pathAndQuery, method, body);
    trpcInFlight.set(key, pending);
    // .finally() returns its own promise; catch on it so a rejection isn't left unhandled.
    pending.finally(() => trpcInFlight.delete(key)).catch(() => {});
  }

  try {
    const entry = await pending;
    trpcCache.set(key, entry);
    return trpcResponse(entry, "MISS");
  } catch (err) {
    if (cached) return trpcResponse(cached, "STALE"); // upstream is down/erroring — serve the last good copy
    const failure = err as Partial<TrpcFailure>;
    return new Response(failure.body ?? JSON.stringify({ error: { message: "Upstream request failed" } }), {
      status: failure.status ?? 502,
      headers: { "Content-Type": failure.contentType ?? "application/json", "X-Cache": "MISS" },
    });
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
        "/api/trpc/*": proxyTrpc,
        "/*": index,
      },

      development: {
        hmr: true,
        console: true,
      },
    });

console.log(`🚀 Server running at ${server.url}`);
