import { withAttribution } from "../../../worker/src/attribution.js";
import { buildSurplus, normalizeNesoNational, normalizeNesoRegional } from "../../../worker/src/normalize.js";
import {
  getNationalIntensity,
  getRegionalByPostcode,
  getRegionalByRegionId,
  getRegionalNational,
} from "../../../worker/src/providers/neso.js";
import type { GridIntensityResponse, IntensityBody } from "../../../worker/src/types.js";

export class BadLocationError extends Error {}

export interface NesoOptions {
  /** Job length in minutes. When set, the response carries the best window in the next 48 hours. */
  windowMinutes?: number;
}

const OUTWARD = /^[A-Z]{1,2}\d[A-Z\d]?$/;
const FULL_POSTCODE = /^([A-Z]{1,2}\d[A-Z\d]?)\d[A-Z]{2}$/;

/** Gets NESO intensity for GB, a DNO region id (1-14), a region name, or a postcode. */
export async function queryNeso(location: string, options: NesoOptions = {}): Promise<GridIntensityResponse> {
  const { windowMinutes } = options;
  // The window is picked from the half-hourly forecast, so it needs the 48h series.
  const horizon = windowMinutes === undefined ? "latest" : "48h";
  const input = location.trim();
  const upper = input.toUpperCase();
  const gb = { zone: "GB", region: { unknown: true } };

  if (upper === "GB") {
    const { data } = await getNationalIntensity(horizon);
    return finish(normalizeNesoNational(data, gb), windowMinutes);
  }

  if (/^\d+$/.test(input)) {
    const id = Number(input);
    if (id < 1 || id > 14) throw new BadLocationError(`Region id must be 1-14, got ${input}`);
    const [first] = (await getRegionalByRegionId(id, horizon)).data;
    if (!first) throw new BadLocationError(`No data for region ${id}`);
    return finish(normalizeNesoRegional(first, gb), windowMinutes);
  }

  if (/\d/.test(input)) {
    // Full postcodes are cut to the outward code NESO expects.
    const compact = upper.replace(/\s+/g, "");
    const outward = upper.includes(" ") ? (upper.split(/\s+/)[0] ?? upper) : (FULL_POSTCODE.exec(compact)?.[1] ?? compact);
    if (!OUTWARD.test(outward)) throw new BadLocationError(`Unrecognised location: ${input}`);
    const [first] = (await getRegionalByPostcode(outward, horizon)).data;
    if (!first) throw new BadLocationError(`No region found for postcode ${outward}`);
    return finish(normalizeNesoRegional(first, gb), windowMinutes);
  }

  const { data } = await getRegionalNational(horizon);
  const wanted = input.toLowerCase();
  const match = data.find((r) => r.shortname.toLowerCase() === wanted || r.dnoregion.toLowerCase() === wanted);
  if (!match) {
    const names = data.map((r) => `${r.regionid} ${r.shortname}`).join(", ");
    throw new BadLocationError(`Unknown region "${input}". Regions: ${names}`);
  }
  return finish(normalizeNesoRegional(match, gb), windowMinutes);
}

/** Adds the suggested window when asked for. The 48h series it came from isn't part of the output. */
function finish(body: IntensityBody, windowMinutes: number | undefined): GridIntensityResponse {
  if (windowMinutes === undefined) return withAttribution(body);
  const { forecast, ...rest } = body;
  const surplus = buildSurplus({ demand: [], next48h: forecast, durationMinutes: windowMinutes });
  return withAttribution(surplus ? { ...rest, surplus } : rest);
}
