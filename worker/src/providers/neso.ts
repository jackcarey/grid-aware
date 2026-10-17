import type { Horizon } from "../types.js";
import { fetchJson } from "./http.js";

const BASE_URL = "https://api.carbonintensity.org.uk";

export interface NesoIntensityPeriod {
  from: string;
  to: string;
  intensity: {
    forecast?: number;
    actual?: number;
    index: string;
  };
}

export interface NesoNationalResponse {
  data: NesoIntensityPeriod[];
}

export interface NesoGenerationMixEntry {
  fuel: string;
  perc: number;
}

export interface NesoRegionalPeriod {
  from: string;
  to: string;
  intensity: {
    forecast: number;
    index: string;
  };
  generationmix: NesoGenerationMixEntry[];
}

export interface NesoRegion {
  regionid: number;
  dnoregion: string;
  shortname: string;
  data: NesoRegionalPeriod[];
}

export interface NesoRegionalResponse {
  data: NesoRegion[];
}

/** Fetches a Carbon Intensity API path as JSON. */
function get<T>(path: string): Promise<T> {
  return fetchJson<T>(`${BASE_URL}${path}`, "neso", "NESO Carbon Intensity API");
}

/** Formats a date the way the Carbon Intensity API expects in its URLs. */
function nesoDatetime(date: Date): string {
  return date.toISOString().slice(0, 16) + "Z";
}

/** The URL suffix for a forecast horizon, or undefined for the latest period only. */
function forwardSuffix(horizon: Horizon): "fw24h" | "fw48h" | undefined {
  if (horizon === "24h") return "fw24h";
  if (horizon === "48h") return "fw48h";
  return undefined;
}

/** Fetches GB national carbon intensity for the horizon. */
export function getNationalIntensity(horizon: Horizon): Promise<NesoNationalResponse> {
  const suffix = forwardSuffix(horizon);
  if (!suffix) return get<NesoNationalResponse>("/intensity");
  return get<NesoNationalResponse>(`/intensity/${nesoDatetime(new Date())}/${suffix}`);
}

/** NESO's all-regions endpoints group data by period, not by region. */
interface NesoPeriodWithRegions {
  from: string;
  to: string;
  regions: (Omit<NesoRegion, "data"> & Omit<NesoRegionalPeriod, "from" | "to">)[];
}

/** Regroups period-first all-regions data by region, to match the single-region endpoints. */
function byRegion(periods: readonly NesoPeriodWithRegions[]): NesoRegionalResponse {
  const regions = new Map<number, NesoRegion>();
  for (const { from, to, regions: entries } of periods) {
    for (const { regionid, dnoregion, shortname, intensity, generationmix } of entries) {
      let region = regions.get(regionid);
      if (!region) {
        region = { regionid, dnoregion, shortname, data: [] };
        regions.set(regionid, region);
      }
      region.data.push({ from, to, intensity, generationmix });
    }
  }
  return { data: [...regions.values()] };
}

/** Fetches one region's data. NESO's forward endpoints return the region as an object, not a list. */
async function getOneRegion(path: string): Promise<NesoRegionalResponse> {
  const { data } = await get<{ data: NesoRegion | NesoRegion[] }>(path);
  return { data: Array.isArray(data) ? data : [data] };
}

/** Fetches carbon intensity for all 14 GB regions in one call. */
export async function getRegionalNational(horizon: Horizon): Promise<NesoRegionalResponse> {
  const suffix = forwardSuffix(horizon);
  const path = suffix ? `/regional/intensity/${nesoDatetime(new Date())}/${suffix}` : "/regional";
  return byRegion((await get<{ data: NesoPeriodWithRegions[] }>(path)).data);
}

/** Fetches carbon intensity for the region covering an outward postcode. */
export function getRegionalByPostcode(
  postcode: string,
  horizon: Horizon,
): Promise<NesoRegionalResponse> {
  const suffix = forwardSuffix(horizon);
  const encoded = encodeURIComponent(postcode);
  if (!suffix) return getOneRegion(`/regional/postcode/${encoded}`);
  return getOneRegion(`/regional/intensity/${nesoDatetime(new Date())}/${suffix}/postcode/${encoded}`);
}

/** Fetches carbon intensity for one GB region by its NESO ID. */
export function getRegionalByRegionId(
  regionId: number,
  horizon: Horizon,
): Promise<NesoRegionalResponse> {
  const suffix = forwardSuffix(horizon);
  if (!suffix) return getOneRegion(`/regional/regionid/${regionId}`);
  return getOneRegion(`/regional/intensity/${nesoDatetime(new Date())}/${suffix}/regionid/${regionId}`);
}
