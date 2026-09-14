import createClient from "openapi-fetch";
import type { components, paths } from "./client.gen.js";

/** `/v1/intensity` API response. */
export type GridIntensityData = components["schemas"]["GridIntensityResponse"];
export type ForecastHorizon = "24h" | "48h";

export interface IntensityQuery {
  /** Electricity Maps zone code, e.g. `"FR"`. Skip it to auto-detect the visitor's location. */
  zone?: string;
  /** UK postcode, e.g. `"SW1A"`. Wins over `zone` if both are set. */
  postcode?: string;
  /** UK DNO region ID (1-14). */
  regionid?: number;
}

export interface GridAwareClient {
  /** The current period only - no `forecast` array. */
  getCurrentIntensity(query?: IntensityQuery): Promise<GridIntensityData>;
  /** Same response shape, but with `forecast` populated for the requested window. Default: `"24h"`. */
  getForecast(query?: IntensityQuery & { horizon?: ForecastHorizon }): Promise<GridIntensityData>;
}

/** A typed fetch client for a grid-aware worker's API. */
export function createGridAwareClient(baseUrl: string): GridAwareClient {
  const client = createClient<paths>({ baseUrl });

  async function fetchIntensity(
    query: IntensityQuery & { horizon: "latest" | ForecastHorizon },
  ): Promise<GridIntensityData> {
    const { data, error } = await client.GET("/v1/intensity", { params: { query } });
    if (error || !data) throw new Error("grid-aware: failed to fetch intensity data");
    return data;
  }

  return {
    getCurrentIntensity: (query = {}) => fetchIntensity({ ...query, horizon: "latest" }),
    getForecast: ({ horizon = "24h", ...query } = {}) => fetchIntensity({ ...query, horizon }),
  };
}
