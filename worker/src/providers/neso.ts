import { UpstreamError } from "../errors.js";
import type { Horizon } from "../types.js";

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

async function get<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`);
  } catch (cause) {
    throw new UpstreamError("Failed to reach NESO Carbon Intensity API", "neso");
  }

  if (!response.ok) {
    throw new UpstreamError(`NESO responded with ${response.status}`, "neso");
  }

  return (await response.json()) as T;
}

function nesoDatetime(date: Date): string {
  return date.toISOString().slice(0, 16) + "Z";
}

function forwardSuffix(horizon: Horizon): "fw24h" | "fw48h" | undefined {
  if (horizon === "24h") return "fw24h";
  if (horizon === "48h") return "fw48h";
  return undefined;
}

export function getNationalIntensity(horizon: Horizon): Promise<NesoNationalResponse> {
  const suffix = forwardSuffix(horizon);
  if (!suffix) return get<NesoNationalResponse>("/intensity");
  return get<NesoNationalResponse>(`/intensity/${nesoDatetime(new Date())}/${suffix}`);
}

export function getRegionalNational(horizon: Horizon): Promise<NesoRegionalResponse> {
  const suffix = forwardSuffix(horizon);
  if (!suffix) return get<NesoRegionalResponse>("/regional");
  return get<NesoRegionalResponse>(`/regional/intensity/${nesoDatetime(new Date())}/${suffix}`);
}

export function getRegionalByPostcode(
  postcode: string,
  horizon: Horizon,
): Promise<NesoRegionalResponse> {
  const suffix = forwardSuffix(horizon);
  const encoded = encodeURIComponent(postcode);
  if (!suffix) return get<NesoRegionalResponse>(`/regional/postcode/${encoded}`);
  return get<NesoRegionalResponse>(
    `/regional/intensity/${nesoDatetime(new Date())}/${suffix}/postcode/${encoded}`,
  );
}

export function getRegionalByRegionId(
  regionId: number,
  horizon: Horizon,
): Promise<NesoRegionalResponse> {
  const suffix = forwardSuffix(horizon);
  if (!suffix) return get<NesoRegionalResponse>(`/regional/regionid/${regionId}`);
  return get<NesoRegionalResponse>(
    `/regional/intensity/${nesoDatetime(new Date())}/${suffix}/regionid/${regionId}`,
  );
}
