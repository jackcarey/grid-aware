import { createApp } from "../app.js";
import { parseAllowedOrigins } from "../config.js";
import { toOutwardPostcode } from "../geo.js";
import type { AppDeps, CacheStore } from "../ports.js";

export interface Env {
  ELECTRICITY_MAPS_TOKEN?: string;
  ALLOWED_ORIGINS?: string;
  GB_REGIONAL_RATE_LIMITER: RateLimit;
  API_RATE_LIMITER: RateLimit;
  ASSETS: Fetcher;
}

export function createCloudflareCacheStore(ctx: ExecutionContext): CacheStore {
  const cache = caches.default;
  return {
    async get(key) {
      return (await cache.match(key)) ?? undefined;
    },
    async set(key, response, ttlSeconds) {
      const cacheable = new Response(response.body, response);
      cacheable.headers.set("Cache-Control", `public, max-age=${ttlSeconds}`);
      ctx.waitUntil(cache.put(key, cacheable));
    },
  };
}

export function getCountry(request: Request): string | undefined {
  const cf = (request as Request & { cf?: { country?: string } }).cf;
  return cf?.country;
}

export function getPostcode(request: Request): string | undefined {
  const cf = (request as Request & { cf?: { postalCode?: string } }).cf;
  return cf?.postalCode ? toOutwardPostcode(cf.postalCode) : undefined;
}

export function getCity(request: Request): string | undefined {
  const cf = (request as Request & { cf?: { city?: string } }).cf;
  return cf?.city;
}

/** Cloudflare's first-level ISO 3166-2 subdivision name - e.g. "England" for a GB request. */
export function getRegion(request: Request): string | undefined {
  const cf = (request as Request & { cf?: { region?: string } }).cf;
  return cf?.region;
}

/** IATA code of the Cloudflare data center that handled the request - where the network routed it, not necessarily where the visitor is. */
export function getColo(request: Request): string | undefined {
  const cf = (request as Request & { cf?: { colo?: string } }).cf;
  return cf?.colo;
}

const GB_REGIONAL_RATE_LIMIT_KEY = "gb-regional";

export async function isOverRegionalRateLimit(rateLimiter: RateLimit): Promise<boolean> {
  const { success } = await rateLimiter.limit({ key: GB_REGIONAL_RATE_LIMIT_KEY });
  return !success;
}

const API_RATE_LIMIT_KEY = "v1-global";

export async function isOverApiRateLimit(rateLimiter: RateLimit): Promise<boolean> {
  const { success } = await rateLimiter.limit({ key: API_RATE_LIMIT_KEY });
  return !success;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const deps: AppDeps = {
      electricityMapsToken: env.ELECTRICITY_MAPS_TOKEN,
      allowedOrigins: parseAllowedOrigins(env.ALLOWED_ORIGINS),
      getCountry,
      getPostcode,
      getCity,
      getRegion,
      getColo,
      isOverRegionalRateLimit: () => isOverRegionalRateLimit(env.GB_REGIONAL_RATE_LIMITER),
      isOverApiRateLimit: () => isOverApiRateLimit(env.API_RATE_LIMITER),
      cache: createCloudflareCacheStore(ctx),
    };

    return createApp(deps).fetch(request, env, ctx);
  },
};
