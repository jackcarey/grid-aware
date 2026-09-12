import { describe, expect, it } from "vitest";
import {
  normalizeElectricityMapsForecast,
  normalizeElectricityMapsLatest,
  normalizeNesoNational,
  normalizeNesoRegional,
} from "../src/normalize.js";

describe("normalizeElectricityMapsLatest", () => {
  it("maps the raw shape and buckets a band", () => {
    const result = normalizeElectricityMapsLatest(
      { zone: "FR", carbonIntensity: 42, datetime: "2026-01-01T00:00:00.000Z" },
      { zone: "FR", region: { unknown: true } },
    );
    expect(result.source).toBe("electricitymaps");
    expect(result.location).toEqual({ zone: "FR", region: { unknown: true } });
    expect(result.carbonIntensity.value).toBe(42);
    expect(result.carbonIntensity.band).toBe("low");
    expect(result.fallback).toBeUndefined();
  });

  it("attaches a fallback reason when provided", () => {
    const result = normalizeElectricityMapsLatest(
      { zone: "GB", carbonIntensity: 200, datetime: "2026-01-01T00:00:00.000Z" },
      { zone: "GB", region: { unknown: true } },
      "NESO restricted",
    );
    expect(result.fallback).toEqual({ reason: "NESO restricted" });
  });
});

describe("normalizeElectricityMapsForecast", () => {
  it("uses the first forecast entry", () => {
    const result = normalizeElectricityMapsForecast(
      { zone: "FR", forecast: [{ datetime: "2026-01-01T01:00:00.000Z", carbonIntensity: 500 }] },
      { zone: "FR", region: { unknown: true } },
    );
    expect(result.carbonIntensity.type).toBe("forecast");
    expect(result.carbonIntensity.band).toBe("very-high");
  });

  it("throws when forecast is empty", () => {
    expect(() =>
      normalizeElectricityMapsForecast(
        { zone: "FR", forecast: [] },
        { zone: "FR", region: { unknown: true } },
      ),
    ).toThrow();
  });
});

describe("normalizeNesoNational", () => {
  it("prefers actual over forecast and passes through the index", () => {
    const result = normalizeNesoNational(
      {
        from: "2026-01-01T00:00Z",
        to: "2026-01-01T00:30Z",
        intensity: { actual: 80, forecast: 90, index: "low" },
      },
      { zone: "GB", region: { unknown: true } },
    );
    expect(result.source).toBe("neso");
    expect(result.carbonIntensity.value).toBe(80);
    expect(result.carbonIntensity.type).toBe("actual");
    expect(result.carbonIntensity.band).toBe("low");
  });

  it("falls back to forecast when actual is absent", () => {
    const result = normalizeNesoNational(
      {
        from: "2026-01-01T00:00Z",
        to: "2026-01-01T00:30Z",
        intensity: { forecast: 90, index: "moderate" },
      },
      { zone: "GB", region: { unknown: true } },
    );
    expect(result.carbonIntensity.value).toBe(90);
    expect(result.carbonIntensity.type).toBe("forecast");
  });
});

describe("normalizeNesoRegional", () => {
  it("includes region info and generation mix", () => {
    const result = normalizeNesoRegional(
      { regionid: 13, dnoregion: "London", shortname: "London", data: [] },
      {
        from: "2026-01-01T00:00Z",
        to: "2026-01-01T00:30Z",
        intensity: { forecast: 120, index: "moderate" },
        generationmix: [{ fuel: "wind", perc: 30 }],
      },
      { zone: "GB", region: { unknown: true } },
    );
    expect(result.location).toEqual({
      zone: "GB",
      region: { id: 13, name: "London", unknown: false },
    });
    expect(result.generationMix).toEqual([{ fuel: "wind", percentage: 30 }]);
  });
});
