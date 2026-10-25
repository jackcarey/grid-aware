import createClient from "openapi-fetch";
import type { components, paths } from "./client.gen.js";

/** `/v2/intensity` API response. */
export type GridIntensityData = components["schemas"]["GridIntensityResponse"];
export type ForecastHorizon = "24h" | "48h";
type Surplus = NonNullable<GridIntensityData["surplus"]>;
/** The best time in the next 48 hours to run a job of a given length. GB only. */
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
  /**
   * The lowest-carbon time in the next 48 hours to run a job of `durationMinutes` (default 30).
   * Undefined outside GB, or when no window could be worked out.
   */
  getSuggestedWindow(
    query?: Omit<IntensityQuery, "surplus"> & { durationMinutes?: number },
  ): Promise<SuggestedWindow | undefined>;
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
    // The worker fetches the 48h series itself, so the cheap "latest" request is enough.
    getSuggestedWindow: async ({ durationMinutes, ...query } = {}) => {
      const data = await fetchIntensity({ ...query, horizon: "latest", surplus: durationMinutes ?? true });
      return data.surplus?.derived?.suggested?.window;
    },
  };
}
