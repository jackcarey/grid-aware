import createClient from "openapi-fetch";
import type { components, paths } from "./client.gen.js";

/** `/v2/intensity` API response. */
export type GridIntensityData = components["schemas"]["GridIntensityResponse"];
export type ForecastHorizon = "24h" | "48h";
type Surplus = NonNullable<GridIntensityData["surplus"]>;
/** GB only, since it comes from NESO's forecast. */
export type SuggestedWindow = NonNullable<
  NonNullable<NonNullable<Surplus["derived"]>["suggested"]>["window"]
>;

export interface IntensityQuery {
  /** Electricity Maps zone code, e.g. `"FR"`. Skip it to auto-detect the visitor's location. */
  zone?: string;
  /** UK postcode, e.g. `"SW1A"`. Wins over `zone` if both are set. */
  postcode?: string;
  /** UK DNO region ID (1-14). */
  regionid?: number;
  /** Include `surplus` on GB responses. Pass a job length in minutes to size the suggested window (default 30). */
  surplus?: boolean | number;
}

export interface GridAwareClient {
  /** The current period only - no `forecast` array. */
  getCurrentIntensity(query?: IntensityQuery): Promise<GridIntensityData>;
  /** Same response shape, but with `forecast` populated for the requested window. Default: `"24h"`. */
  getForecast(query?: IntensityQuery & { horizon?: ForecastHorizon }): Promise<GridIntensityData>;
  /** Undefined outside GB, or when the forecast is unavailable. `durationMinutes` defaults to 30. */
  getSuggestedWindow(
    query?: Omit<IntensityQuery, "surplus"> & { durationMinutes?: number },
  ): Promise<SuggestedWindow | undefined>;
  /**
   * When to start a job, as an ISO 8601 UTC timestamp, from `/v2/suggest`. Works in every zone.
   * Never earlier than now, and the current time when the forecast is unavailable.
   * `durationMinutes` defaults to 30. `withinMinutes` limits how far ahead to look (default: 48 hours).
   * `goodEnoughBand` returns the earliest window at or below that band instead of the cleanest.
   */
  getSuggestedISOTimestamp(
    query?: Omit<IntensityQuery, "surplus"> & { durationMinutes?: number; withinMinutes?: number; goodEnoughBand?: "low" | "moderate" | "high" },
  ): Promise<string>;
}

/** A typed fetch client for a grid-aware worker's API. */
export function createGridAwareClient(baseUrl: string): GridAwareClient {
  const client = createClient<paths>({ baseUrl });

  async function fetchIntensity(
    query: IntensityQuery & { horizon: "latest" | ForecastHorizon },
  ): Promise<GridIntensityData> {
    const { data, error } = await client.GET("/v2/intensity", {
      params: {
        query: {
          ...query,
          surplus: typeof query.surplus === "number" ? query.surplus : query.surplus ? "true" : undefined,
        },
      },
    });
    if (error || !data) throw new Error("grid-aware: failed to fetch intensity data");
    return data;
  }

  return {
    getCurrentIntensity: (query = {}) => fetchIntensity({ ...query, horizon: "latest" }),
    getForecast: ({ horizon = "24h", ...query } = {}) => fetchIntensity({ ...query, horizon }),
    // The worker adds the window from its own 48h fetch, so the cheaper "latest" request is enough.
    getSuggestedWindow: async ({ durationMinutes, ...query } = {}) => {
      const data = await fetchIntensity({ ...query, horizon: "latest", surplus: durationMinutes ?? true });
      return data.surplus?.derived?.suggested?.window;
    },
    getSuggestedISOTimestamp: async ({ durationMinutes, withinMinutes, goodEnoughBand, ...query } = {}) => {
      const { data, error } = await client.GET("/v2/suggest", {
        params: { query: { ...query, duration: durationMinutes, within: withinMinutes, band: goodEnoughBand } },
      });
      if (error || !data) throw new Error("grid-aware: failed to fetch a suggested time");
      return data.start;
    },
  };
}
