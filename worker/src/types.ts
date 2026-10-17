import type { ElectricityMapsZones } from "./providers/electricityMaps.js";

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

export interface BmrsSurplusDay {
  date: string;
  surplus: number;
}

export type SourceName = "neso" | "electricitymaps" | "co2js" | "bmrs";

export interface Attribution {
  source: SourceName;
  text: string;
  licence: string;
  url: string;
}

export interface BmrsSurplus {
  unit: "MW";
  publishTime: string;
  forecast: BmrsSurplusDay[];
}

export interface DerivedSurplusDay {
  date: string;
  /** Absent when BMRS has no demand forecast for this date. */
  percentageOfDemand?: number;
  /** 1 = the best day in this forecast window. Tied days share a rank. */
  dayRank: number;
}

export interface SuggestedWindow {
  from: string;
  to: string;
  averageIntensity: number;
  unit: "gCO2eq/kWh";
}

export interface SuggestedDay {
  date: string;
  surplus: number;
  percentageOfDemand?: number;
}

export interface SuggestedCompute {
  window?: SuggestedWindow;
  day?: SuggestedDay;
}

export interface DerivedSurplus {
  forecast?: DerivedSurplusDay[];
  regional?: { renewablePercentage: number };
  suggested?: SuggestedCompute;
}

export interface Surplus {
  bmrs?: BmrsSurplus;
  derived: DerivedSurplus;
}

export interface GridIntensityResponse {
  source: "electricitymaps" | "neso" | "co2js";
  location: RequestedLocation;
  datetime: string;
  validTo?: string;
  carbonIntensity: CarbonIntensity;
  generationMix?: GenerationMixEntry[];
  /** Absent for horizon=latest, which has no series to show. */
  forecast?: ForecastPoint[];
  /** GB only: Electricity Maps and CO2.js responses never carry it. */
  surplus?: Surplus;
  /** One entry per source whose data is in this response. */
  attribution: Attribution[];
  fallback?: Fallback;
}

/** A response before its attribution is worked out from what's in it. */
export type IntensityBody = Omit<GridIntensityResponse, "attribution">;

export interface ZoneListResponse {
  zones: ElectricityMapsZones;
  attribution: Attribution[];
}

export interface ZoneListEntry {
  zoneKey: string;
  countryName?: string;
  zoneName?: string;
}

export type Horizon = "latest" | "24h" | "48h";
export type SourcePreference = "auto" | "electricitymaps" | "neso";
