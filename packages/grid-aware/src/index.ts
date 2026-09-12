import type { components } from "./client.gen.js";
import { createGridAwareClient } from "./client.js";

export type GridIntensityData = components["schemas"]["GridIntensityResponse"];

export interface GridAwareOptions {
  apiBaseUrl: string;
  zone?: string;
  postcode?: string;
  regionid?: number;
  mapBand?: (data: GridIntensityData) => string;
  maxAgeMs?: number;
  autoRefresh?: boolean;
}

export interface GridAwareHandle {
  refresh(): Promise<void>;
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

export interface GridAwareBlockingOptions {
  apiBaseUrl: string;
  zone?: string;
  postcode?: string;
  regionid?: number;
  mapBand?: (data: GridIntensityData) => string;
}

/**
 * Fetches synchronously so `data-grid-aware` is set
 * before first paint, with no flash of unstyled/default content. The first load costs a full
 * network round-trip on the main thread on every page load - only use this
 * for a script placed early in `<head>`, not the default async `initGridAware`.
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

export function initGridAware(options: GridAwareOptions): GridAwareHandle {
  if (!options.apiBaseUrl) {
    throw new Error("grid-aware: apiBaseUrl is required");
  }

  const client = createGridAwareClient(options.apiBaseUrl);

  // How long a fetched response is reused before refresh() fetches again. 0 means
  // always fetch fresh. Independent of whether there's a recurring autoRefresh timer
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
