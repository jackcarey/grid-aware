import { bandFromNesoIndex, bandFromValue } from "./bands.js";
import { UpstreamError } from "./errors.js";
import type { ElectricityMapsForecast, ElectricityMapsLatest } from "./providers/electricityMaps.js";
import type { NesoIntensityPeriod, NesoRegion, NesoRegionalPeriod } from "./providers/neso.js";
import type { GridIntensityResponse, RequestedLocation } from "./types.js";

export function normalizeElectricityMapsLatest(
  raw: ElectricityMapsLatest,
  location: RequestedLocation,
  fallbackReason?: string,
): GridIntensityResponse {
  return {
    source: "electricitymaps",
    location,
    datetime: raw.datetime,
    carbonIntensity: {
      value: raw.carbonIntensity,
      unit: "gCO2eq/kWh",
      type: "estimated",
      band: bandFromValue(raw.carbonIntensity),
    },
    ...(fallbackReason ? { fallback: { reason: fallbackReason } } : {}),
  };
}

export function normalizeElectricityMapsForecast(
  raw: ElectricityMapsForecast,
  location: RequestedLocation,
  fallbackReason?: string,
): GridIntensityResponse {
  const first = raw.forecast[0];
  if (!first) {
    throw new UpstreamError("Electricity Maps forecast returned no entries", "electricitymaps");
  }
  return {
    source: "electricitymaps",
    location,
    datetime: first.datetime,
    carbonIntensity: {
      value: first.carbonIntensity,
      unit: "gCO2eq/kWh",
      type: "forecast",
      band: bandFromValue(first.carbonIntensity),
    },
    ...(fallbackReason ? { fallback: { reason: fallbackReason } } : {}),
  };
}

export function normalizeNesoNational(
  period: NesoIntensityPeriod,
  location: RequestedLocation,
): GridIntensityResponse {
  const value = period.intensity.actual ?? period.intensity.forecast;
  if (value === undefined) {
    throw new UpstreamError("NESO period had neither actual nor forecast intensity", "neso");
  }
  return {
    source: "neso",
    location,
    datetime: period.from,
    validTo: period.to,
    carbonIntensity: {
      value,
      unit: "gCO2eq/kWh",
      type: period.intensity.actual !== undefined ? "actual" : "forecast",
      band: bandFromNesoIndex(period.intensity.index),
    },
  };
}

export function normalizeNesoRegional(
  region: NesoRegion,
  period: NesoRegionalPeriod,
  location: RequestedLocation,
): GridIntensityResponse {
  return {
    source: "neso",
    location: {
      ...location,
      region: { id: region.regionid, name: region.shortname, unknown: false },
    },
    datetime: period.from,
    validTo: period.to,
    carbonIntensity: {
      value: period.intensity.forecast,
      unit: "gCO2eq/kWh",
      type: "forecast",
      band: bandFromNesoIndex(period.intensity.index),
    },
    generationMix: period.generationmix.map((entry) => ({
      fuel: entry.fuel,
      percentage: entry.perc,
    })),
  };
}
