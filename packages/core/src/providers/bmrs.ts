import { fetchJson } from "./http.js";

const BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1";

/** The surplus is optional, so a slow BMRS mustn't hold up the intensity response. */
const TIMEOUT_MS = 3000;

export interface BmrsSurplusDaily {
  forecastDate: string;
  publishTime: string;
  surplus: number;
}

export interface BmrsDemandDaily {
  forecastDate: string;
  nationalDemand: number;
}

interface BmrsResponse<T> {
  data: T[];
}

/** Fetches a BMRS API path as JSON, giving up after TIMEOUT_MS. */
function get<T>(path: string): Promise<T> {
  return fetchJson<T>(`${BASE_URL}${path}`, "bmrs", "Elexon BMRS API", {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

/** OCNMFD: daily peak generating plant surplus for D+2 to D+14. */
export function getDailySurplus(): Promise<BmrsResponse<BmrsSurplusDaily>> {
  return get<BmrsResponse<BmrsSurplusDaily>>("/forecast/surplus/daily?format=json");
}

/** NDFD: daily peak national demand forecast for D+1 to D+14. */
export function getDailyDemand(): Promise<BmrsResponse<BmrsDemandDaily>> {
  return get<BmrsResponse<BmrsDemandDaily>>("/forecast/demand/daily?format=json");
}
