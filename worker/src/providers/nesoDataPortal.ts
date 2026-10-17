import { fetchJson } from "./http.js";

const BASE_URL = "https://api.neso.energy/api/3/action";

/** "14 Days Ahead Wind Forecasts", national resource. */
const WIND_RESOURCE_ID = "93c3048e-1dab-4057-a2a9-417540583929";

/** The wind share is optional, so a slow portal mustn't hold up the intensity response. */
const TIMEOUT_MS = 3000;

/** A day has 46-50 half-hours around clock changes. Fewer means the forecast only covers part of it. */
const MIN_PERIODS_PER_DAY = 46;

export interface NesoDailyWind {
  date: string;
  windPercentageOfCapacity: number;
}

interface WindDayRow {
  date: string;
  mw: string | number | null;
  capacity: string | number | null;
  periods: string | number;
}

/** NESO's 14-day wind forecast as each day's average share of wind capacity. Part-days are left out. */
export async function getDailyWind(): Promise<NesoDailyWind[]> {
  const sql = `SELECT "Date" AS date, AVG("Wind_Forecast") AS mw, AVG("Capacity") AS capacity, COUNT(*) AS periods FROM "${WIND_RESOURCE_ID}" GROUP BY "Date"`;
  const { result } = await fetchJson<{ result: { records: WindDayRow[] } }>(
    `${BASE_URL}/datastore_search_sql?sql=${encodeURIComponent(sql)}`,
    "neso",
    "NESO Data Portal",
    { signal: AbortSignal.timeout(TIMEOUT_MS) },
  );
  return result.records.flatMap((row) => {
    const mw = Number(row.mw);
    const capacity = Number(row.capacity);
    if (Number(row.periods) < MIN_PERIODS_PER_DAY || !(capacity > 0) || !Number.isFinite(mw)) return [];
    return [{ date: String(row.date).slice(0, 10), windPercentageOfCapacity: Math.round((mw / capacity) * 1000) / 10 }];
  });
}
