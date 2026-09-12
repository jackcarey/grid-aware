import type { Band } from "./types.js";

/**
 * NESO recalculates its index bands every year against GB's own forecast average
 * (documented in their Carbon Intensity Forecast Methodology), so there is no fixed
 * gCO2/kWh cutoff to replicate here. GB responses just pass through NESO's own
 * live `index` string instead of being recomputed from the raw value.
 */
export function bandFromNesoIndex(index: string): Band {
  switch (index.trim().toLowerCase()) {
    case "very low":
    case "low":
      return "low";
    case "moderate":
      return "moderate";
    case "high":
      return "high";
    case "very high":
      return "very-high";
    default:
      return "unknown";
  }
}

export interface BandThresholds {
  moderate: number;
  high: number;
  veryHigh: number;
}

/**
 * Electricity Maps has no official index, and worldwide grids vary a lot, so GB's bands don't
 * necessarily transfer. These are rough values, not sourced from either upstream.
 */
export const DEFAULT_BAND_THRESHOLDS: BandThresholds = {
  moderate: 100,
  high: 300,
  veryHigh: 500,
};

export function bandFromValue(
  value: number,
  thresholds: BandThresholds = DEFAULT_BAND_THRESHOLDS,
): Band {
  if (value >= thresholds.veryHigh) return "very-high";
  if (value >= thresholds.high) return "high";
  if (value >= thresholds.moderate) return "moderate";
  return "low";
}
