import { describe, expect, it } from "vitest";
import {
  CO2JS_ATTRIBUTION,
  ELECTRICITY_MAPS_ATTRIBUTION,
  NESO_ATTRIBUTION,
  withAttribution,
} from "../src/attribution.js";
import type { IntensityBody } from "../src/types.js";

const body = (source: IntensityBody["source"], type: IntensityBody["carbonIntensity"]["type"] = "forecast"): IntensityBody => ({
  source,
  location: { zone: "GB", region: { unknown: true } },
  datetime: "2026-01-01T00:00:00.000Z",
  carbonIntensity: { value: type === "unknown" ? null : 100, unit: "gCO2eq/kWh", type, band: "moderate" },
});

describe("withAttribution", () => {
  it("credits the source that answered", () => {
    expect(withAttribution(body("neso")).attribution).toEqual([NESO_ATTRIBUTION]);
    expect(withAttribution(body("electricitymaps")).attribution).toEqual([ELECTRICITY_MAPS_ATTRIBUTION]);
    expect(withAttribution(body("co2js")).attribution).toEqual([CO2JS_ATTRIBUTION]);
  });

  it("adds Elexon when BMRS surplus data is included", () => {
    const withBmrs: IntensityBody = {
      ...body("neso"),
      surplus: { bmrs: { unit: "MW", publishTime: "2026-10-17T10:15:00Z", forecast: [] }, derived: {} },
    };
    expect(withAttribution(withBmrs).attribution.map((a) => a.source)).toEqual(["neso", "bmrs"]);
  });

  it("adds NESO's open data credit when the wind forecast is used", () => {
    const withWind: IntensityBody = {
      ...body("neso"),
      surplus: {
        bmrs: { unit: "MW", publishTime: "2026-10-17T10:15:00Z", forecast: [] },
        derived: { forecast: [{ date: "2026-10-19", windPercentageOfCapacity: 40, dayRank: 1 }] },
      },
    };
    expect(withAttribution(withWind).attribution.map((a) => a.source)).toEqual(["neso", "bmrs", "neso-data-portal"]);
  });

  it("credits no one when no data made it into the response", () => {
    expect(withAttribution(body("neso", "unknown")).attribution).toEqual([]);
  });
});
