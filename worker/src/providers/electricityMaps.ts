import { UpstreamError } from "../errors.js";
import type { Horizon } from "../types.js";

const BASE_URL = "https://api.electricitymap.org/v3";

export interface ElectricityMapsLatest {
  zone: string;
  carbonIntensity: number;
  datetime: string;
  updatedAt?: string;
  emissionFactorType?: string;
}

export interface ElectricityMapsForecastEntry {
  datetime: string;
  carbonIntensity: number;
}

export interface ElectricityMapsForecast {
  zone: string;
  forecast: ElectricityMapsForecastEntry[];
  updatedAt?: string;
}

export interface ElectricityMapsZone {
  zoneName?: string;
  countryName?: string;
}

export type ElectricityMapsZones = Record<string, ElectricityMapsZone>;

/** How many hours of forecast to request for a horizon. */
function horizonToHours(horizon: Horizon): number {
  switch (horizon) {
    case "24h":
      return 24;
    case "48h":
      return 48;
    default:
      return 24;
  }
}

/** Fetches an Electricity Maps API path as JSON, throwing UpstreamError if it fails. */
async function get<T>(token: string, path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await fetch(url, { headers: { "auth-token": token } });
  } catch (cause) {
    throw new UpstreamError("Failed to reach Electricity Maps", "electricitymaps");
  }

  if (!response.ok) {
    throw new UpstreamError(
      `Electricity Maps responded with ${response.status}`,
      "electricitymaps",
    );
  }

  return (await response.json()) as T;
}

/** Fetches the latest carbon intensity for a zone. */
export function getLatestIntensity(token: string, zone: string): Promise<ElectricityMapsLatest> {
  return get<ElectricityMapsLatest>(token, "/carbon-intensity/latest", { zone });
}

/** Fetches a zone's carbon intensity forecast for the horizon. */
export function getForecast(
  token: string,
  zone: string,
  horizon: Horizon,
): Promise<ElectricityMapsForecast> {
  return get<ElectricityMapsForecast>(token, "/carbon-intensity/forecast", {
    zone,
    horizon: String(horizonToHours(horizon)),
  });
}

/** Fetches the list of zones Electricity Maps supports. */
export function listZones(token: string): Promise<ElectricityMapsZones> {
  return get<ElectricityMapsZones>(token, "/zones", {});
}
