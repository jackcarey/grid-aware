// @ts-expect-error no published types
import datasets from "@tgwf/co2/data/electricity-maps";
import { bandFromValue } from "../bands.js";
import type { GridIntensityResponse, Horizon } from "../types.js";
import type { ElectricityMapsZones } from "./electricityMaps.js";

interface YearlyZone {
  zone: { zoneName?: string; countryName?: string };
  carbonIntensity: { value: number };
}

const YEAR = Math.max(
  ...Object.keys(datasets).map((key) => Number(key.replace("yearly", ""))),
);
const data = datasets[`yearly${YEAR}`].data as Record<string, YearlyZone>;

export function annualIntensity(
  zone: string,
  horizon: Horizon,
  reason: string,
): GridIntensityResponse | undefined {
  const entry = data[zone];
  if (!entry) return undefined;
  const value = entry.carbonIntensity.value;
  const noForecast = horizon === "latest" ? "" : ", no forecast available";
  return {
    source: "co2js",
    location: { zone, region: { unknown: true } },
    datetime: `${YEAR}-01-01T00:00:00.000Z`,
    validTo: `${YEAR + 1}-01-01T00:00:00.000Z`,
    carbonIntensity: { value, unit: "gCO2eq/kWh", type: "estimated", band: bandFromValue(value) },
    // ODbL requires crediting Electricity Maps.
    fallback: {
      reason: `${reason}; showing Electricity Maps' ${YEAR} annual average via CO2.js${noForecast}`,
    },
  };
}

export function listZones(): ElectricityMapsZones {
  return Object.fromEntries(
    Object.entries(data).map(([key, { zone }]) => [
      key,
      { zoneName: zone.zoneName, countryName: zone.countryName },
    ]),
  );
}
