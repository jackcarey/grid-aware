import type { CacheStore } from "./ports.js";

/** NESO publishes new settlement periods every 30 minutes. */
export const NESO_CACHE_TTL_SECONDS = 30 * 60;

/** Electricity Maps refreshes hourly; also covers /v1/zones, since it's Electricity Maps data too. */
export const ELECTRICITY_MAPS_CACHE_TTL_SECONDS = 60 * 60;

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
