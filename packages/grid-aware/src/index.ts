import { createGridAwareClient, type GridIntensityData } from "./client.js";

export {
  createGridAwareClient,
  type GridAwareClient,
  type GridIntensityData,
  type IntensityQuery,
} from "./client.js";

export interface GridAwareOptions {
  /** Your worker's URL. Required. */
  apiBaseUrl: string;
  /** Electricity Maps zone code, e.g. `"FR"`. Skip it to auto-detect the visitor's location. */
  zone?: string;
  /** UK postcode, e.g. `"SW1A"`. Wins over `zone` if both are set. */
  postcode?: string;
  /** UK DNO region ID (1-14) */
  regionid?: number;
  /** Turns the response into the `data-grid-aware` value. Default: just use the band ("low", "medium", "high"). */
  mapBand?: (data: GridIntensityData) => string;
  /** How long to reuse a fetched result, in ms. `0` = always fetch fresh. Default: 30 minutes. */
  maxAgeMs?: number;
  /** Auto-refresh on a timer? Default: yes. */
  autoRefresh?: boolean;
}

/** {@link initGridAware}. */
export interface GridAwareHandle {
  /** Fetch again (or reuse cache) and update the page right now. */
  refresh(): Promise<void>;
  /** Stop the auto-refresh timer. */
  stop(): void;
}

const DEFAULT_MAX_AGE_MS = 30 * 60 * 1000;

function unknownIntensityData(): GridIntensityData {
  return {
    source: "electricitymaps",
    location: { zone: "unknown", region: { unknown: true } },
    datetime: new Date().toISOString(),
    carbonIntensity: {
      value: null,
      unit: "gCO2eq/kWh",
      type: "unknown",
      band: "unknown",
    },
    fallback: { reason: "Failed to fetch intensity data" },
  };
}

/** Same request, every time, for the same inputs - used as both the actual blocking-build URL and the cache key for both functions. */
function intensityRequestUrl(
  apiBaseUrl: string,
  subject: { zone?: string; postcode?: string; regionid?: number },
): string {
  const params = new URLSearchParams();
  if (subject.zone) params.set("zone", subject.zone);
  if (subject.postcode) params.set("postcode", subject.postcode);
  if (subject.regionid !== undefined) params.set("regionid", String(subject.regionid));
  const query = params.toString();
  const baseUrl = apiBaseUrl.endsWith("/") ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
  return `${baseUrl}/v1/intensity${query ? `?${query}` : ""}`;
}

interface CacheEntry {
  data: GridIntensityData;
  fetchedAt: number;
}

// One cache, backed by sessionStorage so it survives a full page reload (initGridAwareBlocking's
// only chance to reuse anything) and doubles as initGridAware's in-page cache too.
function readCache(key: string, maxAgeMs: number): GridIntensityData | undefined {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return undefined;
    const entry = JSON.parse(raw) as CacheEntry;
    return Date.now() - entry.fetchedAt < maxAgeMs ? entry.data : undefined;
  } catch {
    return undefined; // sessionStorage can be unavailable (private mode, quota, etc.) - just skip the cache
  }
}

function writeCache(key: string, data: GridIntensityData): void {
  try {
    sessionStorage.setItem(key, JSON.stringify({ data, fetchedAt: Date.now() } satisfies CacheEntry));
  } catch {
    // Same as above - caching is a nice-to-have, never worth failing the page over.
  }
}

/** Same as {@link GridAwareOptions}, but no `autoRefresh` - it's a one-shot call, there's no timer. */
export interface GridAwareBlockingOptions {
  /** Your worker's URL. Required. */
  apiBaseUrl: string;
  /** Electricity Maps zone code, e.g. `"FR"`. Skip it to auto-detect the visitor's location. */
  zone?: string;
  /** UK postcode, e.g. `"SW1A"`. Wins over `zone` if both are set. */
  postcode?: string;
  /** UK DNO region ID (1-14) */
  regionid?: number;
  /** Turns the response into your `data-grid-aware` value. Default: just use the band ("low", "high", etc). */
  mapBand?: (data: GridIntensityData) => string;
  /** How long to reuse a cached result in ms. `0` = always fetch fresh. Default: 30 minutes. */
  maxAgeMs?: number;
}

/**
 * Sets `data-grid-aware` before the page paints. No flash of default styling but it
 * blocks the page load
 *
 * Only use this in an early `<head>` script. Otherwise use {@link initGridAware}.
 */
export function initGridAwareBlocking(options: GridAwareBlockingOptions): void {
  if (!options.apiBaseUrl) {
    throw new Error("grid-aware: apiBaseUrl is required");
  }

  const url = intensityRequestUrl(options.apiBaseUrl, options);
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const cacheKey = `grid-aware:${url}`;

  let data = maxAgeMs > 0 ? readCache(cacheKey, maxAgeMs) : undefined;

  if (!data) {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", url, false); // false: synchronous, blocks until the response arrives
      xhr.send();
      if (xhr.status < 200 || xhr.status >= 300) {
        throw new Error(`request failed with status ${xhr.status}`);
      }
      data = JSON.parse(xhr.responseText) as GridIntensityData;
      if (maxAgeMs > 0) writeCache(cacheKey, data);
    } catch (error) {
      console.error("grid-aware: blocking fetch failed", error);
      data = unknownIntensityData();
    }
  }

  const band = options.mapBand
    ? options.mapBand(data)
    : data.carbonIntensity.band;
  document.documentElement.dataset.gridAware = band;
}

/**
 * Sets `data-grid-aware` and keeps it updated.
 *
 * Never throws for a bad fetch - it just shows "unknown" instead. Call `.stop()`
 * on the returned handle when you're done (e.g. unmounting a component).
 */
export function initGridAware(options: GridAwareOptions): GridAwareHandle {
  if (!options.apiBaseUrl) {
    throw new Error("grid-aware: apiBaseUrl is required");
  }

  const client = createGridAwareClient(options.apiBaseUrl);

  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const autoRefresh = options.autoRefresh ?? true;
  const cacheKey = `grid-aware:${intensityRequestUrl(options.apiBaseUrl, options)}`;

  function applyBand(data: GridIntensityData): void {
    const band = options.mapBand
      ? options.mapBand(data)
      : data.carbonIntensity.band;
    document.documentElement.dataset.gridAware = band;
  }

  async function refresh(): Promise<void> {
    const cached = maxAgeMs > 0 ? readCache(cacheKey, maxAgeMs) : undefined;
    if (cached) {
      applyBand(cached);
      return;
    }

    let data: GridIntensityData;
    try {
      data = await client.getCurrentIntensity({
        zone: options.zone,
        postcode: options.postcode,
        regionid: options.regionid,
      });
    } catch (error) {
      console.error("grid-aware: failed to fetch intensity", error);
      applyBand(unknownIntensityData());
      return;
    }

    if (maxAgeMs > 0) writeCache(cacheKey, data);
    applyBand(data);
  }

  void refresh();
  // A 0ms interval would hammer the API, so a timer only makes sense when there's
  // a real cadence to run it at.
  const timer =
    autoRefresh && maxAgeMs > 0
      ? setInterval(() => void refresh(), maxAgeMs)
      : undefined;

  return {
    refresh,
    stop(): void {
      if (timer) clearInterval(timer);
    },
  };
}
