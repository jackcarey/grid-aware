import { bandFromNesoIndex, bandFromValue } from "./bands.js";
import { UpstreamError } from "./errors.js";
import type { ElectricityMapsForecast, ElectricityMapsLatest } from "./providers/electricityMaps.js";
import type { NesoIntensityPeriod, NesoRegion, NesoRegionalPeriod } from "./providers/neso.js";
import type { ForecastPoint, GridIntensityResponse, RequestedLocation } from "./types.js";

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
    forecast: raw.forecast.map((entry) => ({
      datetime: entry.datetime,
      value: entry.carbonIntensity,
      type: "forecast" as const,
      band: bandFromValue(entry.carbonIntensity),
    })),
    ...(fallbackReason ? { fallback: { reason: fallbackReason } } : {}),
  };
}

function nesoForecastPoint(period: NesoIntensityPeriod): ForecastPoint {
  const value = period.intensity.actual ?? period.intensity.forecast;
  return {
    datetime: period.from,
    validTo: period.to,
    value: value ?? null,
    type: period.intensity.actual !== undefined ? "actual" : value === undefined ? "unknown" : "forecast",
    band: value === undefined ? "unknown" : bandFromNesoIndex(period.intensity.index),
  };
}

export function normalizeNesoNational(
  periods: readonly NesoIntensityPeriod[],
  location: RequestedLocation,
): GridIntensityResponse {
  const first = periods[0];
  if (!first) {
    throw new UpstreamError("NESO returned no national intensity data", "neso");
  }
  const value = first.intensity.actual ?? first.intensity.forecast;
  if (value === undefined) {
    throw new UpstreamError("NESO period had neither actual nor forecast intensity", "neso");
  }
  const response: GridIntensityResponse = {
    source: "neso",
    location,
    datetime: first.from,
    validTo: first.to,
    carbonIntensity: {
      value,
      unit: "gCO2eq/kWh",
      type: first.intensity.actual !== undefined ? "actual" : "forecast",
      band: bandFromNesoIndex(first.intensity.index),
    },
  };
  if (periods.length > 1) {
    response.forecast = periods.map(nesoForecastPoint);
  }
  return response;
}

function nesoRegionalForecastPoint(period: NesoRegionalPeriod): ForecastPoint {
  return {
    datetime: period.from,
    validTo: period.to,
    value: period.intensity.forecast,
    type: "forecast",
    band: bandFromNesoIndex(period.intensity.index),
    generationMix: period.generationmix.map((entry) => ({
      fuel: entry.fuel,
      percentage: entry.perc,
    })),
  };
}

export function normalizeNesoRegional(
  region: NesoRegion,
  location: RequestedLocation,
): GridIntensityResponse {
  const first = region.data[0];
  if (!first) {
    throw new UpstreamError("NESO returned no regional intensity data", "neso");
  }
  const response: GridIntensityResponse = {
    source: "neso",
    location: {
      ...location,
      region: { id: region.regionid, name: region.shortname, unknown: false },
    },
    datetime: first.from,
    validTo: first.to,
    carbonIntensity: {
      value: first.intensity.forecast,
      unit: "gCO2eq/kWh",
      type: "forecast",
      band: bandFromNesoIndex(first.intensity.index),
    },
    generationMix: first.generationmix.map((entry) => ({
      fuel: entry.fuel,
      percentage: entry.perc,
    })),
  };
  if (region.data.length > 1) {
    response.forecast = region.data.map(nesoRegionalForecastPoint);
  }
  return response;
}
