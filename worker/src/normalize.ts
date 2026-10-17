import { bandFromNesoIndex, bandFromValue } from "./bands.js";
import { UpstreamError } from "./errors.js";
import type { BmrsDemandDaily, BmrsSurplusDaily } from "./providers/bmrs.js";
import type { ElectricityMapsForecast, ElectricityMapsLatest } from "./providers/electricityMaps.js";
import type { NesoIntensityPeriod, NesoRegion, NesoRegionalPeriod } from "./providers/neso.js";
import type {
  BmrsSurplus,
  DerivedSurplusDay,
  ForecastPoint,
  GenerationMixEntry,
  IntensityBody,
  RequestedLocation,
  SuggestedDay,
  SuggestedWindow,
  Surplus,
} from "./types.js";

/** Converts BMRS's daily surplus forecast into grid-aware's shape, or undefined if there's no usable data. */
export function normalizeBmrsSurplus(surplus: readonly BmrsSurplusDaily[]): BmrsSurplus | undefined {
  const days = surplus.filter((d) => typeof d.surplus === "number" && typeof d.forecastDate === "string");
  const first = days[0];
  if (!first) return undefined;
  const publishTime = days.reduce((latest, d) => (d.publishTime > latest ? d.publishTime : latest), first.publishTime);
  return {
    unit: "MW",
    publishTime,
    forecast: days.map((d) => ({ date: d.forecastDate, surplus: d.surplus })),
  };
}

/**
 * Gives each day its surplus as a share of demand, since raw MW means different things in winter
 * and summer, and ranks the days by it (1 = best, ties share a rank). Raw MW is only ranked when no
 * day has a demand forecast, since mixing the two would favour whichever days happen to lack one.
 */
export function deriveSurplusDays(
  bmrs: BmrsSurplus,
  demand: readonly BmrsDemandDaily[],
): DerivedSurplusDay[] {
  const demandByDate = new Map(demand.map((d) => [d.forecastDate, d.nationalDemand]));
  const shares = bmrs.forecast.map((day) => {
    const dayDemand = demandByDate.get(day.date);
    return typeof dayDemand === "number" && dayDemand > 0
      ? Math.round((day.surplus / dayDemand) * 1000) / 10
      : undefined;
  });
  const byShare = shares.some((share) => share !== undefined);
  const scores = bmrs.forecast.map((day, i) =>
    byShare ? (shares[i] ?? Number.NEGATIVE_INFINITY) : day.surplus,
  );
  return bmrs.forecast.map((day, i) => {
    const share = shares[i];
    const score = scores[i] ?? Number.NEGATIVE_INFINITY;
    return {
      date: day.date,
      ...(share !== undefined && { percentageOfDemand: share }),
      dayRank: 1 + scores.filter((other) => other > score).length,
    };
  });
}

const RENEWABLE_FUELS = new Set(["wind", "solar", "hydro"]);

/** NESO has no regional surplus figure, so a high renewable share stands in for "likely excess here". */
export function renewablePercentage(mix: readonly GenerationMixEntry[]): number {
  const total = mix
    .filter((entry) => RENEWABLE_FUELS.has(entry.fuel))
    .reduce((sum, entry) => sum + entry.percentage, 0);
  return Math.round(total * 10) / 10;
}

/** NESO forecasts in half-hour periods. */
const PERIOD_MINUTES = 30;

/**
 * The lowest-intensity run of consecutive periods long enough for a job, with the earliest run
 * winning a tie. Its `from` can be the start of the period already under way, meaning "now".
 */
export function bestWindow(
  points: readonly ForecastPoint[],
  durationMinutes: number,
): SuggestedWindow | undefined {
  const size = Math.ceil(durationMinutes / PERIOD_MINUTES);
  let best: { run: readonly ForecastPoint[]; total: number } | undefined;
  for (let start = 0; start + size <= points.length; start++) {
    const run = points.slice(start, start + size);
    if (run.some((p) => p.value === null)) continue;
    const total = run.reduce((sum, p) => sum + (p.value ?? 0), 0);
    if (!best || total < best.total) best = { run, total };
  }
  const first = best?.run[0];
  const last = best?.run.at(-1);
  if (!best || !first || !last) return undefined;
  return {
    from: first.datetime,
    to: last.validTo ?? last.datetime,
    averageIntensity: Math.round(best.total / size),
    unit: "gCO2eq/kWh",
  };
}

