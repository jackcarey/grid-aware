import { withAttribution } from "../../../worker/src/attribution.js";
import { buildSurplus, normalizeNesoNational, normalizeNesoRegional } from "../../../worker/src/normalize.js";
import {
  getNationalIntensity,
  getRegionalByPostcode,
  getRegionalByRegionId,
  getRegionalNational,
  type NesoRegion,
  type NesoRegionalResponse,
} from "../../../worker/src/providers/neso.js";
import type { GridIntensityResponse } from "../../../worker/src/types.js";

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

/** Returns the same shape as the `/v2/intensity` API. `location` is GB, a region id (1-14), a region name or a postcode. */
export async function queryNeso(location: string, { windowMinutes }: NesoOptions = {}): Promise<GridIntensityResponse> {
  // The window is chosen from the half-hourly forecast, which only the 48h request returns.
  const horizon = windowMinutes === undefined ? "latest" : "48h";
  const input = location.trim();
  const gb = { zone: "GB", region: { unknown: true } };

  const { forecast, ...body } =
    input.toUpperCase() === "GB"
      ? normalizeNesoNational((await getNationalIntensity(horizon)).data, gb)
      : normalizeNesoRegional(await findRegion(input, horizon), gb);
  if (windowMinutes === undefined) return withAttribution({ ...body, forecast });

  // The series was only needed to pick the window, so it isn't printed.
  const surplus = buildSurplus({ demand: [], next48h: forecast, durationMinutes: windowMinutes });
  return withAttribution(surplus ? { ...body, surplus } : body);
}
