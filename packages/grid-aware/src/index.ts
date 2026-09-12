import type { components } from "./client.gen.js";
import { createGridAwareClient } from "./client.js";

/** `/v1/intensity` API response. */
export type GridIntensityData = components["schemas"]["GridIntensityResponse"];

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

/** Same as {@link GridAwareOptions}, but no caching options */
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
}

/**
 * Sets `data-grid-aware` before the page paints. No flash of default styling but it
 * blocks the page load with a real network request. No caching.
 *
 * Only use this in an early `<head>` script. Otherwise use {@link initGridAware}.
 */
export function initGridAwareBlocking(options: GridAwareBlockingOptions): void {
  if (!options.apiBaseUrl) {
    throw new Error("grid-aware: apiBaseUrl is required");
  }

  const params = new URLSearchParams();
  if (options.zone) params.set("zone", options.zone);
  if (options.postcode) params.set("postcode", options.postcode);
  if (options.regionid !== undefined)
    params.set("regionid", String(options.regionid));
  const query = params.toString();
  const baseUrl = options.apiBaseUrl.endsWith("/")
    ? options.apiBaseUrl.slice(0, -1)
    : options.apiBaseUrl;
  const url = `${baseUrl}/v1/intensity${query ? `?${query}` : ""}`;

  let data: GridIntensityData;
  try {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url, false); // false: synchronous, blocks until the response arrives
    xhr.send();
    if (xhr.status < 200 || xhr.status >= 300) {
      throw new Error(`request failed with status ${xhr.status}`);
    }
    data = JSON.parse(xhr.responseText) as GridIntensityData;
  } catch (error) {
    console.error("grid-aware: blocking fetch failed", error);
    data = unknownIntensityData();
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

  let cached: { data: GridIntensityData; fetchedAt: number } | undefined;

  function applyBand(data: GridIntensityData): void {
    const band = options.mapBand
      ? options.mapBand(data)
      : data.carbonIntensity.band;
    document.documentElement.dataset.gridAware = band;
  }

  async function refresh(): Promise<void> {
    if (maxAgeMs > 0 && cached && Date.now() - cached.fetchedAt < maxAgeMs) {
      applyBand(cached.data);
      return;
    }

    const { data, error } = await client.GET("/v1/intensity", {
      params: {
        query: {
          zone: options.zone,
          postcode: options.postcode,
          regionid: options.regionid,
        },
      },
    });

    if (error || !data) {
      console.error("grid-aware: failed to fetch intensity", error);
      applyBand(unknownIntensityData());
      return;
    }

    cached = { data, fetchedAt: Date.now() };
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
