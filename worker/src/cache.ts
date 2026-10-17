import type { CacheStore } from "./ports.js";

/** NESO publishes new settlement periods every 30 minutes. */
export const NESO_CACHE_TTL_SECONDS = 30 * 60;

/** Electricity Maps refreshes hourly; also covers the zone list, since it's Electricity Maps data too. */
export const ELECTRICITY_MAPS_CACHE_TTL_SECONDS = 60 * 60;

/** NESO sends Elexon a new surplus forecast hourly. */
export const BMRS_CACHE_TTL_SECONDS = 60 * 60;

/** Returns the cached response for `cacheKey`, or runs `handler` and caches its result if it succeeded. */
export async function withEdgeCache(
  cacheKey: string,
  ttlSeconds: number,
  store: CacheStore,
  handler: () => Promise<Response>,
): Promise<Response> {
  const cached = await store.get(cacheKey);
  if (cached) return cached;

  const response = await handler();
  if (response.ok) {
    await store.set(cacheKey, response.clone(), ttlSeconds);
  }
  return response;
}

/** Caches a JSON value through withEdgeCache, for upstream data that many requests share. */
export async function cachedJson<T>(
  cacheKey: string,
  ttlSeconds: number,
  store: CacheStore,
  load: () => Promise<T>,
): Promise<T> {
  const response = await withEdgeCache(
    cacheKey,
    ttlSeconds,
    store,
    async () => new Response(JSON.stringify(await load()), { status: 200 }),
  );
  return (await response.json()) as T;
}
