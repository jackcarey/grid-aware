import { buildSurplus, normalizeNesoNational, normalizeNesoRegional } from "grid-aware-core/normalize";
import {
  getNationalIntensity,
  getRegionalByPostcode,
  getRegionalByRegionId,
  getRegionalNational,
  type NesoRegion,
  type NesoRegionalResponse,
} from "grid-aware-core/providers/neso";

/** A record in the shape `grid-intensity` prints, so scripts can read every provider the same way. */
export interface GwfRecord {
  emissions_type: "average";
  metric_type: "absolute";
  provider: "NESO";
  /** The region name, or GB for the national figure. */
  location: string;
  units: "gCO2e per kWh";
  valid_from: string;
  valid_to: string;
  value: number;
  /** True for forecasts, false for measured values. */
  is_estimated: boolean;
}

/** Separate from upstream failures so the CLI can exit 2 for bad input and 1 for a failed request. */
export class BadLocationError extends Error {}

/** Options for {@link queryNeso}. */
export interface NesoOptions {
  /** Job length. Setting it adds the best window in the next 48 hours. */
  windowMinutes?: number;
}

/** NESO only takes the outward part, so a full postcode is cut down to it. */
const POSTCODE = /^([A-Z]{1,2}\d[A-Z\d]?)(?:\s*\d[A-Z]{2})?$/;

/** The single-region endpoints still return a list, which is empty for a postcode NESO doesn't know. */
function onlyRegion({ data }: NesoRegionalResponse, location: string): NesoRegion {
  const [region] = data;
  if (!region) throw new BadLocationError(`No data for ${location}`);
  return region;
}

/** A number is a region id, anything else with a digit is a postcode, and the rest is a region name. */
async function findRegion(input: string, horizon: "latest" | "48h"): Promise<NesoRegion> {
  if (/^\d+$/.test(input)) {
    const id = Number(input);
    if (id < 1 || id > 14) throw new BadLocationError(`Region id must be 1-14, got ${input}`);
    return onlyRegion(await getRegionalByRegionId(id, horizon), input);
  }

  if (/\d/.test(input)) {
    const outward = POSTCODE.exec(input.toUpperCase())?.[1];
    if (!outward) throw new BadLocationError(`Unrecognised location: ${input}`);
    return onlyRegion(await getRegionalByPostcode(outward, horizon), outward);
  }

  const { data } = await getRegionalNational(horizon);
  const name = input.toLowerCase();
  const match = data.find((r) => r.shortname.toLowerCase() === name || r.dnoregion.toLowerCase() === name);
  if (!match) {
    const names = data.map((r) => `${r.regionid} ${r.shortname}`).join(", ");
    throw new BadLocationError(`Unknown region "${input}". Regions: ${names}`);
  }
  return match;
}

/**
 * `location` is GB, a region id (1-14), a region name or a postcode. Returns the current period, or
 * with `windowMinutes` the best window instead, since `grid-intensity`'s shape has no field for both.
 */
export async function queryNeso(location: string, { windowMinutes }: NesoOptions = {}): Promise<GwfRecord[]> {
  // The window is chosen from the half-hourly forecast, which only the 48h request returns.
  const horizon = windowMinutes === undefined ? "latest" : "48h";
  const input = location.trim();
  const gb = { zone: "GB", region: { unknown: true } };

  const body =
    input.toUpperCase() === "GB"
      ? normalizeNesoNational((await getNationalIntensity(horizon)).data, gb)
      : normalizeNesoRegional(await findRegion(input, horizon), gb);
  const place = body.location.region.name ?? "GB";
  const record = (from: string, to: string, value: number, estimated: boolean): GwfRecord => ({
    emissions_type: "average",
    metric_type: "absolute",
    provider: "NESO",
    location: place,
    units: "gCO2e per kWh",
    valid_from: from,
    valid_to: to,
    value,
    is_estimated: estimated,
  });

  if (windowMinutes === undefined) {
    const { value, type } = body.carbonIntensity;
    if (value === null) throw new Error("NESO has no intensity for this period");
    return [record(body.datetime, body.validTo ?? body.datetime, value, type !== "actual")];
  }
  const window = buildSurplus({ demand: [], next48h: body.forecast, durationMinutes: windowMinutes })?.derived
    .suggested?.window;
  if (!window) throw new Error("NESO's forecast is too short for a window that long");
  return [record(window.from, window.to, window.averageIntensity, true)];
}
