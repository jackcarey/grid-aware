export interface CacheStore {
  get(key: string): Promise<Response | undefined>;
  set(key: string, response: Response, ttlSeconds: number): Promise<void>;
}

export interface AppDeps {
  electricityMapsToken: string | undefined;
  allowedOrigins: string[];
  getCountry(request: Request): string | undefined;
  /** UK outward postcode (e.g. "SW1A") derived from the edge's geolocation, when available. */
  getPostcode(request: Request): string | undefined;
  /** Edge-detected city name, used as a coarser fallback when there's no postcode. */
  getCity(request: Request): string | undefined;
  /** Edge-detected first-level region/subdivision name (e.g. "England"), when available. */
  getRegion(request: Request): string | undefined;
  /** IATA code of the edge data center that handled the request, e.g. "LHR". */
  getColo(request: Request): string | undefined;
  /** True once GB regional traffic is high enough that one shared all-regions fetch beats one-off per-region calls. */
  isOverRegionalRateLimit(): Promise<boolean>;
  cache: CacheStore;
}

/** Hono generic env: how route handlers access AppDeps via `c.get("deps")`. */
export type AppEnv = { Variables: { deps: AppDeps } };

export function createInMemoryCacheStore(): CacheStore {
  const store = new Map<string, { response: Response; expiresAt: number }>();
  return {
    async get(key) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt < Date.now()) {
        store.delete(key);
        return undefined;
      }
      return entry.response.clone();
    },
    async set(key, response, ttlSeconds) {
      store.set(key, { response: response.clone(), expiresAt: Date.now() + ttlSeconds * 1000 });
    },
  };
}

export function createNoopAppDeps(overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    electricityMapsToken: undefined,
    allowedOrigins: [],
    getCountry: () => undefined,
    getPostcode: () => undefined,
    getCity: () => undefined,
    getRegion: () => undefined,
    getColo: () => undefined,
    isOverRegionalRateLimit: async () => false,
    cache: createInMemoryCacheStore(),
    ...overrides,
  };
}