/** The top-ranked day, taking the soonest when days tie. */
export function bestDay(bmrs: BmrsSurplus, days: readonly DerivedSurplusDay[]): SuggestedDay | undefined {
  // YYYY-MM-DD dates sort as strings, so this holds whatever order BMRS lists days in.
  const best = days
    .filter((d) => d.dayRank === 1)
    .reduce<DerivedSurplusDay | undefined>((soonest, d) => (!soonest || d.date < soonest.date ? d : soonest), undefined);
  const day = best && bmrs.forecast.find((d) => d.date === best.date);
  if (!best || !day) return undefined;
  return {
    date: day.date,
    surplus: day.surplus,
    ...(best.percentageOfDemand !== undefined && { percentageOfDemand: best.percentageOfDemand }),
  };
}

export interface SurplusInputs {
  bmrs?: BmrsSurplus;
  demand: readonly BmrsDemandDaily[];
  /** Only regional responses have a mix, so only they get the regional proxy. */
  regionalMix?: readonly GenerationMixEntry[];
  /** The next 48 hours of half-hourly intensity for the same place. */
  next48h?: readonly ForecastPoint[];
  durationMinutes: number;
}

/** Assembles the `surplus` field. Returns undefined when there's nothing to report. */
export function buildSurplus(input: SurplusInputs): Surplus | undefined {
  const { bmrs, demand, regionalMix, next48h, durationMinutes } = input;
  const forecast = bmrs && deriveSurplusDays(bmrs, demand);
  const window = next48h && bestWindow(next48h, durationMinutes);
  const day = bmrs && forecast && bestDay(bmrs, forecast);
  if (!bmrs && !regionalMix && !window) return undefined;
  return {
    ...(bmrs && { bmrs }),
    derived: {
      ...(forecast && { forecast }),
      ...(regionalMix && { regional: { renewablePercentage: renewablePercentage(regionalMix) } }),
      ...((window || day) && { suggested: { ...(window && { window }), ...(day && { day }) } }),
    },
  };
}

/** Converts Electricity Maps' latest reading into a grid-aware response. */
export function normalizeElectricityMapsLatest(
  raw: ElectricityMapsLatest,
  location: RequestedLocation,
  fallbackReason?: string,
): IntensityBody {
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

/** Converts Electricity Maps' forecast into a grid-aware response, led by its first entry. */
export function normalizeElectricityMapsForecast(
  raw: ElectricityMapsForecast,
  location: RequestedLocation,
  fallbackReason?: string,
): IntensityBody {
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

/** Converts one NESO national period into a forecast point. */
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

/** Converts NESO national periods into a grid-aware response, led by the first period. */
export function normalizeNesoNational(
  periods: readonly NesoIntensityPeriod[],
  location: RequestedLocation,
): IntensityBody {
  const first = periods[0];
  if (!first) {
    throw new UpstreamError("NESO returned no national intensity data", "neso");
  }
  const value = first.intensity.actual ?? first.intensity.forecast;
  if (value === undefined) {
    throw new UpstreamError("NESO period had neither actual nor forecast intensity", "neso");
  }
  const response: IntensityBody = {
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

/** Converts one NESO regional period into a forecast point, with its fuel mix. */
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

/** Converts a NESO region's periods into a grid-aware response, with the region's ID and name. */
export function normalizeNesoRegional(
  region: NesoRegion,
  location: RequestedLocation,
): IntensityBody {
  const first = region.data[0];
  if (!first) {
    throw new UpstreamError("NESO returned no regional intensity data", "neso");
  }
  const response: IntensityBody = {
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
