export type Band = "low" | "moderate" | "high" | "very-high" | "unknown";

export interface RegionInfo {
  id?: number;
  name?: string;
  nation?: "England" | "Scotland" | "Wales";
  /** True when none of id/name/nation could be determined for this request. */
  unknown: boolean;
}

export interface RequestedLocation {
  zone: string;
  region: RegionInfo;
}

export interface CarbonIntensity {
  value: number | null;
  unit: "gCO2eq/kWh";
  type: "actual" | "forecast" | "estimated" | "unknown";
  band: Band;
}

export interface GenerationMixEntry {
  fuel: string;
  percentage: number;
}

export interface Fallback {
  reason: string;
}

export interface ForecastPoint {
  datetime: string;
  validTo?: string;
  value: number | null;
  type: CarbonIntensity["type"];
  band: Band;
  generationMix?: GenerationMixEntry[];
}

export interface GridIntensityResponse {
  source: "electricitymaps" | "neso";
  location: RequestedLocation;
  datetime: string;
  validTo?: string;
  carbonIntensity: CarbonIntensity;
  generationMix?: GenerationMixEntry[];
  /** Absent for horizon=latest, which has no series to show. */
  forecast?: ForecastPoint[];
  fallback?: Fallback;
}

export interface ZoneListEntry {
  zoneKey: string;
  countryName?: string;
  zoneName?: string;
}

export type Horizon = "latest" | "24h" | "48h";
export type SourcePreference = "auto" | "electricitymaps" | "neso";
