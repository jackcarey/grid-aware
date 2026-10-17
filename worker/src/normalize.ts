import { bandFromNesoIndex, bandFromValue } from "./bands.js";
import { UpstreamError } from "./errors.js";
import type { BmrsDemandDaily, BmrsSurplusDaily } from "./providers/bmrs.js";
import type { ElectricityMapsForecast, ElectricityMapsLatest } from "./providers/electricityMaps.js";
import type { NesoIntensityPeriod, NesoRegion, NesoRegionalPeriod } from "./providers/neso.js";
import type { NesoDailyWind } from "./providers/nesoDataPortal.js";
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

/** Wind forecasts aren't precise enough for smaller gaps to mean a day is cleaner. */
const WIND_GROUP_POINTS = 5;

/**
 * Gives each day its surplus as a share of demand, since raw MW means different things in winter
 * and summer, and its forecast wind share. Ranks days 1..n by:
 * 1. a positive surplus, so the grid isn't tight;
 * 2. wind, grouping days within WIND_GROUP_POINTS of the windiest day left;
 * 3. the highest share of demand (raw MW if no day has a demand forecast, since mixing the two
 *    would favour whichever days happen to lack one);
 * 4. the soonest date.
 */
export function deriveSurplusDays(
  bmrs: BmrsSurplus,
  demand: readonly BmrsDemandDaily[],
  wind: readonly NesoDailyWind[] = [],
): DerivedSurplusDay[] {
  const demandByDate = new Map(demand.map((d) => [d.forecastDate, d.nationalDemand]));
  const windByDate = new Map(wind.map((d) => [d.date, d.windPercentageOfCapacity]));
  const days = bmrs.forecast.map((day) => {
    const dayDemand = demandByDate.get(day.date);
    return {
      date: day.date,
      surplus: day.surplus,
      share: typeof dayDemand === "number" && dayDemand > 0
        ? Math.round((day.surplus / dayDemand) * 1000) / 10
        : undefined,
      wind: windByDate.get(day.date),
      windGroup: Number.POSITIVE_INFINITY,
    };
  });

  let group = 0;
  let groupTop = Number.POSITIVE_INFINITY;
  const windy = days
    .filter((d) => d.surplus > 0 && d.wind !== undefined)
    .sort((a, b) => (b.wind ?? 0) - (a.wind ?? 0));
  for (const day of windy) {
    if ((day.wind ?? 0) < groupTop - WIND_GROUP_POINTS) {
      group++;
      groupTop = day.wind ?? 0;
    }
    day.windGroup = group;
  }

  const byShare = days.some((d) => d.share !== undefined);
  const score = (d: (typeof days)[number]) => (byShare ? (d.share ?? Number.NEGATIVE_INFINITY) : d.surplus);
  const ranked = [...days].sort(
    (a, b) =>
      Number(b.surplus > 0) - Number(a.surplus > 0) ||
      (a.windGroup === b.windGroup ? 0 : a.windGroup < b.windGroup ? -1 : 1) ||
      (score(a) === score(b) ? 0 : score(a) > score(b) ? -1 : 1) ||
      a.date.localeCompare(b.date),
  );

  return days.map((day) => ({
    date: day.date,
    ...(day.share !== undefined && { percentageOfDemand: day.share }),
    ...(day.wind !== undefined && { windPercentageOfCapacity: day.wind }),
    dayRank: ranked.indexOf(day) + 1,
  }));
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

/** The day ranked 1. */
export function bestDay(bmrs: BmrsSurplus, days: readonly DerivedSurplusDay[]): SuggestedDay | undefined {
  const best = days.find((d) => d.dayRank === 1);
  const day = best && bmrs.forecast.find((d) => d.date === best.date);
  if (!best || !day) return undefined;
  return {
    date: day.date,
    surplus: day.surplus,
    ...(best.percentageOfDemand !== undefined && { percentageOfDemand: best.percentageOfDemand }),
    ...(best.windPercentageOfCapacity !== undefined && { windPercentageOfCapacity: best.windPercentageOfCapacity }),
  };
}

export interface SurplusInputs {
  bmrs?: BmrsSurplus;
  demand: readonly BmrsDemandDaily[];
  wind?: readonly NesoDailyWind[];
  /** Only regional responses have a mix, so only they get the regional proxy. */
  regionalMix?: readonly GenerationMixEntry[];
  /** The next 48 hours of half-hourly intensity for the same place. */
  next48h?: readonly ForecastPoint[];
  durationMinutes: number;
}

/** Assembles the `surplus` field. Returns undefined when there's nothing to report. */
export function buildSurplus(input: SurplusInputs): Surplus | undefined {
  const { bmrs, demand, wind, regionalMix, next48h, durationMinutes } = input;
  const forecast = bmrs && deriveSurplusDays(bmrs, demand, wind);
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
